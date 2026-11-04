import 'server-only';
import { isDeepStrictEqual } from 'node:util';
import {
  latestFieldVersion,
  mergeMatchFields,
  pickFieldVersions,
  resolveFieldVersions,
  type CompleteFieldVersions,
  type MatchFieldVersions,
} from '@/core/application/sync/match-fields';
import type { WriteOperation } from '../auth/authorize';
import type { SyncRecordKind } from '@/core/application/sync/record-kinds';

/**
 * =============================================================================
 * HOOP - SYNC MERGE RULES (pure)
 * Records: last-write-wins by client `updatedAt` (ties keep the stored row);
 * an `updatedAt` more than MAX_CLOCK_SKEW_MS ahead of the server is refused.
 * Live match records merge field by field instead (S13.1); a match tombstone
 * still applies to the whole record.
 * Events: append-only by id; data is immutable and a tombstone is permanent.
 * =============================================================================
 */

export type RejectReason = 'INVALID' | 'FORBIDDEN' | 'STALE';

export interface StoredRecordState {
  updatedAt: Date;
  deleted: boolean;
}

/** A stored row as the merge needs it. */
export interface StoredRecord extends StoredRecordState {
  data: Record<string, unknown>;
  /** NULL: every field changed at `updatedAt`. */
  fieldVersions: Record<string, string> | null;
  seq: number;
}

export interface IncomingRecord {
  kind: SyncRecordKind;
  deleted: boolean;
  data: Record<string, unknown>;
  updatedAt: Date;
  /** Match records only; without them every field changed at `updatedAt`. */
  fieldVersions?: MatchFieldVersions;
}

/**
 * - `upsert`: last-write-wins replace (or insert) of the incoming record.
 * - `merge`: the field-level merge of a live match, written only if the row
 *   still has `expectedSeq`.
 * - `stale`: nothing newer to write; the server wins.
 */
export type RecordWriteDecision =
  | { action: 'upsert'; fieldVersions: CompleteFieldVersions | null }
  | {
      action: 'merge';
      data: Record<string, unknown>;
      fieldVersions: CompleteFieldVersions;
      updatedAt: Date;
      expectedSeq: number;
    }
  | { action: 'stale' };

/**
 * Live match over a live stored match: each field keeps the newer version
 * (ties keep the stored value) and `updatedAt` becomes the newest version.
 * Anything else, including any tombstone, is whole-record last-write-wins:
 * a match tombstone wins only when newer than every field (`updatedAt` is the
 * newest field version), and a revived match starts from the incoming record.
 */
export function decideRecordWrite(incoming: IncomingRecord, stored: StoredRecord | undefined): RecordWriteDecision {
  const isLiveMatch = incoming.kind === 'match' && !incoming.deleted;
  const incomingVersions = isLiveMatch
    ? resolveFieldVersions(incoming.fieldVersions, incoming.updatedAt.toISOString())
    : null;

  if (incomingVersions && stored && !stored.deleted) {
    const merged = mergeMatchFields(
      {
        data: stored.data,
        fieldVersions: resolveFieldVersions(
          stored.fieldVersions ? pickFieldVersions(stored.fieldVersions) : null,
          stored.updatedAt.toISOString()
        ),
      },
      { data: incoming.data, fieldVersions: incomingVersions }
    );
    if (merged.taken.length === 0) return { action: 'stale' };
    const newest = new Date(latestFieldVersion(merged.fieldVersions));
    return {
      action: 'merge',
      data: merged.data,
      fieldVersions: merged.fieldVersions,
      updatedAt: newest.getTime() > stored.updatedAt.getTime() ? newest : stored.updatedAt,
      expectedSeq: stored.seq,
    };
  }

  if (!isNewerThanStored(incoming.updatedAt, stored)) return { action: 'stale' };
  return { action: 'upsert', fieldVersions: incomingVersions };
}

/** A field version after the record's own `updatedAt` makes the push inconsistent (INVALID). */
export function hasFieldVersionAfter(updatedAt: Date, fieldVersions: MatchFieldVersions | undefined): boolean {
  return Object.values(fieldVersions ?? {}).some((version) => Date.parse(version) > updatedAt.getTime());
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
  return isDeepStrictEqual(asStoredJson(incoming.data), asStoredJson(stored.data)) ? 'unchanged' : 'stale';
}

/** The value as `jsonb` keeps it: an `undefined` key is dropped, a Date becomes its ISO string. */
function asStoredJson(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
