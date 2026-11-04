import type { Match } from '@/core/domain/entities/match.types';
import { isMatchInPlay } from '@/presentation/organisms/MatchCard/match-display';

/** SETUP: before tip-off. IN_PLAY: starters locked, roster can grow. FINISHED: read-only. */
export type LineupMode = 'SETUP' | 'IN_PLAY' | 'FINISHED';

export const getLineupMode = (match: Pick<Match, 'status'>): LineupMode => {
  if (match.status === 'SCHEDULED') return 'SETUP';
  return isMatchInPlay(match) ? 'IN_PLAY' : 'FINISHED';
};

/**
 * Starters selected when the page opens. Before tip-off only players still in
 * the roster list can start; afterwards it is the starting five saved at
 * tip-off (`startingLineupOwn`, the only lineup the model keeps, L6).
 */
export function initialStarterIds(
  match: Pick<Match, 'startingLineupOwn'>,
  mode: LineupMode,
  rosterIds: readonly string[]
): string[] {
  if (mode !== 'SETUP') return [...match.startingLineupOwn];
  return match.startingLineupOwn.filter((playerId) => rosterIds.includes(playerId));
}
