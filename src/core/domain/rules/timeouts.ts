import type { Quarter, TeamTimeouts } from '../entities/match.types';
import { isOvertime } from './game-clock';

/**
 * =============================================================================
 * HOOP OS - TIMEOUTS (FIBA Art. 18)
 * 2 timeouts in the first half, 3 in the second half, 1 per overtime.
 * Unused timeouts do not carry over to the next half / overtime.
 * Art. 18.2.5: at most 2 timeouts per team when the game clock shows 2:00 or
 * less in the 4th quarter (a third second-half timeout is forfeited).
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

/** FIBA Art. 18.2.5: the restricted span starts when the Q4 clock shows 2:00. */
export const FIBA_LAST_TWO_MINUTES_SECONDS = 120;
export const FIBA_LAST_TWO_MINUTES_MAX_TIMEOUTS = 2;

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

export function isLastTwoMinutesOfFourthQuarter(quarter: Quarter, clockSeconds: number): boolean {
  return quarter === 'Q4' && clockSeconds <= FIBA_LAST_TWO_MINUTES_SECONDS;
}

/**
 * Timeouts the team can still use now. Pass the game clock so the last-2-minutes
 * rule applies: entering that span with 3 second-half timeouts leaves only 2 usable.
 */
export function getRemainingTimeouts(timeouts: TeamTimeouts, quarter: Quarter, clockSeconds?: number): number {
  const available = timeouts[PERIOD_FIELD[getTimeoutPeriod(quarter)]];
  if (clockSeconds === undefined || !isLastTwoMinutesOfFourthQuarter(quarter, clockSeconds)) return available;
  return Math.min(available, FIBA_LAST_TWO_MINUTES_MAX_TIMEOUTS);
}

/**
 * Uses one timeout of the current period. In the last 2 minutes of Q4 the
 * forfeited one is dropped too, so the stored count never allows a third.
 */
export function consumeTimeout(
  timeouts: TeamTimeouts,
  quarter: Quarter,
  clockSeconds?: number
): ConsumeTimeoutResult {
  const field = PERIOD_FIELD[getTimeoutPeriod(quarter)];
  const available = getRemainingTimeouts(timeouts, quarter, clockSeconds);
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
