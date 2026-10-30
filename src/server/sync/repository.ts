import 'server-only';
import { and, asc, eq, gt, inArray, or, sql } from 'drizzle-orm';
import type { DbExecutor } from '../db/client';
import { matchEvents, syncRecords, type MatchEventRow, type SyncRecordRow } from '../db/schema';
import { recordKey, type StoredEventState, type StoredRecord } from './merge';
import type { SyncRecordKind } from './record-kinds';

/**
 * =============================================================================
 * HOOP OS - SYNC DATA ACCESS
 * Every accepted write takes the next value of the global `sync_seq`, so a
 * client can pull everything that changed after its cursor in one query.
 * Payloads must already be validated (see ./records.ts).
 *
 * Cursor safety: writers take `lockSyncWrites` first, so they run one at a
 * time and commit in seq order. Without it, a transaction that drew seq 10 but
 * committed after one that drew seq 11 would be skipped by a client that had
 * already pulled up to 11.
 * =============================================================================
 */

/** Postgres channel for change notifications; the payload is the new cursor. */
export const SYNC_CHANNEL = 'hoop_sync';

// Arbitrary app-wide advisory lock key ("hoop" in ASCII).
const SYNC_WRITE_LOCK_KEY = 0x686f6f70;

/** Highest seq stored in either table, as text (seq is bigint). '0' when empty. */
export const CURRENT_CURSOR_SQL = `SELECT greatest(
  coalesce((SELECT max(seq) FROM sync_records), 0),
  coalesce((SELECT max(seq) FROM match_events), 0)
)::text AS cursor`;

/**
 * Serializes sync writers until the surrounding transaction ends. Call it first
 * inside every transaction that writes `sync_records` or `match_events`.
 */
export async function lockSyncWrites(tx: DbExecutor): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${SYNC_WRITE_LOCK_KEY})`);
}

export async function readCurrentCursor(db: DbExecutor): Promise<string> {
  const result = await db.execute<{ cursor: string }>(sql.raw(CURRENT_CURSOR_SQL));
  return result.rows[0]?.cursor ?? '0';
}

/** Queues a `changed` notification; Postgres delivers it only if the transaction commits. */
export async function notifySyncChanged(tx: DbExecutor, cursor: string): Promise<void> {
  await tx.execute(sql`SELECT pg_notify(${SYNC_CHANNEL}, ${cursor})`);
}

export interface RecordWrite {
  kind: SyncRecordKind;
  id: string;
  data: Record<string, unknown>;
  /** Client change time, compared for last-write-wins. */
  updatedAt: Date;
  deleted: boolean;
  /** Live match records only (S13.1); null otherwise. */
  fieldVersions: Record<string, string> | null;
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
      .values(batch.map(toRecordRow))
      .onConflictDoUpdate({
        target: [syncRecords.kind, syncRecords.id],
        set: {
          data: sql`excluded.data`,
          updatedAt: sql`excluded.updated_at`,
          deleted: sql`excluded.deleted`,
          fieldVersions: sql`excluded.field_versions`,
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
 * Writes a field-level merge (S13.1) over a live row, but only if the row still
 * has `expectedSeq` (nobody wrote it since it was read). Returns the written
 * row, or undefined when it changed meanwhile.
 */
export async function replaceRecordAtSeq(
  db: DbExecutor,
  record: RecordWrite,
  expectedSeq: number
): Promise<AcceptedRecord | undefined> {
  const [row] = await db
    .update(syncRecords)
    .set({
      data: record.data,
      updatedAt: record.updatedAt,
      deleted: record.deleted,
      fieldVersions: record.fieldVersions,
      seq: sql`nextval('sync_seq')`,
    })
    .where(and(eq(syncRecords.kind, record.kind), eq(syncRecords.id, record.id), eq(syncRecords.seq, expectedSeq)))
    .returning({ kind: syncRecords.kind, id: syncRecords.id, seq: syncRecords.seq });
  return row;
}

function toRecordRow({ kind, id, data, updatedAt, deleted, fieldVersions }: RecordWrite) {
  return { kind, id, data, updatedAt, deleted, fieldVersions };
}

/**
 * Insert-only: records whose (kind, id) already exists are left untouched,
 * whatever their `updatedAt` or tombstone. Used by the seed, which must never
 * overwrite user edits or resurrect deletions. Returns the rows inserted.
 */
export async function insertRecordsIfNew(db: DbExecutor, records: readonly RecordWrite[]): Promise<AcceptedRecord[]> {
  const accepted: AcceptedRecord[] = [];
  for (const batch of chunk(records)) {
    const rows = await db
      .insert(syncRecords)
      .values(batch.map(toRecordRow))
      .onConflictDoNothing({ target: [syncRecords.kind, syncRecords.id] })
      .returning({ kind: syncRecords.kind, id: syncRecords.id, seq: syncRecords.seq });
    accepted.push(...rows);
  }
  return accepted;
}

/** Stored rows (merge state) keyed by `recordKey(kind, id)`; ids not found are absent. */
export async function findRecordStates(
  db: DbExecutor,
  keys: readonly { kind: SyncRecordKind; id: string }[]
): Promise<Map<string, StoredRecord>> {
  const idsByKind = new Map<SyncRecordKind, string[]>();
  for (const { kind, id } of keys) {
    const ids = idsByKind.get(kind);
    if (ids) ids.push(id);
    else idsByKind.set(kind, [id]);
  }

  const states = new Map<string, StoredRecord>();
  if (idsByKind.size === 0) return states;
  const rows = await db
    .select()
    .from(syncRecords)
    .where(or(...[...idsByKind].map(([kind, ids]) => and(eq(syncRecords.kind, kind), inArray(syncRecords.id, ids)))));
  for (const { kind, id, updatedAt, deleted, data, fieldVersions, seq } of rows) {
    states.set(recordKey(kind, id), { updatedAt, deleted, data, fieldVersions, seq });
  }
  return states;
}

/** Ids among `matchIds` with a live (not deleted) match record. */
export async function findLiveMatchIds(db: DbExecutor, matchIds: readonly string[]): Promise<Set<string>> {
  const live = new Set<string>();
  for (const batch of chunk(matchIds)) {
    const rows = await db
      .select({ id: syncRecords.id })
      .from(syncRecords)
      .where(and(eq(syncRecords.kind, 'match'), eq(syncRecords.deleted, false), inArray(syncRecords.id, batch)));
    for (const row of rows) live.add(row.id);
  }
  return live;
}

/** Stored event state (tombstone flag and data) by event id; ids not found are absent. */
export async function findEventStates(db: DbExecutor, ids: readonly string[]): Promise<Map<string, StoredEventState>> {
  const states = new Map<string, StoredEventState>();
  for (const batch of chunk(ids)) {
    const rows = await db
      .select({ id: matchEvents.id, deleted: matchEvents.deleted, data: matchEvents.data })
      .from(matchEvents)
      .where(inArray(matchEvents.id, batch));
    for (const row of rows) states.set(row.id, { deleted: row.deleted, data: row.data });
  }
  return states;
}

/**
 * Marks live events as deleted (their data is kept) and gives them a new seq.
 * Already deleted events are skipped: a tombstone is never rewritten.
 */
export async function tombstoneEvents(db: DbExecutor, ids: readonly string[]): Promise<AcceptedEvent[]> {
  const accepted: AcceptedEvent[] = [];
  for (const batch of chunk(ids)) {
    const rows = await db
      .update(matchEvents)
      .set({ deleted: true, seq: sql`nextval('sync_seq')` })
      .where(and(inArray(matchEvents.id, batch), eq(matchEvents.deleted, false)))
      .returning({ id: matchEvents.id, seq: matchEvents.seq });
    accepted.push(...rows);
  }
  return accepted;
}

/** Up to `limit` records with seq > `since`, in seq order (tombstones included). */
export async function listRecordsSince(db: DbExecutor, since: number, limit: number): Promise<SyncRecordRow[]> {
  return db.select().from(syncRecords).where(gt(syncRecords.seq, since)).orderBy(asc(syncRecords.seq)).limit(limit);
}

/** Up to `limit` events with seq > `since`, in seq order (tombstones included). */
export async function listEventsSince(db: DbExecutor, since: number, limit: number): Promise<MatchEventRow[]> {
  return db.select().from(matchEvents).where(gt(matchEvents.seq, since)).orderBy(asc(matchEvents.seq)).limit(limit);
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
