import type { Match } from '@/core/domain/entities/match.types';
import { changedMatchFields } from './match-fields';
import { toMatchRecord } from './sync-records';
import type { ClubDiff, EventChange, RecordChange, SyncableClubData } from './sync-types';

/**
 * Local changes between two club states. Store updates are immutable, so an
 * untouched entity keeps its reference: a new reference (or a new id) is a
 * change, a missing id is a removal that carries the last known data.
 * A match record is sent only when a versioned field changed (S13.1): the
 * derived scoreboard travels with its events.
 */
export function diffClubState(prev: SyncableClubData, next: SyncableClubData): ClubDiff {
  const records: RecordChange[] = [];
  const events: EventChange[] = [];

  records.push(
    ...collectionChanges(prev.divisions, next.divisions, (data, deleted) => ({ kind: 'division', id: data.id, data, deleted })),
    ...collectionChanges(prev.teams, next.teams, (data, deleted) => ({ kind: 'team', id: data.id, data, deleted })),
    ...collectionChanges(prev.players, next.players, (data, deleted) => ({ kind: 'player', id: data.id, data, deleted })),
    ...collectionChanges(prev.chartCodes, next.chartCodes, (data, deleted) => ({
      kind: 'chartCode',
      id: data.id,
      data,
      deleted,
    }))
  );

  if (prev.matches !== next.matches) {
    const { upserts, removed, previous } = diffById(prev.matches, next.matches);
    for (const match of upserts) {
      const before = previous.get(match.id);
      if (!before) {
        records.push({ kind: 'match', id: match.id, data: toMatchRecord(match), deleted: false });
      } else {
        const changedFields = changedMatchFields(before, match);
        if (changedFields.length > 0) {
          records.push({ kind: 'match', id: match.id, data: toMatchRecord(match), deleted: false, changedFields });
        }
      }
      events.push(...diffEvents(before, match));
    }
    records.push(
      ...removed.map((match): RecordChange => ({
        kind: 'match',
        id: match.id,
        data: toMatchRecord(match),
        deleted: true,
      }))
    );
  }

  return { records, events };
}

function collectionChanges<T extends { id: string }>(
  prev: T[],
  next: T[],
  toChange: (data: T, deleted: boolean) => RecordChange
): RecordChange[] {
  if (prev === next) return [];
  const { upserts, removed } = diffById(prev, next);
  return [...upserts.map((data) => toChange(data, false)), ...removed.map((data) => toChange(data, true))];
}

function diffById<T extends { id: string }>(prev: T[], next: T[]) {
  const previous = new Map(prev.map((entity) => [entity.id, entity]));
  const nextIds = new Set(next.map((entity) => entity.id));
  return {
    previous,
    upserts: next.filter((entity) => previous.get(entity.id) !== entity),
    removed: prev.filter((entity) => !nextIds.has(entity.id)),
  };
}

function diffEvents(before: Match | undefined, after: Match): EventChange[] {
  if (before && before.events === after.events) return [];
  const previousIds = new Set(before?.events.map((event) => event.id));
  const nextIds = new Set(after.events.map((event) => event.id));
  return [
    ...after.events
      .filter((event) => !previousIds.has(event.id))
      .map((event) => ({ id: event.id, matchId: after.id, data: event, deleted: false })),
    ...(before?.events ?? [])
      .filter((event) => !nextIds.has(event.id))
      .map((event) => ({ id: event.id, matchId: after.id, data: event, deleted: true })),
  ];
}
