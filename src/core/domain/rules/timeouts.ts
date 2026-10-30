import type { Quarter, TeamTimeouts } from '../entities/match.types';
import { isOvertime } from './game-clock';

/**
 * =============================================================================
 * HOOP OS - TIMEOUTS (FIBA Art. 18)
 * 2 timeouts in the first half, 3 in the second half, 1 per overtime.
 * Unused timeouts do not carry over to the next half / overtime.
 * (The "max 2 in the last 2 minutes of Q4" restriction is not modelled.)
 * =============================================================================
 */

export type TimeoutPeriod = 'FIRST_HALF' | 'SECOND_HALF' | 'OVERTIME';

export const FIBA_TIMEOUTS: Record<TimeoutPeriod, number> = {
  FIRST_HALF: 2,
  SECOND_HALF: 3,
  OVERTIME: 1,
};

const PERIOD_FIELD: Record<TimeoutPeriod, keyof TeamTimeouts> = {
  FIRST_HALF: 'firstHalfRemaining',
  SECOND_HALF: 'secondHalfRemaining',
  OVERTIME: 'overtimeRemaining',
};

export type ConsumeTimeoutResult =
  | { ok: true; timeouts: TeamTimeouts; remaining: number }
  | { ok: false; reason: 'NO_TIMEOUTS_LEFT' };

export function createInitialTimeouts(): TeamTimeouts {
  return {
    firstHalfRemaining: FIBA_TIMEOUTS.FIRST_HALF,
    secondHalfRemaining: FIBA_TIMEOUTS.SECOND_HALF,
    overtimeRemaining: FIBA_TIMEOUTS.OVERTIME,
  };
}

export function getTimeoutPeriod(quarter: Quarter): TimeoutPeriod {
  if (isOvertime(quarter)) return 'OVERTIME';
  return quarter === 'Q1' || quarter === 'Q2' ? 'FIRST_HALF' : 'SECOND_HALF';
}

export function getRemainingTimeouts(timeouts: TeamTimeouts, quarter: Quarter): number {
  return timeouts[PERIOD_FIELD[getTimeoutPeriod(quarter)]];
}

export function consumeTimeout(
  timeouts: TeamTimeouts,
  quarter: Quarter
): ConsumeTimeoutResult {
  const field = PERIOD_FIELD[getTimeoutPeriod(quarter)];
  const available = timeouts[field];
  if (available <= 0) return { ok: false, reason: 'NO_TIMEOUTS_LEFT' };
  const remaining = available - 1;
  return { ok: true, timeouts: { ...timeouts, [field]: remaining }, remaining };
}

/**
 * Each overtime grants a fresh timeout.
 */
export function resetOvertimeTimeouts(timeouts: TeamTimeouts): TeamTimeouts {
  return { ...timeouts, overtimeRemaining: FIBA_TIMEOUTS.OVERTIME };
}
