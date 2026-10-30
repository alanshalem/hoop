import type { PlayByPlayEvent, Quarter } from '@/core/domain/entities/match.types';
import { calculatePercentage, type ShootingStats } from '@/core/domain/rules/basketball-rules';
import {
  isFieldGoalAttempt,
  isFieldGoalMade,
  isThreePointAttempt,
} from '@/core/domain/rules/event-rules';

/**
 * =============================================================================
 * HOOP OS - SHOT CHART ANALYTICS
 * Own-team field goal selection and effectiveness by zone (2P / 3P / total).
 * =============================================================================
 */

export const ALL_SHOTS = 'ALL';

export interface ShotFilter {
  quarter: Quarter | typeof ALL_SHOTS;
  playerId: string;
}

export interface ShotEffectiveness {
  fg2: ShootingStats;
  fg3: ShootingStats;
  total: ShootingStats;
}

const NO_FILTER: ShotFilter = { quarter: ALL_SHOTS, playerId: ALL_SHOTS };

/**
 * Own-team field goal attempts matching the period and player filter.
 */
export function selectOwnShots(
  events: PlayByPlayEvent[],
  filter: ShotFilter = NO_FILTER
): PlayByPlayEvent[] {
  return events.filter(
    (event) =>
      event.isOwnTeam &&
      isFieldGoalAttempt(event.type) &&
      (filter.quarter === ALL_SHOTS || event.quarter === filter.quarter) &&
      (filter.playerId === ALL_SHOTS || event.playerId === filter.playerId)
  );
}

function toShootingStats(made: number, attempted: number): ShootingStats {
  return { made, attempted, percentage: calculatePercentage(made, attempted) };
}

/**
 * Made / attempted / percentage per zone. Non field goal events are ignored.
 */
export function calculateShotEffectiveness(shots: PlayByPlayEvent[]): ShotEffectiveness {
  let fg2Made = 0;
  let fg2Attempted = 0;
  let fg3Made = 0;
  let fg3Attempted = 0;

  for (const { type } of shots) {
    if (!isFieldGoalAttempt(type)) continue;
    const made = isFieldGoalMade(type) ? 1 : 0;
    if (isThreePointAttempt(type)) {
      fg3Attempted += 1;
      fg3Made += made;
    } else {
      fg2Attempted += 1;
      fg2Made += made;
    }
  }

  return {
    fg2: toShootingStats(fg2Made, fg2Attempted),
    fg3: toShootingStats(fg3Made, fg3Attempted),
    total: toShootingStats(fg2Made + fg3Made, fg2Attempted + fg3Attempted),
  };
}
