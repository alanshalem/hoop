import type {
  Match,
  MatchCondition,
  PlayByPlayEvent,
  Quarter,
} from '../entities/match.types';
import {
  getEventPoints,
  isFoulEvent,
  isHomeTeamEvent,
  isSameTeamFoulPeriod,
} from './event-rules';
import { isOvertime, QUARTER_SEQUENCE } from './game-clock';
import { calculateTeamBoxScore, MatchBoxScoresResult } from './basketball-rules';

/**
 * =============================================================================
 * HOOP OS - MATCH DERIVATIONS
 * The play-by-play is the single source of truth: score, team fouls, partials
 * and box scores are always derived from `match.events`.
 * =============================================================================
 */

export interface Scoreboard {
  homeScore: number;
  awayScore: number;
  /** Team fouls in the current team-foul period (overtimes extend Q4). */
  homeFoulsQuarter: number;
  awayFoulsQuarter: number;
}

export interface QuarterPartial {
  quarter: Quarter;
  own: number;
  rival: number;
  home: number;
  away: number;
}

export function deriveScoreboard(
  match: Pick<Match, 'events' | 'condition' | 'currentQuarter'>
): Scoreboard {
  const board: Scoreboard = {
    homeScore: 0,
    awayScore: 0,
    homeFoulsQuarter: 0,
    awayFoulsQuarter: 0,
  };

  for (const event of match.events) {
    const isHome = isHomeTeamEvent(match.condition, event.isOwnTeam);
    const points = getEventPoints(event.type);
    if (isHome) board.homeScore += points;
    else board.awayScore += points;

    if (isFoulEvent(event.type) && isSameTeamFoulPeriod(event.quarter, match.currentQuarter)) {
      if (isHome) board.homeFoulsQuarter += 1;
      else board.awayFoulsQuarter += 1;
    }
  }
  return board;
}

/**
 * Returns the match with its stored scoreboard fields re-derived from events.
 */
export function withDerivedScoreboard(match: Match): Match {
  return { ...match, ...deriveScoreboard(match) };
}

export function getOwnRivalScore(
  match: Pick<Match, 'events' | 'condition' | 'currentQuarter'>
): { own: number; rival: number } {
  const { homeScore, awayScore } = deriveScoreboard(match);
  return match.condition === 'HOME'
    ? { own: homeScore, rival: awayScore }
    : { own: awayScore, rival: homeScore };
}

/**
 * Points per period: Q1-Q4 always, overtimes only when they have events.
 */
export function getQuarterPartials(
  events: PlayByPlayEvent[],
  condition: MatchCondition
): QuarterPartial[] {
  const playedQuarters = new Set(events.map((e) => e.quarter));
  return QUARTER_SEQUENCE.filter((q) => !isOvertime(q) || playedQuarters.has(q)).map(
    (quarter) => {
      let own = 0;
      let rival = 0;
      for (const event of events) {
        if (event.quarter !== quarter) continue;
        const points = getEventPoints(event.type);
        if (event.isOwnTeam) own += points;
        else rival += points;
      }
      const ownIsHome = condition === 'HOME';
      return {
        quarter,
        own,
        rival,
        home: ownIsHome ? own : rival,
        away: ownIsHome ? rival : own,
      };
    }
  );
}

/**
 * Starting five of the own team. Falls back to rebuilding it from the current
 * lineup by reverting own substitutions (matches stored before the field existed).
 */
export function getStartingLineup(
  match: Pick<Match, 'startingLineupOwn' | 'activeLineupOwn' | 'events'>
): string[] {
  if (match.startingLineupOwn.length > 0) return match.startingLineupOwn;

  const lineup = [...match.activeLineupOwn];
  for (let i = match.events.length - 1; i >= 0; i--) {
    const { substitution, isOwnTeam } = match.events[i];
    if (!substitution || !isOwnTeam) continue;
    const index = lineup.indexOf(substitution.playerInId);
    if (index >= 0) lineup[index] = substitution.playerOutId;
  }
  return lineup;
}

/**
 * Own-team box score for a match, with +/- measured from the starting five.
 */
export function calculateMatchBoxScore(
  match: Match,
  playerIds: string[] = match.rosterOwnPlayerIds
): MatchBoxScoresResult {
  return calculateTeamBoxScore(
    match.ownTeamId,
    playerIds,
    match.events,
    getStartingLineup(match)
  );
}
