import type { Player } from '@/core/domain/entities/club.types';
import type { PlayByPlayEvent, Quarter } from '@/core/domain/entities/match.types';
import { isFoulEvent } from '@/core/domain/rules/event-rules';
import { getNextQuarter, isOvertime, QUARTER_SEQUENCE } from '@/core/domain/rules/game-clock';

/**
 * =============================================================================
 * HOOP - LIVE CONSOLE RULES
 * Period navigation and roster decisions for the live console (pure).
 * =============================================================================
 */

/** Fouls of each own player in the whole match (FOUL_* events only; chart foul codes are notes). */
export function countOwnFoulsByPlayer(events: readonly PlayByPlayEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (!event.isOwnTeam || !event.playerId || !isFoulEvent(event.type)) continue;
    counts.set(event.playerId, (counts.get(event.playerId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Q1-Q4 always; overtimes unlock one at a time from the 4th quarter on.
 */
export function getSelectableQuarters(current: Quarter): Quarter[] {
  const currentIndex = QUARTER_SEQUENCE.indexOf(current);
  return QUARTER_SEQUENCE.filter(
    (quarter, index) => !isOvertime(quarter) || index <= currentIndex + 1
  );
}

export type PeriodEndAction =
  | { kind: 'ADVANCE'; next: Quarter }
  | { kind: 'HALFTIME' }
  | { kind: 'FINISH' }
  | { kind: 'NONE' };

/**
 * What to offer when the clock reaches 00:00: halftime after Q2, the next
 * quarter during the rest of regulation, finishing the match after Q4 / an overtime when not tied, or
 * another overtime when tied.
 */
export function getPeriodEndAction(
  quarter: Quarter,
  score: { own: number; rival: number }
): PeriodEndAction {
  if (quarter === 'Q2') return { kind: 'HALFTIME' };
  const isFinalPeriod = quarter === 'Q4' || isOvertime(quarter);
  if (isFinalPeriod && score.own !== score.rival) return { kind: 'FINISH' };
  const next = getNextQuarter(quarter);
  return next ? { kind: 'ADVANCE', next } : { kind: 'NONE' };
}

/** The match roster for the charting pad, by dorsal, with no on-court distinction (S15). */
export function getRosterPlayers(rosterIds: readonly string[], players: readonly Player[]): Player[] {
  const inRoster = new Set(rosterIds);
  return players.filter((player) => inRoster.has(player.id)).sort((a, b) => a.dorsal - b.dorsal);
}
