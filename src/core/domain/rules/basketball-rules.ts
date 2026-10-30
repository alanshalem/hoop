import {
  PlayByPlayEvent,
  Quarter,
} from '../entities/match.types';

/**
 * =============================================================================
 * HOOP OS - FIBA BASKETBALL DOMAIN RULES & STATISTICAL ENGINE
 * Pure, framework-agnostic, zero-dependency domain functions.
 * Strictly compliant with official FIBA rules and PIR (Valuation) standards.
 * =============================================================================
 */

// -----------------------------------------------------------------------------
// FIBA THRESHOLDS & CONSTANTS
// -----------------------------------------------------------------------------

/**
 * In FIBA Art. 40: A player who has committed 5 fouls (personal, technical,
 * or unsportsmanlike) must leave the game immediately (fouled out).
 */
export const FIBA_MAX_PLAYER_FOULS = 5;

/**
 * Threshold for warning indicator (Amber alert: 1 foul away from exclusion).
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

export interface ShootingStats {
  made: number;
  attempted: number;
  percentage: number; // 0.0 to 100.0 (rounded to 1 decimal place)
}

export interface PlayerFoulBreakdown {
  personal: number;
  technical: number;
  unsportsmanlike: number;
  total: number;
  isFouledOut: boolean;
  isInFoulTrouble: boolean;
}

export interface PlayerBoxScore {
  playerId: string;
  points: number;
  // Free throws (T1)
  ft: ShootingStats;
  // 2-point field goals (T2)
  fg2: ShootingStats;
  // 3-point field goals (T3)
  fg3: ShootingStats;
  // Total field goals (TC = T2 + T3)
  fgTotal: ShootingStats;
  // Rebounds
  offensiveRebounds: number;
  defensiveRebounds: number;
  totalRebounds: number;
  // Playmaking & Defense
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  // Fouls
  fouls: PlayerFoulBreakdown;
  // Plus / Minus (+/-)
  plusMinus: number;
  // FIBA Efficiency / PIR (Performance Index Rating)
  pir: number;
}

export interface TeamBoxScore {
  teamId: string;
  points: number;
  ft: ShootingStats;
  fg2: ShootingStats;
  fg3: ShootingStats;
  fgTotal: ShootingStats;
  offensiveRebounds: number;
  defensiveRebounds: number;
  totalRebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  totalFouls: number;
  pir: number;
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
 * Evaluates whether a player is fouled out (5 fouls in FIBA).
 */
export function isPlayerFouledOut(totalFouls: number): boolean {
  return totalFouls >= FIBA_MAX_PLAYER_FOULS;
}

/**
 * Evaluates whether a player is in foul trouble (4 fouls in FIBA).
 */
export function isPlayerInFoulTrouble(totalFouls: number): boolean {
  return totalFouls === FIBA_FOUL_TROUBLE_THRESHOLD;
}

/**
 * Evaluates whether a team is in bonus/penalty situation for the quarter.
 * In FIBA: >= 4 team fouls in the quarter.
 */
export function isTeamInBonus(teamFoulsInQuarter: number): boolean {
  return teamFoulsInQuarter >= FIBA_TEAM_FOULS_BONUS_THRESHOLD;
}

// -----------------------------------------------------------------------------
// FIBA FOUL CALCULATIONS FROM PLAY-BY-PLAY
// -----------------------------------------------------------------------------

/**
 * Extracts foul breakdown for a specific player from the match events.
 */
export function getPlayerFoulsFromEvents(
  playerId: string,
  events: PlayByPlayEvent[]
): PlayerFoulBreakdown {
  let personal = 0;
  let technical = 0;
  let unsportsmanlike = 0;

  for (const event of events) {
    if (event.playerId !== playerId) continue;

    if (event.type === 'FOUL_PERSONAL') personal++;
    else if (event.type === 'FOUL_TECHNICAL') technical++;
    else if (event.type === 'FOUL_UNSPORTSMANLIKE') unsportsmanlike++;
  }

  const total = personal + technical + unsportsmanlike;

  return {
    personal,
    technical,
    unsportsmanlike,
    total,
    isFouledOut: isPlayerFouledOut(total),
    isInFoulTrouble: isPlayerInFoulTrouble(total),
  };
}

/**
 * Computes team fouls for a specific quarter.
 * Note on FIBA Overtime: Art. 41.1.3 states that overtimes carry team fouls from Q4 or count toward penalty.
 * If separate tracking per quarter is passed, this checks the specific quarter.
 */
export function getTeamFoulsForQuarter(
  quarter: Quarter,
  teamId: string,
  events: PlayByPlayEvent[]
): number {
  let count = 0;
  for (const event of events) {
    if (event.teamId !== teamId) continue;
    if (event.quarter !== quarter) continue;

    if (
      event.type === 'FOUL_PERSONAL' ||
      event.type === 'FOUL_TECHNICAL' ||
      event.type === 'FOUL_UNSPORTSMANLIKE'
    ) {
      count++;
    }
  }
  return count;
}

/**
 * Checks if a team has reached bonus (>= 4 team fouls) in a given quarter.
 */
export function isTeamInBonusFromEvents(
  quarter: Quarter,
  teamId: string,
  events: PlayByPlayEvent[]
): boolean {
  const fouls = getTeamFoulsForQuarter(quarter, teamId, events);
  return isTeamInBonus(fouls);
}

// -----------------------------------------------------------------------------
// FIBA PIR (VALUATION / PERFORMANCE INDEX RATING)
// -----------------------------------------------------------------------------

/**
 * Official FIBA Performance Index Rating (PIR) calculation formula:
 *
 * PIR = (PTS + REB + AST + STL + BLK) - (Missed FG + Missed FT + TOV + Personal Fouls)
 *
 * Positive values increase rating; missed opportunities, turnovers, and fouls decrease it.
 */
export function calculateFibaPir(stats: {
  points: number;
  totalRebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  missedFieldGoals: number;
  missedFreeThrows: number;
  turnovers: number;
  totalFouls: number;
}): number {
  const positive =
    stats.points +
    stats.totalRebounds +
    stats.assists +
    stats.steals +
    stats.blocks;

  const negative =
    stats.missedFieldGoals +
    stats.missedFreeThrows +
    stats.turnovers +
    stats.totalFouls;

  return positive - negative;
}

// -----------------------------------------------------------------------------
// PLUS / MINUS (+/-) CALCULATION
// -----------------------------------------------------------------------------

/**
 * Calculates the Plus/Minus (+/-) rating for a player based on game scoring events
 * occurring while the player was actively on the court.
 *
 * @param playerId The player ID to evaluate.
 * @param initialLineup Player IDs on court at the start of the events sequence.
 * @param events Chronological play-by-play events.
 * @param ownTeamId The player's team ID.
 */
export function calculatePlayerPlusMinus(
  playerId: string,
  initialLineup: string[],
  events: PlayByPlayEvent[],
  ownTeamId: string
): number {
  const currentLineup = new Set<string>(initialLineup);
  let plusMinus = 0;

  for (const event of events) {
    // Process substitutions to maintain exact on-court state
    if (event.type === 'SUBSTITUTION' && event.substitution) {
      if (event.isOwnTeam || event.teamId === ownTeamId) {
        currentLineup.delete(event.substitution.playerOutId);
        currentLineup.add(event.substitution.playerInId);
      }
      continue;
    }

    // Only scoring events affect +/-
    let points = 0;
    if (event.type === 'FT_MADE') points = 1;
    else if (event.type === 'FG2_MADE') points = 2;
    else if (event.type === 'FG3_MADE') points = 3;

    if (points === 0) continue;

    // Check if the target player was on court when this basket occurred
    if (currentLineup.has(playerId)) {
      const isScoredByOwnTeam = event.isOwnTeam || event.teamId === ownTeamId;
      if (isScoredByOwnTeam) {
        plusMinus += points;
      } else {
        plusMinus -= points;
      }
    }
  }

  return plusMinus;
}

// -----------------------------------------------------------------------------
// BOX SCORE COMPILATION
// -----------------------------------------------------------------------------

/**
 * Computes full player box score from play-by-play events.
 *
 * @param playerId Target player ID.
 * @param events All match events.
 * @param initialLineup Starting 5 lineup on court (optional, for +/- tracking).
 * @param ownTeamId Team ID of player (optional, for +/- tracking).
 */
export function calculatePlayerBoxScore(
  playerId: string,
  events: PlayByPlayEvent[],
  initialLineup: string[] = [],
  ownTeamId: string = ''
): PlayerBoxScore {
  let ftMade = 0;
  let ftAttempted = 0;
  let fg2Made = 0;
  let fg2Attempted = 0;
  let fg3Made = 0;
  let fg3Attempted = 0;

  let oreb = 0;
  let dreb = 0;
  let ast = 0;
  let stl = 0;
  let blk = 0;
  let tov = 0;

  let personalFouls = 0;
  let technicalFouls = 0;
  let unsportsmanlikeFouls = 0;

  for (const event of events) {
    // Check if event is attributed directly to this player
    if (event.playerId === playerId) {
      switch (event.type) {
        case 'FT_MADE':
          ftMade++;
          ftAttempted++;
          break;
        case 'FT_MISS':
          ftAttempted++;
          break;
        case 'FG2_MADE':
          fg2Made++;
          fg2Attempted++;
          break;
        case 'FG2_MISS':
          fg2Attempted++;
          break;
        case 'FG3_MADE':
          fg3Made++;
          fg3Attempted++;
          break;
        case 'FG3_MISS':
          fg3Attempted++;
          break;
        case 'OREB':
          oreb++;
          break;
        case 'DREB':
          dreb++;
          break;
        case 'STL':
          stl++;
          break;
        case 'BLK':
          blk++;
          break;
        case 'TOV':
          tov++;
          break;
        case 'FOUL_PERSONAL':
          personalFouls++;
          break;
        case 'FOUL_TECHNICAL':
          technicalFouls++;
          break;
        case 'FOUL_UNSPORTSMANLIKE':
          unsportsmanlikeFouls++;
          break;
        default:
          break;
      }
    }

    // Assists can also be credited via assistedByPlayerId
    if (
      event.assistedByPlayerId === playerId ||
      (event.playerId === playerId && event.type === 'AST')
    ) {
      ast++;
    }
  }

  // Shooting Totals
  const fgTotalMade = fg2Made + fg3Made;
  const fgTotalAttempted = fg2Attempted + fg3Attempted;
  const points = ftMade * 1 + fg2Made * 2 + fg3Made * 3;
  const totalRebounds = oreb + dreb;
  const totalFouls = personalFouls + technicalFouls + unsportsmanlikeFouls;

  const missedFieldGoals = fgTotalAttempted - fgTotalMade;
  const missedFreeThrows = ftAttempted - ftMade;

  // FIBA PIR Calculation
  const pir = calculateFibaPir({
    points,
    totalRebounds,
    assists: ast,
    steals: stl,
    blocks: blk,
    missedFieldGoals,
    missedFreeThrows,
    turnovers: tov,
    totalFouls,
  });

  // Plus / Minus
  const plusMinus = calculatePlayerPlusMinus(
    playerId,
    initialLineup,
    events,
    ownTeamId
  );

  return {
    playerId,
    points,
    ft: {
      made: ftMade,
      attempted: ftAttempted,
      percentage: calculatePercentage(ftMade, ftAttempted),
    },
    fg2: {
      made: fg2Made,
      attempted: fg2Attempted,
      percentage: calculatePercentage(fg2Made, fg2Attempted),
    },
    fg3: {
      made: fg3Made,
      attempted: fg3Attempted,
      percentage: calculatePercentage(fg3Made, fg3Attempted),
    },
    fgTotal: {
      made: fgTotalMade,
      attempted: fgTotalAttempted,
      percentage: calculatePercentage(fgTotalMade, fgTotalAttempted),
    },
    offensiveRebounds: oreb,
    defensiveRebounds: dreb,
    totalRebounds,
    assists: ast,
    steals: stl,
    blocks: blk,
    turnovers: tov,
    fouls: {
      personal: personalFouls,
      technical: technicalFouls,
      unsportsmanlike: unsportsmanlikeFouls,
      total: totalFouls,
      isFouledOut: isPlayerFouledOut(totalFouls),
      isInFoulTrouble: isPlayerInFoulTrouble(totalFouls),
    },
    plusMinus,
    pir,
  };
}

/**
 * Computes full aggregated box scores for a team and all of its individual players.
 */
export function calculateTeamBoxScore(
  teamId: string,
  playerIds: string[],
  events: PlayByPlayEvent[],
  initialLineup: string[] = []
): {
  players: Record<string, PlayerBoxScore>;
  teamTotal: TeamBoxScore;
} {
  const players: Record<string, PlayerBoxScore> = {};

  let totalPoints = 0;
  let totalFtMade = 0;
  let totalFtAttempted = 0;
  let totalFg2Made = 0;
  let totalFg2Attempted = 0;
  let totalFg3Made = 0;
  let totalFg3Attempted = 0;
  let totalOreb = 0;
  let totalDreb = 0;
  let totalAst = 0;
  let totalStl = 0;
  let totalBlk = 0;
  let totalTov = 0;
  let totalFouls = 0;

  for (const pid of playerIds) {
    const pBox = calculatePlayerBoxScore(pid, events, initialLineup, teamId);
    players[pid] = pBox;

    totalPoints += pBox.points;
    totalFtMade += pBox.ft.made;
    totalFtAttempted += pBox.ft.attempted;
    totalFg2Made += pBox.fg2.made;
    totalFg2Attempted += pBox.fg2.attempted;
    totalFg3Made += pBox.fg3.made;
    totalFg3Attempted += pBox.fg3.attempted;
    totalOreb += pBox.offensiveRebounds;
    totalDreb += pBox.defensiveRebounds;
    totalAst += pBox.assists;
    totalStl += pBox.steals;
    totalBlk += pBox.blocks;
    totalTov += pBox.turnovers;
    totalFouls += pBox.fouls.total;
  }

  const fgTotalMade = totalFg2Made + totalFg3Made;
  const fgTotalAttempted = totalFg2Attempted + totalFg3Attempted;
  const totalRebounds = totalOreb + totalDreb;

  const teamPir = calculateFibaPir({
    points: totalPoints,
    totalRebounds,
    assists: totalAst,
    steals: totalStl,
    blocks: totalBlk,
    missedFieldGoals: fgTotalAttempted - fgTotalMade,
    missedFreeThrows: totalFtAttempted - totalFtMade,
    turnovers: totalTov,
    totalFouls,
  });

  const teamTotal: TeamBoxScore = {
    teamId,
    points: totalPoints,
    ft: {
      made: totalFtMade,
      attempted: totalFtAttempted,
      percentage: calculatePercentage(totalFtMade, totalFtAttempted),
    },
    fg2: {
      made: totalFg2Made,
      attempted: totalFg2Attempted,
      percentage: calculatePercentage(totalFg2Made, totalFg2Attempted),
    },
    fg3: {
      made: totalFg3Made,
      attempted: totalFg3Attempted,
      percentage: calculatePercentage(totalFg3Made, totalFg3Attempted),
    },
    fgTotal: {
      made: fgTotalMade,
      attempted: fgTotalAttempted,
      percentage: calculatePercentage(fgTotalMade, fgTotalAttempted),
    },
    offensiveRebounds: totalOreb,
    defensiveRebounds: totalDreb,
    totalRebounds,
    assists: totalAst,
    steals: totalStl,
    blocks: totalBlk,
    turnovers: totalTov,
    totalFouls,
    pir: teamPir,
  };

  return { players, teamTotal };
}

