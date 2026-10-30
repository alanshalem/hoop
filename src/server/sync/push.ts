import 'server-only';
import type { UserRole } from '@/core/domain/entities/club.types';
import { authorizeWrite } from '../auth/authorize';
import type { Database } from '../db/client';
import type { PushBody } from './api-schema';
import {
  decideEventWrite,
  dedupeEvents,
  dedupeRecords,
  isNewerThanStored,
  recordKey,
  recordWriteOperation,
  type RejectReason,
} from './merge';
import { parseEventData, parseRecordData } from './records';
import {
  findEventStates,
  findRecordStates,
  insertEventsIfNew,
  lockSyncWrites,
  notifySyncChanged,
  readCurrentCursor,
  tombstoneEvents,
  upsertRecordsLww,
  type EventWrite,
  type RecordWrite,
} from './repository';

export interface PushResult {
  /** Ids written, or already in the pushed state (idempotent event resend). */
  accepted: string[];
  rejected: { id: string; reason: RejectReason }[];
  /** Latest server seq after this push. Informational: clients advance their pull cursor only from pulls. */
  cursor: string;
}

/**
 * Applies one push in a single transaction. Each item is checked in order:
 * domain schema (INVALID), role permissions (FORBIDDEN), then the merge rule
 * (STALE). Accepted writes take a new seq; if any, `hoop_sync` is notified on
 * commit with the new cursor.
 */
export async function applyPush(db: Database, user: { role: UserRole }, body: PushBody): Promise<PushResult> {
  // Schema validation needs no database, so it runs before the write lock is taken.
  const records = dedupeRecords(body.records).map((input) => ({
    input,
    parsed: parseRecordData(input.kind, input.id, input.data),
  }));
  const events = dedupeEvents(body.events).map((input) => ({
    input,
    parsed: parseEventData(input.id, input.matchId, input.data),
  }));

  return db.transaction(async (tx) => {
    await lockSyncWrites(tx);
    const accepted: string[] = [];
    const rejected: PushResult['rejected'] = [];
    const reject = (id: string, reason: RejectReason) => rejected.push({ id, reason });

    const recordStates = await findRecordStates(
      tx,
      records.filter(({ parsed }) => parsed.ok).map(({ input }) => input)
    );
    const recordWrites: RecordWrite[] = [];
    for (const { input, parsed } of records) {
      if (!parsed.ok) {
        reject(input.id, 'INVALID');
        continue;
      }
      const stored = recordStates.get(recordKey(input.kind, input.id));
      if (!authorizeWrite(user, input.kind, recordWriteOperation(input.deleted, stored)).allowed) {
        reject(input.id, 'FORBIDDEN');
        continue;
      }
      if (!isNewerThanStored(input.updatedAt, stored)) {
        reject(input.id, 'STALE');
        continue;
      }
      recordWrites.push({ ...input, data: parsed.value });
    }

    const eventStates = await findEventStates(
      tx,
      events.filter(({ parsed }) => parsed.ok).map(({ input }) => input.id)
    );
    const eventInserts: EventWrite[] = [];
    const eventTombstones: string[] = [];
    for (const { input, parsed } of events) {
      if (!parsed.ok) {
        reject(input.id, 'INVALID');
        continue;
      }
      if (!authorizeWrite(user, 'event', input.deleted ? 'delete' : 'create').allowed) {
        reject(input.id, 'FORBIDDEN');
        continue;
      }
      const decision = decideEventWrite({ deleted: input.deleted, data: parsed.value }, eventStates.get(input.id));
      if (decision === 'insert') eventInserts.push({ ...input, data: parsed.value });
      else if (decision === 'tombstone') eventTombstones.push(input.id);
      else if (decision === 'unchanged') accepted.push(input.id);
      else reject(input.id, 'STALE');
    }

    // Under the write lock every planned write lands; the checks below only guard the invariant.
    const writtenRecords = new Set(
      (await upsertRecordsLww(tx, recordWrites)).map((row) => recordKey(row.kind, row.id))
    );
    for (const { kind, id } of recordWrites) {
      if (writtenRecords.has(recordKey(kind, id))) accepted.push(id);
      else reject(id, 'STALE');
    }
    const writtenEvents = new Set([
      ...(await insertEventsIfNew(tx, eventInserts)).map((row) => row.id),
      ...(await tombstoneEvents(tx, eventTombstones)).map((row) => row.id),
    ]);
    for (const id of [...eventInserts.map((event) => event.id), ...eventTombstones]) {
      if (writtenEvents.has(id)) accepted.push(id);
      else reject(id, 'STALE');
    }

    const cursor = await readCurrentCursor(tx);
    if (writtenRecords.size + writtenEvents.size > 0) await notifySyncChanged(tx, cursor);
    return { accepted, rejected, cursor };
  });
}
