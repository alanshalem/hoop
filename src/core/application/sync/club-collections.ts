import type { Match, PlayByPlayEvent } from '@/core/domain/entities/match.types';
import { withDerivedScoreboard } from '@/core/domain/rules/match-derivations';
import { compareEventsByTime } from './sync-records';
import type { SyncableClubData } from './sync-types';

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

export type Collections = {
  division: Collection<SyncableClubData['divisions'][number]>;
  team: Collection<SyncableClubData['teams'][number]>;
  player: Collection<SyncableClubData['players'][number]>;
  match: Collection<Match>;
  chartCode: Collection<SyncableClubData['chartCodes'][number]>;
};

export function createCollections(data: SyncableClubData): Collections {
  return {
    division: new Collection(data.divisions),
    team: new Collection(data.teams),
    player: new Collection(data.players),
    match: new Collection(data.matches),
    chartCode: new Collection(data.chartCodes),
  };
}

export function hasCollectionChanges(collections: Collections): boolean {
  return Object.values(collections).some((collection) => collection.changed);
}

export function toData(collections: Collections): SyncableClubData {
  return {
    divisions: collections.division.toArray(),
    teams: collections.team.toArray(),
    players: collections.player.toArray(),
    matches: collections.match.toArray(),
    chartCodes: collections.chartCode.toArray(),
  };
}

/** Adds and removes events of the touched matches, then re-derives their scoreboard. */
export function applyEventChanges(
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
