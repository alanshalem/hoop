import type {
  Match,
  PlayByPlayEvent,
  PlayByPlayEventType,
  Quarter,
} from '@/core/domain/entities/match.types';
import type { CourtCoordinates } from '@/core/domain/value-objects/coordinates';
import { getPlayerFoulsFromEvents } from '@/core/domain/rules/basketball-rules';
import { RIVAL_TEAM_ID } from '@/core/domain/rules/event-rules';
import {
  clampGameClock,
  formatGameClock,
  getQuarterLengthSeconds,
  isOvertime,
} from '@/core/domain/rules/game-clock';
import { LineupIssue, validateLineup } from '@/core/domain/rules/lineup-rules';
import { deriveScoreboard, withDerivedScoreboard } from '@/core/domain/rules/match-derivations';
import {
  consumeTimeout,
  createInitialTimeouts,
  resetOvertimeTimeouts,
} from '@/core/domain/rules/timeouts';

/**
 * =============================================================================
 * HOOP OS - MATCH USE-CASES
 * Pure functions: Match in, new Match (or a typed refusal) out. The scoreboard
 * is always re-derived from events.
 * =============================================================================
 */

/** Values the caller provides so use-cases stay deterministic. */
export interface UseCaseContext {
  id: string;
  /** ISO timestamp. */
  now: string;
}

export type MatchResult<Reason extends string> =
  | { ok: true; match: Match }
  | { ok: false; reason: Reason };

export type TeamSide = 'OWN' | 'RIVAL';

export interface RecordEventInput {
  type: PlayByPlayEventType;
  isOwnTeam: boolean;
  playerId?: string;
  assistedByPlayerId?: string;
  coordinates?: CourtCoordinates;
  /** Real clock at the moment of the event; also persisted on the match. */
  clockSeconds?: number;
}

export type RecordEventReason = 'MATCH_NOT_LIVE' | 'INVALID_EVENT';
export type UndoReason = 'MATCH_NOT_LIVE' | 'NO_EVENTS';
export type SubstitutionReason =
  | 'MATCH_NOT_LIVE'
  | 'PLAYER_NOT_ON_COURT'
  | 'PLAYER_ALREADY_ON_COURT'
  | 'PLAYER_NOT_IN_ROSTER'
  | 'PLAYER_FOULED_OUT';

export type RequestTimeoutResult =
  | { ok: true; match: Match; remaining: number }
  | { ok: false; reason: 'MATCH_NOT_LIVE' | 'NO_TIMEOUTS_LEFT' };

export type StartMatchResult =
  | { ok: true; match: Match }
  | { ok: false; reason: 'MATCH_ALREADY_STARTED' }
  | { ok: false; reason: 'INVALID_LINEUP'; issues: LineupIssue[] };

export type CreateMatchInput = Pick<
  Match,
  | 'clubId'
  | 'divisionId'
  | 'ownTeamId'
  | 'ownTeamName'
  | 'rivalTeamName'
  | 'date'
  | 'condition'
  | 'tournament'
> &
  Partial<Omit<Match, 'id'>>;

function isLive(match: Match): boolean {
  return match.status === 'LIVE';
}

/**
 * Appends an event stamped with the current quarter/clock and the resulting score.
 */
function appendEvent(
  match: Match,
  event: Omit<PlayByPlayEvent, 'id' | 'matchId' | 'quarter' | 'quarterTimeRemainingSeconds' | 'gameClockFormatted' | 'scoreAtEvent' | 'timestamp'>,
  ctx: UseCaseContext
): Match {
  const provisional: PlayByPlayEvent = {
    id: ctx.id,
    matchId: match.id,
    quarter: match.currentQuarter,
    quarterTimeRemainingSeconds: match.quarterTimeRemainingSeconds,
    gameClockFormatted: formatGameClock(match.quarterTimeRemainingSeconds),
    ...event,
    scoreAtEvent: { home: match.homeScore, away: match.awayScore },
    timestamp: ctx.now,
  };
  const { homeScore, awayScore } = deriveScoreboard({
    ...match,
    events: [...match.events, provisional],
  });
  const fullEvent = { ...provisional, scoreAtEvent: { home: homeScore, away: awayScore } };
  return withDerivedScoreboard({ ...match, events: [...match.events, fullEvent] });
}

export function createMatch(input: CreateMatchInput, ctx: Pick<UseCaseContext, 'id'>): Match {
  return withDerivedScoreboard({
    status: 'SCHEDULED',
    currentQuarter: 'Q1',
    quarterTimeRemainingSeconds: getQuarterLengthSeconds('Q1'),
    homeScore: 0,
    awayScore: 0,
    homeFoulsQuarter: 0,
    awayFoulsQuarter: 0,
    homeTimeouts: createInitialTimeouts(),
    awayTimeouts: createInitialTimeouts(),
    startingLineupOwn: [],
    activeLineupOwn: [],
    rosterOwnPlayerIds: [],
    events: [],
    ...input,
    id: ctx.id,
  });
}

export function setClock(match: Match, seconds: number): Match {
  return {
    ...match,
    quarterTimeRemainingSeconds: clampGameClock(seconds, match.currentQuarter),
  };
}

export function recordEvent(
  match: Match,
  input: RecordEventInput,
  ctx: UseCaseContext
): MatchResult<RecordEventReason> {
  if (!isLive(match)) return { ok: false, reason: 'MATCH_NOT_LIVE' };
  if (input.type === 'SUBSTITUTION') return { ok: false, reason: 'INVALID_EVENT' };

  const clocked =
    input.clockSeconds === undefined ? match : setClock(match, input.clockSeconds);
  const next = appendEvent(
    clocked,
    {
      teamId: input.isOwnTeam ? match.ownTeamId : RIVAL_TEAM_ID,
      isOwnTeam: input.isOwnTeam,
      playerId: input.playerId,
      assistedByPlayerId: input.assistedByPlayerId,
      coordinates: input.coordinates,
      type: input.type,
    },
    ctx
  );
  return { ok: true, match: next };
}

export function undoLastEvent(match: Match): MatchResult<UndoReason> {
  if (!isLive(match)) return { ok: false, reason: 'MATCH_NOT_LIVE' };
  const last = match.events.at(-1);
  if (!last) return { ok: false, reason: 'NO_EVENTS' };

  const sub = last.isOwnTeam ? last.substitution : undefined;
  const activeLineupOwn = sub
    ? match.activeLineupOwn.map((id) => (id === sub.playerInId ? sub.playerOutId : id))
    : match.activeLineupOwn;

  return {
    ok: true,
    match: withDerivedScoreboard({
      ...match,
      activeLineupOwn,
      events: match.events.slice(0, -1),
    }),
  };
}

export function substitutePlayer(
  match: Match,
  playerOutId: string,
  playerInId: string,
  ctx: UseCaseContext
): MatchResult<SubstitutionReason> {
  if (!isLive(match)) return { ok: false, reason: 'MATCH_NOT_LIVE' };
  if (!match.activeLineupOwn.includes(playerOutId)) {
    return { ok: false, reason: 'PLAYER_NOT_ON_COURT' };
  }
  if (match.activeLineupOwn.includes(playerInId)) {
    return { ok: false, reason: 'PLAYER_ALREADY_ON_COURT' };
  }
  if (!match.rosterOwnPlayerIds.includes(playerInId)) {
    return { ok: false, reason: 'PLAYER_NOT_IN_ROSTER' };
  }
  if (getPlayerFoulsFromEvents(playerInId, match.events).isFouledOut) {
    return { ok: false, reason: 'PLAYER_FOULED_OUT' };
  }

  const withLineup: Match = {
    ...match,
    activeLineupOwn: match.activeLineupOwn.map((id) => (id === playerOutId ? playerInId : id)),
  };
  const next = appendEvent(
    withLineup,
    {
      teamId: match.ownTeamId,
      isOwnTeam: true,
      type: 'SUBSTITUTION',
      substitution: { playerInId, playerOutId },
    },
    ctx
  );
  return { ok: true, match: next };
}

export function requestTimeout(match: Match, side: TeamSide): RequestTimeoutResult {
  if (!isLive(match)) return { ok: false, reason: 'MATCH_NOT_LIVE' };

  const isHome = (side === 'OWN') === (match.condition === 'HOME');
  const field = isHome ? 'homeTimeouts' : 'awayTimeouts';
  const result = consumeTimeout(match[field], match.currentQuarter);
  if (!result.ok) return result;

  return {
    ok: true,
    remaining: result.remaining,
    match: { ...match, [field]: result.timeouts },
  };
}

export function changeQuarter(match: Match, quarter: Quarter): Match {
  const entersNewOvertime = isOvertime(quarter) && quarter !== match.currentQuarter;
  return withDerivedScoreboard({
    ...match,
    currentQuarter: quarter,
    quarterTimeRemainingSeconds: getQuarterLengthSeconds(quarter),
    homeTimeouts: entersNewOvertime ? resetOvertimeTimeouts(match.homeTimeouts) : match.homeTimeouts,
    awayTimeouts: entersNewOvertime ? resetOvertimeTimeouts(match.awayTimeouts) : match.awayTimeouts,
  });
}

export function startMatch(
  match: Match,
  rosterIds: string[],
  starterIds: string[]
): StartMatchResult {
  if (match.status !== 'SCHEDULED') return { ok: false, reason: 'MATCH_ALREADY_STARTED' };
  const issues = validateLineup(rosterIds, starterIds);
  if (issues.length > 0) return { ok: false, reason: 'INVALID_LINEUP', issues };

  return {
    ok: true,
    match: withDerivedScoreboard({
      ...match,
      status: 'LIVE',
      currentQuarter: 'Q1',
      quarterTimeRemainingSeconds: getQuarterLengthSeconds('Q1'),
      rosterOwnPlayerIds: [...rosterIds],
      startingLineupOwn: [...starterIds],
      activeLineupOwn: [...starterIds],
    }),
  };
}

export function finishMatch(match: Match): MatchResult<'MATCH_NOT_LIVE'> {
  if (!isLive(match)) return { ok: false, reason: 'MATCH_NOT_LIVE' };
  return { ok: true, match: withDerivedScoreboard({ ...match, status: 'FINISHED' }) };
}
