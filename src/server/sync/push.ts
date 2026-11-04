import 'server-only';
import type { UserRole } from '@/core/domain/entities/club.types';
import { authorizeWrite } from '../auth/authorize';
import type { Database } from '../db/client';
import type { PushBody } from './api-schema';
import { readDataEpoch } from './epoch';
import {
  decideEventWrite,
  decideRecordWrite,
  dedupeEvents,
  dedupeRecords,
  hasFieldVersionAfter,
  isTooFarInFuture,
  recordKey,
  recordWriteOperation,
  type RejectReason,
} from './merge';
import { parseEventData, parseRecordData } from './records';
import {
  findEventStates,
  findLiveMatchIds,
  findRecordStates,
  insertEventsIfNew,
  lockSyncWrites,
  notifySyncChanged,
  readCurrentCursor,
  replaceRecordAtSeq,
  tombstoneEvents,
  tombstoneEventsOfMatches,
  upsertRecordsLww,
  type AcceptedRecord,
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
 * `EPOCH_MISMATCH`: the push was made in another data epoch (missing or old),
 * so nothing was written (S1, L5).
 */
export type PushOutcome = { ok: true; value: PushResult } | { ok: false; reason: 'EPOCH_MISMATCH' };

/**
 * Applies one push in a single transaction. Under the write lock, a push whose
 * `epoch` is not the current data epoch is refused whole (nothing is written).
 * Then each item is checked in order:
 * domain schema and, for records, an `updatedAt` at most 5 minutes ahead of
 * `now` and no field version after it (INVALID); for events, a match that is
 * stored live or accepted earlier in this batch (INVALID, S13.2); role
 * permissions (FORBIDDEN); then the merge rule (STALE): field by field for
 * live matches (S13.1), last-write-wins otherwise. Accepted writes take a new
 * seq; if any, `hoop_sync` is notified on commit with the new cursor.
 */
export async function applyPush(
  db: Database,
  user: { role: UserRole },
  body: PushBody,
  now: Date = new Date()
): Promise<PushOutcome> {
  // Schema validation needs no database, so it runs before the write lock is taken.
  const records = dedupeRecords(body.records).map((input) => ({
    input,
    parsed: isTooFarInFuture(input.updatedAt, now)
      ? ({ ok: false, reason: 'updatedAt is too far in the future' } as const)
      : hasFieldVersionAfter(input.updatedAt, input.fieldVersions)
        ? ({ ok: false, reason: 'a field version is after updatedAt' } as const)
        : parseRecordData(input.kind, input.id, input.data),
  }));
  const events = dedupeEvents(body.events).map((input) => ({
    input,
    parsed: parseEventData(input.id, input.matchId, input.data),
  }));

  return db.transaction(async (tx): Promise<PushOutcome> => {
    await lockSyncWrites(tx);
    // Read under the lock: a data replacement that committed first is always seen.
    if (body.epoch !== (await readDataEpoch(tx))) return { ok: false, reason: 'EPOCH_MISMATCH' };
    const accepted: string[] = [];
    const rejected: PushResult['rejected'] = [];
    const reject = (id: string, reason: RejectReason) => rejected.push({ id, reason });

    const recordStates = await findRecordStates(
      tx,
      records.filter(({ parsed }) => parsed.ok).map(({ input }) => input)
    );
    const recordWrites: RecordWrite[] = [];
    const matchMerges: { write: RecordWrite; expectedSeq: number }[] = [];
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
      const decision = decideRecordWrite({ ...input, data: parsed.value }, stored);
      if (decision.action === 'stale') {
        reject(input.id, 'STALE');
      } else if (decision.action === 'merge') {
        const { data, fieldVersions, updatedAt, expectedSeq } = decision;
        matchMerges.push({
          write: { kind: input.kind, id: input.id, data, updatedAt, deleted: false, fieldVersions },
          expectedSeq,
        });
      } else {
        const { kind, id, updatedAt, deleted } = input;
        recordWrites.push({ kind, id, data: parsed.value, updatedAt, deleted, fieldVersions: decision.fieldVersions });
      }
    }

    // Events need their match: stored live, or a live match record accepted above (S13.2).
    const matchesInBatch = new Map<string, boolean>();
    for (const { write } of matchMerges) matchesInBatch.set(write.id, true);
    for (const write of recordWrites) if (write.kind === 'match') matchesInBatch.set(write.id, !write.deleted);
    const storedLiveMatches = await findLiveMatchIds(tx, [
      ...new Set(events.map(({ input }) => input.matchId).filter((matchId) => !matchesInBatch.has(matchId))),
    ]);
    const hasLiveMatch = (matchId: string) => matchesInBatch.get(matchId) ?? storedLiveMatches.has(matchId);

    const eventStates = await findEventStates(
      tx,
      events.filter(({ parsed }) => parsed.ok).map(({ input }) => input.id)
    );
    const eventInserts: EventWrite[] = [];
    const eventTombstones: string[] = [];
    for (const { input, parsed } of events) {
      if (!parsed.ok || !hasLiveMatch(input.matchId)) {
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
    const mergedRows: AcceptedRecord[] = [];
    for (const { write, expectedSeq } of matchMerges) {
      const row = await replaceRecordAtSeq(tx, write, expectedSeq);
      if (row) mergedRows.push(row);
    }
    const writtenRecords = new Set(
      [...(await upsertRecordsLww(tx, recordWrites)), ...mergedRows].map((row) => recordKey(row.kind, row.id))
    );
    for (const { kind, id } of [...recordWrites, ...matchMerges.map(({ write }) => write)]) {
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

    // A deleted match takes its plays with it, so none stay orphaned on the server.
    const deletedMatchIds = recordWrites
      .filter((write) => write.kind === 'match' && write.deleted && writtenRecords.has(recordKey(write.kind, write.id)))
      .map((write) => write.id);
    const cascadedEvents = await tombstoneEventsOfMatches(tx, deletedMatchIds);

    const cursor = await readCurrentCursor(tx);
    if (writtenRecords.size + writtenEvents.size + cascadedEvents.length > 0) await notifySyncChanged(tx, cursor);
    return { ok: true, value: { accepted, rejected, cursor } };
  });
}
