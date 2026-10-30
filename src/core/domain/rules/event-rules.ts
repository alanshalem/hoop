import type {
  MatchCondition,
  PlayByPlayEventType,
  Quarter,
} from '../entities/match.types';

/**
 * =============================================================================
 * HOOP OS - PLAY-BY-PLAY EVENT CLASSIFICATION
 * Single place that knows what an event is worth and who it belongs to.
 * =============================================================================
 */

/**
 * Team ID recorded on rival events (the rival team is not modelled as an entity).
 */
export const RIVAL_TEAM_ID = 'rival-team';

const EVENT_POINTS: Partial<Record<PlayByPlayEventType, 1 | 2 | 3>> = {
  FT_MADE: 1,
  FG2_MADE: 2,
  FG3_MADE: 3,
};

/**
 * Points scored by an event (0 for non-scoring events).
 */
export function getEventPoints(type: PlayByPlayEventType): 0 | 1 | 2 | 3 {
  return EVENT_POINTS[type] ?? 0;
}

/**
 * Player fouls that count as team fouls (FIBA Art. 41).
 */
export function isFoulEvent(type: PlayByPlayEventType): boolean {
  return (
    type === 'FOUL_PERSONAL' ||
    type === 'FOUL_TECHNICAL' ||
    type === 'FOUL_UNSPORTSMANLIKE'
  );
}

export function isFieldGoalAttempt(type: PlayByPlayEventType): boolean {
  return (
    type === 'FG2_MADE' ||
    type === 'FG2_MISS' ||
    type === 'FG3_MADE' ||
    type === 'FG3_MISS'
  );
}

export function isThreePointAttempt(type: PlayByPlayEventType): boolean {
  return type === 'FG3_MADE' || type === 'FG3_MISS';
}

export function isFieldGoalMade(type: PlayByPlayEventType): boolean {
  return type === 'FG2_MADE' || type === 'FG3_MADE';
}

/**
 * Whether an event belongs to the home side of the scoreboard.
 */
export function isHomeTeamEvent(
  condition: MatchCondition,
  isOwnTeam: boolean
): boolean {
  return (condition === 'HOME') === isOwnTeam;
}

/**
 * FIBA Art. 41.1.1: team fouls committed in any extra period count as committed
 * in the 4th quarter, so Q4 and every overtime share one team-foul period.
 */
export function isSameTeamFoulPeriod(a: Quarter, b: Quarter): boolean {
  return toTeamFoulPeriod(a) === toTeamFoulPeriod(b);
}

function toTeamFoulPeriod(quarter: Quarter): Quarter {
  return quarter.startsWith('OT') ? 'Q4' : quarter;
}
