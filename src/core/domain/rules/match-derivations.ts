import type {
  Match,
  MatchCondition,
  PlayByPlayEvent,
  Quarter,
  ScoreSnapshot,
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
 * HOOP - MATCH DERIVATIONS
 * The play-by-play is the single source of truth: score, team fouls, partials
 * and box scores are always derived from `match.events`. A match without
 * scoring plays shows its official result instead (S3); fouls stay event-based.
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

type ScoreSource = Pick<Match, 'events' | 'condition' | 'officialResult'>;

function hasScoringEvents(events: readonly PlayByPlayEvent[]): boolean {
  return events.some((event) => getEventPoints(event.type) > 0);
}

/** The official result, when the match has one and no scoring plays to derive from. */
function officialResultOf(match: Pick<Match, 'events' | 'officialResult'>) {
  return match.officialResult && !hasScoringEvents(match.events) ? match.officialResult : undefined;
}

export function deriveScoreboard(
  match: Pick<Match, 'events' | 'condition' | 'currentQuarter' | 'officialResult'>
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

  const official = officialResultOf(match);
  if (official) {
    board.homeScore = official.home;
    board.awayScore = official.away;
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
  match: Pick<Match, 'events' | 'condition' | 'currentQuarter' | 'officialResult'>
): { own: number; rival: number } {
  const { homeScore, awayScore } = deriveScoreboard(match);
  return match.condition === 'HOME'
    ? { own: homeScore, rival: awayScore }
    : { own: awayScore, rival: homeScore };
}

function toPartial(quarter: Quarter, own: number, rival: number, condition: MatchCondition): QuarterPartial {
  const ownIsHome = condition === 'HOME';
  return {
    quarter,
    own,
    rival,
    home: ownIsHome ? own : rival,
    away: ownIsHome ? rival : own,
  };
}

/** Official points per period: Q1-Q4 always, then the overtimes it lists. */
function officialPartials(quarters: readonly ScoreSnapshot[], condition: MatchCondition): QuarterPartial[] {
  return QUARTER_SEQUENCE.filter((q, index) => !isOvertime(q) || index < quarters.length).map((quarter, index) => {
    const { home, away } = quarters[index] ?? { home: 0, away: 0 };
    return condition === 'HOME'
      ? toPartial(quarter, home, away, condition)
      : toPartial(quarter, away, home, condition);
  });
}

/**
 * Points per period: Q1-Q4 always, overtimes only when they have events. A match
 * without scoring plays uses the quarters of its official result (S3).
 */
export function getQuarterPartials(match: ScoreSource): QuarterPartial[] {
  const { events, condition } = match;
  const official = officialResultOf(match);
  if (official && official.quarters.length > 0) return officialPartials(official.quarters, condition);

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
      return toPartial(quarter, own, rival, condition);
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
 * Own-team box score for a match: the scoring line of each roster player.
 */
export function calculateMatchBoxScore(
  match: Pick<Match, 'ownTeamId' | 'rosterOwnPlayerIds' | 'events'>,
  playerIds: readonly string[] = match.rosterOwnPlayerIds
): MatchBoxScoresResult {
  return calculateTeamBoxScore(match.ownTeamId, playerIds, match.events);
}
