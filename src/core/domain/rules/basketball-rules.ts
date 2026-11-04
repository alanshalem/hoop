import { PlayByPlayEvent } from '../entities/match.types';
import { getEventPoints } from './event-rules';

/**
 * =============================================================================
 * HOOP - FIBA THRESHOLDS & BOX SCORE
 * Pure, framework-agnostic domain functions: FIBA foul and clock thresholds and
 * the scoring line of the box score (points and made shots).
 * =============================================================================
 */

// -----------------------------------------------------------------------------
// FIBA THRESHOLDS & CONSTANTS
// -----------------------------------------------------------------------------

/**
 * One foul short of the FIBA Art. 40 exclusion (5 fouls).
 */
export const FIBA_FOUL_TROUBLE_THRESHOLD = 4;

/**
 * In FIBA Art. 41: A team is in a team foul penalty situation (Bonus) when it has
 * committed 4 team fouls in a quarter. All subsequent personal fouls award 2 free throws.
 */
export const FIBA_TEAM_FOULS_BONUS_THRESHOLD = 4;

/**
 * Standard length of a FIBA quarter in seconds (10 minutes = 600s).
 */
export const FIBA_REGULATION_QUARTER_SECONDS = 600;

/**
 * Standard length of a FIBA overtime in seconds (5 minutes = 300s).
 */
export const FIBA_OVERTIME_SECONDS = 300;

// -----------------------------------------------------------------------------
// DATA STRUCTURES
// -----------------------------------------------------------------------------

export interface MadeShots {
  made: number;
}

/**
 * What the box score shows: points and made shots, the scoring plays the sheet records.
 */
export interface ScoringLine {
  points: number;
  // Free throws (T1)
  ft: MadeShots;
  // 2-point field goals (T2)
  fg2: MadeShots;
  // 3-point field goals (T3)
  fg3: MadeShots;
}

export interface PlayerBoxScore extends ScoringLine {
  playerId: string;
}

export interface TeamBoxScore extends ScoringLine {
  teamId: string;
}

export interface MatchBoxScoresResult {
  players: Record<string, PlayerBoxScore>;
  teamTotal: TeamBoxScore;
}

// -----------------------------------------------------------------------------
// HELPER FUNCTIONS (PURE)
// -----------------------------------------------------------------------------

/**
 * Computes shooting percentage safely, rounded to 1 decimal place.
 */
export function calculatePercentage(made: number, attempted: number): number {
  if (attempted <= 0) return 0;
  return Math.round((made / attempted) * 1000) / 10;
}

/**
 * Evaluates whether a team is in bonus/penalty situation for the quarter.
 * In FIBA: >= 4 team fouls in the quarter.
 */
export function isTeamInBonus(teamFoulsInQuarter: number): boolean {
  return teamFoulsInQuarter >= FIBA_TEAM_FOULS_BONUS_THRESHOLD;
}

// -----------------------------------------------------------------------------
// BOX SCORE COMPILATION
// -----------------------------------------------------------------------------

/** The made-shot counter each basket value feeds. */
const SHOT_BY_POINTS = { 1: 'ft', 2: 'fg2', 3: 'fg3' } as const;

function emptyScoringLine(): ScoringLine {
  return { points: 0, ft: { made: 0 }, fg2: { made: 0 }, fg3: { made: 0 } };
}

function addScoringLine(total: ScoringLine, line: ScoringLine): void {
  total.points += line.points;
  total.ft.made += line.ft.made;
  total.fg2.made += line.fg2.made;
  total.fg3.made += line.fg3.made;
}

/**
 * Scoring line of a player from the play-by-play: the baskets attributed to them.
 */
export function calculatePlayerBoxScore(
  playerId: string,
  events: readonly PlayByPlayEvent[]
): PlayerBoxScore {
  const line: PlayerBoxScore = { playerId, ...emptyScoringLine() };
  for (const event of events) {
    if (event.playerId !== playerId) continue;
    const points = getEventPoints(event.type);
    if (points === 0) continue;
    line.points += points;
    line[SHOT_BY_POINTS[points]].made += 1;
  }
  return line;
}

/**
 * Scoring lines of the listed players and their sum as the team total.
 */
export function calculateTeamBoxScore(
  teamId: string,
  playerIds: readonly string[],
  events: readonly PlayByPlayEvent[]
): MatchBoxScoresResult {
  const players: Record<string, PlayerBoxScore> = {};
  const teamTotal: TeamBoxScore = { teamId, ...emptyScoringLine() };

  for (const playerId of playerIds) {
    const line = calculatePlayerBoxScore(playerId, events);
    players[playerId] = line;
    addScoringLine(teamTotal, line);
  }

  return { players, teamTotal };
}
