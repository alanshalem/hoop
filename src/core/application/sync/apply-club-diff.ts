import type { Match, PlayByPlayEvent } from '@/core/domain/entities/match.types';
import { applyEventChanges, createCollections, hasCollectionChanges, toData } from './club-collections';
import type { MatchField } from './match-fields';
import type { ClubDiff, MatchRecord, SyncableClubData } from './sync-types';

/**
 * Replays a club diff made in another tab onto this tab's data (S13.3): the
 * leader applies a follower's edits, then its sync engine sees them as local
 * changes and enqueues them. Match edits apply only their changed fields, so a
 * concurrent edit of other fields in the leader survives; events are added and
 * removed by id (only for matches this tab has) and the scoreboard re-derived.
 * Collections the diff does not touch keep their references.
 */
export function applyClubDiff(data: SyncableClubData, diff: ClubDiff): SyncableClubData {
  const collections = createCollections(data);
  const touchedMatches = new Set<string>();

  for (const change of diff.records) {
    if (change.deleted) {
      collections[change.kind].remove(change.id);
      continue;
    }
    switch (change.kind) {
      case 'division':
        collections.division.set(change.id, change.data);
        break;
      case 'team':
        collections.team.set(change.id, change.data);
        break;
      case 'player':
        collections.player.set(change.id, change.data);
        break;
      case 'chartCode':
        collections.chartCode.set(change.id, change.data);
        break;
      case 'match': {
        const current = collections.match.get(change.id);
        const next = current && change.changedFields
          ? withFields(current, change.data, change.changedFields)
          : { ...change.data, events: current?.events ?? [] };
        collections.match.set(change.id, next);
        collections.match.markReplaced(change.id);
        touchedMatches.add(change.id);
        break;
      }
    }
  }

  const added = new Map<string, PlayByPlayEvent[]>();
  const removed = new Set<string>();
  for (const event of diff.events) {
    const match = collections.match.get(event.matchId);
    if (!match) continue;
    touchedMatches.add(event.matchId);
    if (event.deleted) {
      removed.add(event.id);
    } else if (!match.events.some((existing) => existing.id === event.id)) {
      added.set(event.matchId, [...(added.get(event.matchId) ?? []), event.data]);
    }
  }
  applyEventChanges(collections.match, touchedMatches, added, removed);

  return hasCollectionChanges(collections) ? toData(collections) : data;
}

/** `match` with `fields` copied from `source` (a field absent in `source` is removed). */
function withFields(match: Match, source: MatchRecord, fields: readonly MatchField[]): Match {
  const next: Record<string, unknown> = { ...match };
  for (const field of fields) {
    if (source[field] === undefined) delete next[field];
    else next[field] = source[field];
  }
  return next as Match;
}
