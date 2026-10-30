import type { Match, PlayByPlayEvent } from '@/core/domain/entities/match.types';
import { withDerivedScoreboard } from '@/core/domain/rules/match-derivations';
import { createEmptyOutbox } from './outbox';
import { compareEventsByTime, recordKey, timeOf } from './sync-records';
import type { Outbox, PulledChanges, SyncableClubData, SyncRecord, VersionMap } from './sync-types';

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
    const remoteTime = timeOf(record.updatedAt);
    const local = versions[key];
    if (local !== undefined && remoteTime < timeOf(local)) continue;

    versions[key] = record.updatedAt;
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

  const changed = Object.values(collections).some((collection) => collection.changed);
  return {
    data: changed ? toData(collections) : state.data,
    versions,
    outbox: { ...state.outbox, records: outboxRecords, events: outboxEvents },
    changed,
  };
}

type Collections = {
  division: Collection<SyncableClubData['divisions'][number]>;
  team: Collection<SyncableClubData['teams'][number]>;
  player: Collection<SyncableClubData['players'][number]>;
  match: Collection<Match>;
};

function createCollections(data: SyncableClubData): Collections {
  return {
    division: new Collection(data.divisions),
    team: new Collection(data.teams),
    player: new Collection(data.players),
    match: new Collection(data.matches),
  };
}

function toData(collections: Collections): SyncableClubData {
  return {
    divisions: collections.division.toArray(),
    teams: collections.team.toArray(),
    players: collections.player.toArray(),
    matches: collections.match.toArray(),
  };
}

/** Adds and removes events of the touched matches, then re-derives their scoreboard. */
function applyEventChanges(
  matches: Collection<Match>,
  touchedMatches: Set<string>,
  added: Map<string, PlayByPlayEvent[]>,
  removed: Set<string>
): void {
  for (const matchId of touchedMatches) {
    const match = matches.get(matchId);
    if (!match) continue;
    const additions = added.get(matchId) ?? [];
    const kept = match.events.filter((event) => !removed.has(event.id));
    if (additions.length === 0 && kept.length === match.events.length && !matches.isReplaced(matchId)) {
      continue;
    }
    const events = additions.length > 0 ? [...kept, ...additions].sort(compareEventsByTime) : kept;
    matches.set(matchId, withDerivedScoreboard({ ...match, events }));
  }
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

/** Ordered id map over an entity list that keeps the original array when untouched. */
class Collection<T extends { id: string }> {
  private readonly byId: Map<string, T>;
  private readonly replaced = new Set<string>();
  changed = false;

  constructor(private readonly original: T[]) {
    this.byId = new Map(original.map((entity) => [entity.id, entity]));
  }

  get(id: string): T | undefined {
    return this.byId.get(id);
  }

  set(id: string, entity: T): void {
    this.byId.set(id, entity);
    this.changed = true;
  }

  remove(id: string): void {
    if (this.byId.delete(id)) this.changed = true;
  }

  markReplaced(id: string): void {
    this.replaced.add(id);
  }

  isReplaced(id: string): boolean {
    return this.replaced.has(id);
  }

  toArray(): T[] {
    return this.changed ? [...this.byId.values()] : this.original;
  }
}

/**
 * Full sync (first sync of a device, or after a server reset): the server
 * snapshot replaces the local data (the bundled demo seed is never pushed), then
 * every pending local change is re-applied over it and stays in the outbox to be
 * flushed. A pending record the server already has a newer or equal version of
 * is dropped (last-write-wins), exactly as in an incremental pull.
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
    nextVersions[key] = entry.updatedAt;
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

/** Keeps the selected division and match when they still exist, otherwise picks sensible defaults. */
export function reconcileSelection(selection: ClubSelection, data: SyncableClubData): ClubSelection {
  const hasDivision = data.divisions.some((division) => division.id === selection.activeDivisionId);
  const hasMatch = data.matches.some((match) => match.id === selection.activeMatchId);
  const fallbackMatch = data.matches.find((match) => match.status === 'LIVE') ?? data.matches[0];
  return {
    activeDivisionId: hasDivision ? selection.activeDivisionId : (data.divisions[0]?.id ?? ''),
    activeMatchId: hasMatch ? selection.activeMatchId : (fallbackMatch?.id ?? ''),
  };
}
