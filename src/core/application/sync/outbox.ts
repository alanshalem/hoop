import {
  fieldVersionEntries,
  isKnownFieldVersionEntry,
  isMatchField,
  MATCH_VERSIONED_FIELDS,
  pickFieldVersions,
  pickKnownMatchFields,
  readFieldVersions,
  versionKeyOf,
} from './match-fields';
import { recordKey, timeOf } from './sync-records';
import type {
  ClubDiff,
  Outbox,
  OutboxEventEntry,
  OutboxRecordEntry,
  PushPayload,
  PushResult,
  RecordChange,
  SyncEvent,
  SyncRecord,
  VersionMap,
} from './sync-types';

/** Server limits of `POST /api/sync/push` (src/server/sync/api-schema.ts). */
export const PUSH_LIMITS = { records: 500, events: 2000 } as const;

export function createEmptyOutbox(): Outbox {
  return { records: {}, events: {}, nextRev: 1 };
}

export function countPending(outbox: Outbox): number {
  return Object.keys(outbox.records).length + Object.keys(outbox.events).length;
}

/**
 * Change time for a record: now, but always later than the version it replaces,
 * so a local edit wins over the version it was made on (even with clock skew).
 */
export function nextUpdatedAt(previous: string | undefined, nowMs: number): string {
  const after = previous === undefined ? nowMs : Math.max(nowMs, timeOf(previous) + 1);
  return new Date(after).toISOString();
}

export interface OutboxState {
  outbox: Outbox;
  versions: VersionMap;
}

/**
 * Adds local changes to the outbox, stamping `updatedAt` into the entry and the
 * versions map. One entry per `kind:id` (the latest wins) and per event id; an
 * event removed before any push attempt is simply dropped. A live match entry
 * carries every field version, with only the changed fields (a grouped field
 * stamps its whole group, see MATCH_FIELD_GROUPS) stamped (S13.1).
 */
export function enqueueChanges({ outbox, versions }: OutboxState, diff: ClubDiff, nowMs: number): OutboxState {
  const records = { ...outbox.records };
  const events = { ...outbox.events };
  const nextVersions = { ...versions };
  let nextRev = outbox.nextRev;

  for (const change of diff.records) {
    const key = recordKey(change.kind, change.id);
    const updatedAt = nextUpdatedAt(nextVersions[key], nowMs);
    records[key] = { ...toSyncRecord(change, updatedAt, nextVersions), rev: nextRev++ };
    nextVersions[key] = updatedAt;
  }

  for (const change of diff.events) {
    const pending = events[change.id];
    if (!change.deleted) {
      // A pending tombstone always wins: the server never revives a deleted event.
      if (!pending?.deleted) events[change.id] = { ...change, rev: nextRev++, attempted: false };
    } else if (pending && !pending.deleted && !pending.attempted) {
      delete events[change.id];
    } else {
      events[change.id] = { ...change, rev: nextRev++, attempted: false };
    }
  }

  return { outbox: { records, events, nextRev }, versions: nextVersions };
}

/** The record to push for a local change; stamps match field versions into `versions`. */
function toSyncRecord(change: RecordChange, updatedAt: string, versions: VersionMap): SyncRecord {
  if (change.kind !== 'match') return { ...change, updatedAt };
  // An edit an older tab handed over may name fields this version no longer has.
  const { changedFields, ...rest } = change;
  const record = { ...rest, data: pickKnownMatchFields(rest.data) };
  if (record.deleted) return { ...record, updatedAt };
  const fieldVersions = readFieldVersions(versions, record.id);
  for (const field of changedFields?.filter(isMatchField) ?? MATCH_VERSIONED_FIELDS) {
    fieldVersions[versionKeyOf(field)] = updatedAt;
  }
  Object.assign(versions, fieldVersionEntries(record.id, fieldVersions));
  return { ...record, updatedAt, fieldVersions };
}

/**
 * Drops the match fields this app version no longer knows from queued match
 * records and from the versions map (L6): storage written by an older version
 * may still hold a field the model removed, such as `activeLineupOwn`.
 */
export function dropUnknownMatchFields({ outbox, versions }: OutboxState): OutboxState {
  const records = Object.fromEntries(
    Object.entries(outbox.records).map(([key, entry]): [string, OutboxRecordEntry] => {
      if (entry.kind !== 'match') return [key, entry];
      const data = pickKnownMatchFields(entry.data);
      if (!entry.fieldVersions) return [key, { ...entry, data }];
      return [key, { ...entry, data, fieldVersions: pickFieldVersions(entry.fieldVersions as Record<string, string>) }];
    })
  );
  return {
    outbox: { ...outbox, records },
    versions: Object.fromEntries(Object.entries(versions).filter(([key]) => isKnownFieldVersionEntry(key))),
  };
}

export interface PushBatch {
  payload: PushPayload;
  records: { key: string; id: string; rev: number }[];
  events: { id: string; rev: number }[];
  size: number;
}

/**
 * The oldest pending changes that fit in one push. Events of a match whose
 * pending record does not fit wait for it: the server refuses events of a
 * match it does not know yet (S13.2).
 */
export function buildPushBatch(outbox: Outbox, limits: { records: number; events: number } = PUSH_LIMITS): PushBatch {
  const pending = Object.entries(outbox.records);
  const recordEntries = pending.slice(0, limits.records);
  const waitingMatches = new Set(
    pending
      .slice(limits.records)
      .filter(([, entry]) => entry.kind === 'match' && !entry.deleted)
      .map(([, entry]) => entry.id)
  );
  const eventEntries = Object.values(outbox.events)
    .filter((entry) => !waitingMatches.has(entry.matchId))
    .slice(0, limits.events);
  return {
    payload: {
      records: recordEntries.map(([, entry]) => toPushRecord(entry)),
      events: eventEntries.map(toPushEvent),
    },
    records: recordEntries.map(([key, entry]) => ({ key, id: entry.id, rev: entry.rev })),
    events: eventEntries.map((entry) => ({ id: entry.id, rev: entry.rev })),
    size: recordEntries.length + eventEntries.length,
  };
}

function toPushRecord(entry: OutboxRecordEntry): SyncRecord {
  const record: Partial<OutboxRecordEntry> = { ...entry };
  delete record.rev;
  return record as SyncRecord;
}

function toPushEvent({ id, matchId, data, deleted }: OutboxEventEntry): SyncEvent {
  return { id, matchId, data, deleted };
}

/** Marks the batch events as possibly known by the server (see `enqueueChanges`). */
export function markBatchAttempted(outbox: Outbox, batch: PushBatch): Outbox {
  if (batch.events.length === 0) return outbox;
  const events = { ...outbox.events };
  for (const { id } of batch.events) {
    if (events[id]) events[id] = { ...events[id], attempted: true };
  }
  return { ...outbox, events };
}

export interface ApplyPushOutcome {
  outbox: Outbox;
  /** Batch entries the server answered for (removed from the outbox). */
  settledCount: number;
  /** FORBIDDEN or INVALID rejections: those changes are dropped and reported. */
  errorCount: number;
}

/**
 * Settles the batch: accepted entries leave the outbox; STALE ones too (the next
 * pull brings the server version); FORBIDDEN/INVALID ones are dropped and
 * counted. An entry changed again while the push was in flight stays pending.
 */
export function applyPushResult(outbox: Outbox, batch: PushBatch, result: PushResult): ApplyPushOutcome {
  const answered = new Set(result.accepted);
  const failed = new Set<string>();
  for (const { id, reason } of result.rejected) {
    answered.add(id);
    if (reason !== 'STALE') failed.add(id);
  }

  const records = { ...outbox.records };
  const events = { ...outbox.events };
  let settledCount = 0;
  let errorCount = 0;
  const settle = (id: string) => {
    settledCount += 1;
    if (failed.has(id)) errorCount += 1;
  };

  for (const { key, id, rev } of batch.records) {
    if (!answered.has(id) || records[key]?.rev !== rev) continue;
    delete records[key];
    settle(id);
  }
  for (const { id, rev } of batch.events) {
    if (!answered.has(id) || events[id]?.rev !== rev) continue;
    delete events[id];
    settle(id);
  }

  return { outbox: { ...outbox, records, events }, settledCount, errorCount };
}
