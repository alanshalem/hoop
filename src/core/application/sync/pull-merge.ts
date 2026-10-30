import type { Match, PlayByPlayEvent } from '@/core/domain/entities/match.types';
import {
  changedMatchFields,
  coversFieldVersions,
  fieldVersionEntries,
  mergeMatchFields,
  readFieldVersions,
  resolveFieldVersions,
  type CompleteFieldVersions,
} from './match-fields';
import {
  applyEventChanges,
  createCollections,
  hasCollectionChanges,
  toData,
  type Collections,
} from './club-collections';
import { createEmptyOutbox } from './outbox';
import { recordKey, timeOf, toMatchRecord } from './sync-records';
import type {
  MatchRecord,
  Outbox,
  OutboxRecordEntry,
  PulledChanges,
  SyncableClubData,
  SyncRecord,
  VersionMap,
} from './sync-types';

export interface MergeState {
  data: SyncableClubData;
  versions: VersionMap;
  outbox: Outbox;
}

export interface MergeResult extends MergeState {
  /** False when the club data is untouched (same references as the input). */
  changed: boolean;
}

/**
 * Merges pulled server changes into the local club data (S10.7):
 * - Records: last-write-wins against `versions`. A remote version equal to or
 *   newer than the local one is applied (a tombstone removes the entity) and
 *   supersedes a pending local change that is not newer.
 * - Live matches present on both sides merge field by field, exactly like the
 *   server (S13.1): each field keeps the newer version, a tie keeps the remote
 *   value; a pending edit is dropped once the remote covers all its fields.
 * - Events: append-only by id, ordered by timestamp then id; a tombstone removes
 *   the event. A pending local tombstone is never undone by a pull.
 * - Touched matches get their scoreboard re-derived from their events.
 * Records are applied before events, so a match and its events can arrive together.
 */
export function mergePulledChanges(state: MergeState, pulled: PulledChanges): MergeResult {
  const collections = createCollections(state.data);
  const versions = { ...state.versions };
  const outboxRecords = { ...state.outbox.records };
  const outboxEvents = { ...state.outbox.events };
  const touchedMatches = new Set<string>();

  for (const record of pulled.records) {
    const key = recordKey(record.kind, record.id);
    const localMatch = record.kind === 'match' ? collections.match.get(record.id) : undefined;
    if (record.kind === 'match' && !record.deleted && localMatch) {
      const remoteVersions = resolveFieldVersions(record.fieldVersions, record.updatedAt);
      const pending = outboxRecords[key];
      if (pending && coversFieldVersions(remoteVersions, pendingFieldVersions(pending))) delete outboxRecords[key];
      mergeMatchRecord(collections, versions, touchedMatches, {
        remote: { data: record.data, fieldVersions: remoteVersions, updatedAt: record.updatedAt },
        local: localMatch,
      });
      continue;
    }

    const remoteTime = timeOf(record.updatedAt);
    const local = versions[key];
    if (local !== undefined && remoteTime < timeOf(local)) continue;

    versions[key] = record.updatedAt;
    if (record.kind === 'match' && !record.deleted) {
      Object.assign(versions, fieldVersionEntries(record.id, resolveFieldVersions(record.fieldVersions, record.updatedAt)));
    }
    const pending = outboxRecords[key];
    if (pending && timeOf(pending.updatedAt) <= remoteTime) delete outboxRecords[key];
    applyRecord(collections, record, touchedMatches);
  }

  const added = new Map<string, PlayByPlayEvent[]>();
  const removed = new Set<string>();
  for (const event of pulled.events) {
    if (event.deleted) {
      removed.add(event.id);
      delete outboxEvents[event.id];
      touchedMatches.add(event.matchId);
      continue;
    }
    const match = collections.match.get(event.matchId);
    if (!match || outboxEvents[event.id]?.deleted) continue;
    if (match.events.some((existing) => existing.id === event.id)) continue;
    const list = added.get(event.matchId) ?? [];
    if (!list.some((pendingEvent) => pendingEvent.id === event.id)) list.push(event.data);
    added.set(event.matchId, list);
    touchedMatches.add(event.matchId);
  }

  applyEventChanges(collections.match, touchedMatches, added, removed);

  const changed = hasCollectionChanges(collections);
  return {
    data: changed ? toData(collections) : state.data,
    versions,
    outbox: { ...state.outbox, records: outboxRecords, events: outboxEvents },
    changed,
  };
}

/** Field versions a pending match entry was stamped with (whole-record for tombstones). */
function pendingFieldVersions(entry: OutboxRecordEntry): CompleteFieldVersions {
  return resolveFieldVersions(entry.kind === 'match' ? entry.fieldVersions : undefined, entry.updatedAt);
}

interface MatchMergeInput {
  /** The side that wins ties: the server's version. */
  remote: { data: MatchRecord; fieldVersions: CompleteFieldVersions; updatedAt: string };
  local: Match;
  /** Local field versions; read from `versions` when omitted. */
  localVersions?: CompleteFieldVersions;
}

/**
 * Field-level merge of one match present on both sides (S13.1). Updates the
 * versions map in place and replaces the match only when a remote field won.
 */
function mergeMatchRecord(
  collections: Collections,
  versions: VersionMap,
  touchedMatches: Set<string>,
  { remote, local, localVersions }: MatchMergeInput
): void {
  const key = recordKey('match', local.id);
  const merged = mergeMatchFields<MatchRecord>(remote, {
    data: toMatchRecord(local),
    fieldVersions: localVersions ?? readFieldVersions(versions, local.id),
  });
  Object.assign(versions, fieldVersionEntries(local.id, merged.fieldVersions));
  const recordVersion = versions[key];
  if (recordVersion === undefined || timeOf(remote.updatedAt) > timeOf(recordVersion)) versions[key] = remote.updatedAt;

  const current = collections.match.get(local.id) ?? local;
  if (changedMatchFields(current, merged.data).length === 0) return;
  collections.match.set(local.id, { ...merged.data, events: current.events });
  collections.match.markReplaced(local.id);
  touchedMatches.add(local.id);
}

function applyRecord(collections: Collections, record: SyncRecord, touchedMatches: Set<string>): void {
  if (record.deleted) {
    collections[record.kind].remove(record.id);
    return;
  }
  switch (record.kind) {
    case 'division':
      collections.division.set(record.id, record.data);
      break;
    case 'team':
      collections.team.set(record.id, record.data);
      break;
    case 'player':
      collections.player.set(record.id, record.data);
      break;
    case 'match': {
      const local = collections.match.get(record.id);
      collections.match.set(record.id, { ...record.data, events: local?.events ?? [] });
      collections.match.markReplaced(record.id);
      touchedMatches.add(record.id);
      break;
    }
  }
}

/**
 * Full sync (first sync of a device, or after a server reset): the server
 * snapshot replaces the local data, then every pending local change is
 * re-applied over it and stays in the outbox to be flushed. Untouched bundled
 * seed data is never pushed; a seed entity edited before the first sync is pushed
 * as a whole record (last-write-wins). A pending record the server already has a
 * newer or equal version of is dropped, exactly as in an incremental pull.
 */
export function applyServerSnapshot(pulled: PulledChanges, outbox: Outbox = createEmptyOutbox()): MergeState {
  const empty: SyncableClubData = { divisions: [], teams: [], players: [], matches: [] };
  const merged = mergePulledChanges({ data: empty, versions: {}, outbox }, pulled);
  return reapplyOutbox(merged);
}

/** Pending local changes on top of server data: what the user keeps seeing until they are pushed. */
function reapplyOutbox({ data, versions, outbox }: MergeState): MergeState {
  const collections = createCollections(data);
  const nextVersions = { ...versions };
  const touchedMatches = new Set<string>();

  for (const [key, entry] of Object.entries(outbox.records)) {
    const serverMatch = entry.kind === 'match' ? collections.match.get(entry.id) : undefined;
    if (entry.kind === 'match' && !entry.deleted && serverMatch) {
      // The pending edit wins only the fields it changed after the server version;
      // the record version becomes the pending stamp, as for any other kind.
      const serverVersions = readFieldVersions(nextVersions, entry.id);
      mergeMatchRecord(collections, nextVersions, touchedMatches, {
        remote: { data: toMatchRecord(serverMatch), fieldVersions: serverVersions, updatedAt: entry.updatedAt },
        local: { ...entry.data, events: serverMatch.events },
        localVersions: pendingFieldVersions(entry),
      });
      continue;
    }
    nextVersions[key] = entry.updatedAt;
    if (entry.kind === 'match' && !entry.deleted) {
      Object.assign(nextVersions, fieldVersionEntries(entry.id, pendingFieldVersions(entry)));
    }
    applyRecord(collections, entry, touchedMatches);
  }

  const added = new Map<string, PlayByPlayEvent[]>();
  const removed = new Set<string>();
  for (const entry of Object.values(outbox.events)) {
    const match = collections.match.get(entry.matchId);
    if (!match) continue;
    touchedMatches.add(entry.matchId);
    if (entry.deleted) {
      removed.add(entry.id);
    } else if (!match.events.some((event) => event.id === entry.id)) {
      added.set(entry.matchId, [...(added.get(entry.matchId) ?? []), entry.data]);
    }
  }

  applyEventChanges(collections.match, touchedMatches, added, removed);
  return { data: toData(collections), versions: nextVersions, outbox };
}

/**
 * The server sequence only grows; a cursor lower than ours means the database
 * was reset, so the device needs a full resync.
 */
export function isServerCursorBehind(localCursor: string | null, serverCursor: string): boolean {
  return localCursor !== null && Number(serverCursor) < Number(localCursor);
}

export interface ClubSelection {
  activeDivisionId: string;
  activeMatchId: string;
}

/**
 * Keeps the selected division and match when they still exist, otherwise picks
 * sensible defaults (a match in play, LIVE or at HALFTIME, first).
 */
export function reconcileSelection(selection: ClubSelection, data: SyncableClubData): ClubSelection {
  const hasDivision = data.divisions.some((division) => division.id === selection.activeDivisionId);
  const hasMatch = data.matches.some((match) => match.id === selection.activeMatchId);
  const fallbackMatch =
    data.matches.find((match) => match.status === 'LIVE' || match.status === 'HALFTIME') ?? data.matches[0];
  return {
    activeDivisionId: hasDivision ? selection.activeDivisionId : (data.divisions[0]?.id ?? ''),
    activeMatchId: hasMatch ? selection.activeMatchId : (fallbackMatch?.id ?? ''),
  };
}
