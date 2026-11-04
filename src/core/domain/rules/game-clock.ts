import type { Quarter } from '../entities/match.types';
import { QuarterSchema } from '../entities/match.types';
import {
  FIBA_OVERTIME_SECONDS,
  FIBA_REGULATION_QUARTER_SECONDS,
} from './basketball-rules';

/**
 * =============================================================================
 * HOOP - GAME CLOCK & PERIOD SEQUENCE (FIBA)
 * =============================================================================
 */

/**
 * Periods in playing order: Q1..Q4 followed by OT1..OT4.
 */
export const QUARTER_SEQUENCE: readonly Quarter[] = QuarterSchema.options;

export function isOvertime(quarter: Quarter): boolean {
  return quarter.startsWith('OT');
}

/** Q1 and Q2: the first half, followed by the halftime interval (FIBA). */
export function isFirstHalf(quarter: Quarter): boolean {
  return quarter === 'Q1' || quarter === 'Q2';
}

/** Moving from `from` to `to` leaves the first half, so it passes through halftime. */
export function crossesHalftime(from: Quarter, to: Quarter): boolean {
  return isFirstHalf(from) && !isFirstHalf(to);
}

/**
 * 10 minutes per regulation quarter, 5 minutes per overtime.
 */
export function getQuarterLengthSeconds(quarter: Quarter): number {
  return isOvertime(quarter) ? FIBA_OVERTIME_SECONDS : FIBA_REGULATION_QUARTER_SECONDS;
}

/**
 * Next period, or null after the last supported overtime.
 */
export function getNextQuarter(quarter: Quarter): Quarter | null {
  const index = QUARTER_SEQUENCE.indexOf(quarter);
  return QUARTER_SEQUENCE[index + 1] ?? null;
}

/**
 * Formats remaining seconds as "MM:SS".
 */
export function formatGameClock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

/**
 * Clamps a clock value to whole seconds within the quarter length.
 */
export function clampGameClock(seconds: number, quarter: Quarter): number {
  return Math.min(getQuarterLengthSeconds(quarter), Math.max(0, Math.round(seconds)));
}
