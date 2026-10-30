import 'server-only';
import { isDeepStrictEqual } from 'node:util';
import type { WriteOperation } from '../auth/authorize';
import type { SyncRecordKind } from './record-kinds';

/**
 * =============================================================================
 * HOOP OS - SYNC MERGE RULES (pure)
 * Records: last-write-wins by client `updatedAt` (ties keep the stored row);
 * an `updatedAt` more than MAX_CLOCK_SKEW_MS ahead of the server is refused.
 * Events: append-only by id; data is immutable and a tombstone is permanent.
 * =============================================================================
 */

export type RejectReason = 'INVALID' | 'FORBIDDEN' | 'STALE';

export interface StoredRecordState {
  updatedAt: Date;
  deleted: boolean;
}

export interface StoredEventState {
  deleted: boolean;
  data: unknown;
}

export function recordKey(kind: SyncRecordKind, id: string): string {
  return `${kind}:${id}`;
}

/**
 * One write per (kind, id): the newest `updatedAt` wins, a tie goes to the later
 * occurrence (the later local change). Keeps first-seen order.
 */
export function dedupeRecords<T extends { kind: SyncRecordKind; id: string; updatedAt: Date }>(
  records: readonly T[]
): T[] {
  const winners = new Map<string, T>();
  for (const record of records) {
    const key = recordKey(record.kind, record.id);
    const current = winners.get(key);
    if (!current || record.updatedAt.getTime() >= current.updatedAt.getTime()) winners.set(key, record);
  }
  return [...winners.values()];
}

/**
 * One write per event id: a tombstone wins over any live copy, otherwise the
 * later occurrence wins. Keeps first-seen order.
 */
export function dedupeEvents<T extends { id: string; deleted: boolean }>(events: readonly T[]): T[] {
  const winners = new Map<string, T>();
  for (const event of events) {
    const current = winners.get(event.id);
    if (!current || event.deleted || !current.deleted) winners.set(event.id, event);
  }
  return [...winners.values()];
}

/**
 * What a record write means for RBAC: a tombstone deletes; writing over a live
 * row updates; anything else (new id or previously deleted) creates.
 */
export function recordWriteOperation(incomingDeleted: boolean, stored: StoredRecordState | undefined): WriteOperation {
  if (incomingDeleted) return 'delete';
  return stored && !stored.deleted ? 'update' : 'create';
}

/** Last-write-wins: only a strictly newer `updatedAt` replaces the stored row. */
export function isNewerThanStored(updatedAt: Date, stored: StoredRecordState | undefined): boolean {
  return !stored || updatedAt.getTime() > stored.updatedAt.getTime();
}

/** Client clocks may run this far ahead of the server before a record is refused. */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * Future guard for last-write-wins: a record stamped by a clock that runs
 * ahead would beat every honest write until real time catches up (or forever,
 * with a far-future date), so it is rejected instead of stored.
 */
export function isTooFarInFuture(updatedAt: Date, now: Date): boolean {
  return updatedAt.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS;
}

/**
 * - `insert`: the event is new (live or already tombstoned).
 * - `tombstone`: a live event gets deleted (its data is kept).
 * - `unchanged`: an idempotent resend; nothing to write.
 * - `stale`: it would revert a tombstone or rewrite immutable data; the server wins.
 */
export type EventWriteDecision = 'insert' | 'tombstone' | 'unchanged' | 'stale';

export function decideEventWrite(
  incoming: { deleted: boolean; data: unknown },
  stored: StoredEventState | undefined
): EventWriteDecision {
  if (!stored) return 'insert';
  if (stored.deleted) return incoming.deleted ? 'unchanged' : 'stale';
  if (incoming.deleted) return 'tombstone';
  return isDeepStrictEqual(incoming.data, stored.data) ? 'unchanged' : 'stale';
}
