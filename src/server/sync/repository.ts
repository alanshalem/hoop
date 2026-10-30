import 'server-only';
import { sql } from 'drizzle-orm';
import type { DbExecutor } from '../db/client';
import { matchEvents, syncRecords } from '../db/schema';
import type { SyncRecordKind } from './record-kinds';

/**
 * =============================================================================
 * HOOP OS - SYNC DATA ACCESS
 * Every accepted write takes the next value of the global `sync_seq`, so a
 * client can pull everything that changed after its cursor in one query.
 * Payloads must already be validated (see ./records.ts).
 * =============================================================================
 */

export interface RecordWrite {
  kind: SyncRecordKind;
  id: string;
  data: Record<string, unknown>;
  /** Client change time, compared for last-write-wins. */
  updatedAt: Date;
  deleted: boolean;
}

export interface EventWrite {
  id: string;
  matchId: string;
  data: Record<string, unknown>;
  deleted: boolean;
}

export interface AcceptedRecord {
  kind: SyncRecordKind;
  id: string;
  seq: number;
}

export interface AcceptedEvent {
  id: string;
  seq: number;
}

// Keeps each statement far below Postgres' 65535 bind-parameter limit.
const BATCH_SIZE = 500;

function chunk<T>(items: readonly T[]): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    batches.push(items.slice(start, start + BATCH_SIZE));
  }
  return batches;
}

/**
 * Last-write-wins upsert: a row is inserted when new, or replaced only when the
 * incoming `updatedAt` is strictly newer (ties keep the stored row).
 * Returns the rows that were written. Each (kind, id) must appear at most once.
 */
export async function upsertRecordsLww(db: DbExecutor, records: readonly RecordWrite[]): Promise<AcceptedRecord[]> {
  const accepted: AcceptedRecord[] = [];
  for (const batch of chunk(records)) {
    const rows = await db
      .insert(syncRecords)
      .values(batch.map(({ kind, id, data, updatedAt, deleted }) => ({ kind, id, data, updatedAt, deleted })))
      .onConflictDoUpdate({
        target: [syncRecords.kind, syncRecords.id],
        set: {
          data: sql`excluded.data`,
          updatedAt: sql`excluded.updated_at`,
          deleted: sql`excluded.deleted`,
          seq: sql`nextval('sync_seq')`,
        },
        setWhere: sql`excluded.updated_at > ${syncRecords.updatedAt}`,
      })
      .returning({ kind: syncRecords.kind, id: syncRecords.id, seq: syncRecords.seq });
    accepted.push(...rows);
  }
  return accepted;
}

/**
 * Append-only insert: events that already exist (same id) are left untouched.
 * Returns the events that were inserted.
 */
export async function insertEventsIfNew(db: DbExecutor, events: readonly EventWrite[]): Promise<AcceptedEvent[]> {
  const accepted: AcceptedEvent[] = [];
  for (const batch of chunk(events)) {
    const rows = await db
      .insert(matchEvents)
      .values(batch.map(({ id, matchId, data, deleted }) => ({ id, matchId, data, deleted })))
      .onConflictDoNothing({ target: matchEvents.id })
      .returning({ id: matchEvents.id, seq: matchEvents.seq });
    accepted.push(...rows);
  }
  return accepted;
}
