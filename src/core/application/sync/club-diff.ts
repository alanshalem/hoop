import type { Match } from '@/core/domain/entities/match.types';
import { changedMatchFields } from './match-fields';
import { entitiesOf, SYNC_RECORD_KINDS, type SyncableClubData } from './record-kinds';
import { toMatchRecord } from './sync-records';
import type { ClubDiff, EventChange, RecordChange } from './sync-types';

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

  for (const kind of SYNC_RECORD_KINDS) {
    if (kind === 'match') continue;
    const before = entitiesOf(prev, kind);
    const after = entitiesOf(next, kind);
    if (before === after) continue;
    const { upserts, removed } = diffById<{ id: string }>(before, after);
    records.push(
      ...upserts.map((data) => ({ kind, id: data.id, data, deleted: false }) as RecordChange),
      ...removed.map((data) => ({ kind, id: data.id, data, deleted: true }) as RecordChange)
    );
  }

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
