import type { Match, PlayByPlayEvent } from '@/core/domain/entities/match.types';
import { withDerivedScoreboard } from '@/core/domain/rules/match-derivations';
import {
  clubDataFrom,
  entitiesOf,
  SYNC_RECORD_KINDS,
  type SyncableClubData,
  type SyncEntityByKind,
  type SyncRecordKind,
} from './record-kinds';
import { compareEventsByTime } from './sync-records';
import type { SyncEvent } from './sync-types';

/**
 * Mutable working copy of the synced club collections, shared by the pull
 * merge and the tab hand-over (internal to the sync module).
 */

/** Ordered id map over an entity list that keeps the original array when untouched. */
export class Collection<T extends { id: string }> {
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

export type Collections = { [K in SyncRecordKind]: Collection<SyncEntityByKind[K]> };

export function createCollections(data: SyncableClubData): Collections {
  return Object.fromEntries(
    SYNC_RECORD_KINDS.map((kind) => [kind, new Collection(entitiesOf(data, kind))])
  ) as Collections;
}

export function hasCollectionChanges(collections: Collections): boolean {
  return Object.values(collections).some((collection) => collection.changed);
}

export function toData(collections: Collections): SyncableClubData {
  return clubDataFrom((kind) => collections[kind].toArray());
}

/** Upserts an entity stored as is (every kind but `match`, whose record lacks its events). */
export function setEntity<K extends SyncRecordKind>(
  collections: Collections,
  kind: K,
  id: string,
  entity: SyncEntityByKind[K]
): void {
  const collection: Collection<SyncEntityByKind[K]> = collections[kind];
  collection.set(id, entity);
}

/**
 * Adds and removes synced events of the matches this data has (a tombstone
 * removes the event, a live event already present is skipped), then re-derives
 * the scoreboard of every touched match. `touchedMatches` gains the matches of
 * the events; it may already hold matches whose record was replaced.
 */
export function applyEventChanges(
  matches: Collection<Match>,
  events: Iterable<SyncEvent>,
  touchedMatches: Set<string>
): void {
  const added = new Map<string, PlayByPlayEvent[]>();
  const removed = new Set<string>();
  for (const event of events) {
    const match = matches.get(event.matchId);
    if (!match) continue;
    touchedMatches.add(event.matchId);
    if (event.deleted) {
      removed.add(event.id);
      continue;
    }
    const additions = added.get(event.matchId) ?? [];
    if (match.events.some((existing) => existing.id === event.id)) continue;
    if (additions.some((pending) => pending.id === event.id)) continue;
    added.set(event.matchId, [...additions, event.data]);
  }

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
