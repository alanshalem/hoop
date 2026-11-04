import type {
  Match,
  PlayByPlayEvent,
  PlayByPlayEventType,
  Quarter,
} from '@/core/domain/entities/match.types';
import type { CourtCoordinates } from '@/core/domain/value-objects/coordinates';
import {
  CHART_CATALOG,
  DEFAULT_CHART_POINTS,
  findChartCode,
  type ChartCatalog,
  type ChartCategory,
  type ChartEntry,
  type ChartPoints,
} from '@/core/domain/entities/chart.types';
import type { RivalPlayer } from '@/core/domain/entities/rival.types';
import { isFoulEvent, RIVAL_TEAM_ID } from '@/core/domain/rules/event-rules';
import {
  clampGameClock,
  crossesHalftime,
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

/** HALFTIME: the interval after Q2 (FIBA) accepts no plays and no timeouts. */
export type RecordEventReason = 'MATCH_NOT_LIVE' | 'HALFTIME' | 'INVALID_EVENT';
export type UndoRivalFoulReason = 'MATCH_NOT_LIVE' | 'HALFTIME' | 'NO_RIVAL_FOULS';

export interface RecordChartEntryInput {
  category: ChartCategory;
  code: string;
  /** Own player involved; omitted for team-level entries. */
  playerId?: string;
  /** POINTS_ALLOWED: basket allowed (defaults to 2). OFFENSE: points scored, only when `made`. */
  points?: ChartPoints;
  /** Required for OFFENSE: whether the action ended in a basket (S11). */
  made?: boolean;
  /** POINTS_ALLOWED and OFFENSE only: rival player involved (S14). */
  rivalPlayerId?: string;
  clockSeconds?: number;
}

export type RecordChartReason =
  | 'MATCH_NOT_LIVE'
  | 'HALFTIME'
  | 'INVALID_CHART_CODE'
  | 'INVALID_CHART_RESULT'
  | 'INVALID_RIVAL_PLAYER';
export type UndoChartReason = 'MATCH_NOT_LIVE' | 'HALFTIME' | 'NO_CHART_ENTRIES';

export type RequestTimeoutResult =
  | { ok: true; match: Match; remaining: number }
  | { ok: false; reason: 'MATCH_NOT_LIVE' | 'HALFTIME' | 'NO_TIMEOUTS_LEFT' };

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

/** Why plays cannot be recorded right now, or null when the match is live. */
function notLiveReason(match: Match): 'MATCH_NOT_LIVE' | 'HALFTIME' | null {
  if (match.status === 'HALFTIME') return 'HALFTIME';
  return isLive(match) ? null : 'MATCH_NOT_LIVE';
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
  const refusal = notLiveReason(match);
  if (refusal) return { ok: false, reason: refusal };
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

/** Rival fouls feed the rival bonus; whether one can be undone drives the toolbar (S15). */
export function isRivalFoul(event: PlayByPlayEvent): boolean {
  return !event.isOwnTeam && isFoulEvent(event.type);
}

/** Removes the last rival foul (S15); every other event, chart entries included, stays. */
export function undoLastRivalFoul(match: Match): MatchResult<UndoRivalFoulReason> {
  const refusal = notLiveReason(match);
  if (refusal) return { ok: false, reason: refusal };
  const lastIndex = match.events.findLastIndex(isRivalFoul);
  if (lastIndex === -1) return { ok: false, reason: 'NO_RIVAL_FOULS' };
  const events = match.events.filter((_, i) => i !== lastIndex);
  return { ok: true, match: withDerivedScoreboard({ ...match, events }) };
}

/**
 * Only active codes of the club's catalog (the built-in one by default) can be recorded (S9).
 * A rival player must belong to `rivalRoster`, the match rival roster, when it is given (S14).
 */
export function recordChartEntry(
  match: Match,
  input: RecordChartEntryInput,
  ctx: UseCaseContext,
  catalog: ChartCatalog = CHART_CATALOG,
  rivalRoster?: readonly RivalPlayer[]
): MatchResult<RecordChartReason> {
  const refusal = notLiveReason(match);
  if (refusal) return { ok: false, reason: refusal };
  const chartCode = findChartCode(input.category, input.code, catalog);
  if (!chartCode || chartCode.archived) return { ok: false, reason: 'INVALID_CHART_CODE' };
  const isPointsAllowed = input.category === 'POINTS_ALLOWED';
  const isOffense = input.category === 'OFFENSE';
  // Offensive actions always carry their result: made with its points, or missed without points (S11).
  if (isOffense) {
    if (input.made === undefined) return { ok: false, reason: 'INVALID_CHART_RESULT' };
    if (input.made !== (input.points !== undefined)) return { ok: false, reason: 'INVALID_CHART_RESULT' };
  } else {
    if (input.made !== undefined) return { ok: false, reason: 'INVALID_CHART_RESULT' };
    if (!isPointsAllowed && input.points !== undefined) return { ok: false, reason: 'INVALID_CHART_CODE' };
  }
  if (input.rivalPlayerId !== undefined) {
    const allowsRival = isPointsAllowed || isOffense;
    const inRoster = !rivalRoster || rivalRoster.some((player) => player.id === input.rivalPlayerId);
    if (!allowsRival || !input.rivalPlayerId || !inRoster) return { ok: false, reason: 'INVALID_RIVAL_PLAYER' };
  }

  const clocked =
    input.clockSeconds === undefined ? match : setClock(match, input.clockSeconds);
  let chart = buildChartEntry(input, isPointsAllowed, isOffense);
  let scored = clocked;
  // Points allowed go to the rival and made offensive actions to the own team, as a real scoring play (S12).
  const scoringType = chart.points !== undefined ? SCORING_PLAY_BY_POINTS[chart.points] : undefined;
  if (scoringType) {
    const scoreEventId = `${ctx.id}-score`;
    const ownTeamScores = isOffense;
    scored = appendEvent(
      clocked,
      {
        teamId: ownTeamScores ? match.ownTeamId : RIVAL_TEAM_ID,
        isOwnTeam: ownTeamScores,
        playerId: ownTeamScores ? input.playerId : undefined,
        type: scoringType,
      },
      { ...ctx, id: scoreEventId }
    );
    chart = { ...chart, scoreEventId };
  }
  const next = appendEvent(
    scored,
    {
      teamId: match.ownTeamId,
      isOwnTeam: true,
      playerId: input.playerId,
      type: 'CHART',
      chart,
    },
    ctx
  );
  return { ok: true, match: next };
}

const SCORING_PLAY_BY_POINTS: Record<ChartPoints, PlayByPlayEventType> = {
  1: 'FT_MADE',
  2: 'FG2_MADE',
  3: 'FG3_MADE',
};

/** Removes the events at `index` plus everything linked to it through a chart entry's scoring play. */
function withoutLinked(match: Match, index: number): Match {
  const target = match.events[index];
  const linkedIds = new Set<string>();
  if (target.chart?.scoreEventId) linkedIds.add(target.chart.scoreEventId);
  const events = match.events.filter(
    (event, i) => i !== index && !linkedIds.has(event.id) && event.chart?.scoreEventId !== target.id
  );
  return withDerivedScoreboard({ ...match, events });
}

function buildChartEntry(input: RecordChartEntryInput, isPointsAllowed: boolean, isOffense: boolean): ChartEntry {
  const base: ChartEntry = { category: input.category, code: input.code };
  if (input.rivalPlayerId !== undefined) base.rivalPlayerId = input.rivalPlayerId;
  if (isPointsAllowed) return { ...base, points: input.points ?? DEFAULT_CHART_POINTS };
  if (isOffense) return input.made ? { ...base, made: true, points: input.points } : { ...base, made: false };
  return base;
}

export function undoLastChartEntry(match: Match): MatchResult<UndoChartReason> {
  const refusal = notLiveReason(match);
  if (refusal) return { ok: false, reason: refusal };
  const lastIndex = match.events.findLastIndex((event) => event.type === 'CHART');
  if (lastIndex === -1) return { ok: false, reason: 'NO_CHART_ENTRIES' };
  return { ok: true, match: withoutLinked(match, lastIndex) };
}

/** Uses the match clock, so the last-2-minutes rule of Q4 applies (FIBA Art. 18.2.5). */
export function requestTimeout(match: Match, side: TeamSide): RequestTimeoutResult {
  const refusal = notLiveReason(match);
  if (refusal) return { ok: false, reason: refusal };

  const isHome = (side === 'OWN') === (match.condition === 'HOME');
  const field = isHome ? 'homeTimeouts' : 'awayTimeouts';
  const result = consumeTimeout(match[field], match.currentQuarter, match.quarterTimeRemainingSeconds);
  if (!result.ok) return result;

  return {
    ok: true,
    remaining: result.remaining,
    match: { ...match, [field]: result.timeouts },
  };
}

/**
 * Moves to `quarter` with a full clock. Leaving the first half for any later
 * period while live passes through HALFTIME (at the end of Q2, see
 * `startThirdQuarter`); during HALFTIME only Q3 is accepted.
 */
export function changeQuarter(match: Match, quarter: Quarter): Match {
  if (match.status === 'HALFTIME') {
    const resumed = quarter === 'Q3' ? startThirdQuarter(match) : null;
    return resumed?.ok ? resumed.match : match;
  }
  if (isLive(match) && crossesHalftime(match.currentQuarter, quarter)) {
    const halftime = startHalftime({ ...match, currentQuarter: 'Q2' });
    if (halftime.ok) return halftime.match;
  }
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

/** End of Q2: the match goes to HALFTIME with the clock at 00:00. */
export function startHalftime(match: Match): MatchResult<'MATCH_NOT_LIVE' | 'NOT_END_OF_FIRST_HALF'> {
  if (!isLive(match)) return { ok: false, reason: 'MATCH_NOT_LIVE' };
  if (match.currentQuarter !== 'Q2') return { ok: false, reason: 'NOT_END_OF_FIRST_HALF' };
  return {
    ok: true,
    match: withDerivedScoreboard({ ...match, status: 'HALFTIME', quarterTimeRemainingSeconds: 0 }),
  };
}

/** Leaves HALFTIME: Q3 with a full clock, LIVE again. */
export function startThirdQuarter(match: Match): MatchResult<'NOT_HALFTIME'> {
  if (match.status !== 'HALFTIME') return { ok: false, reason: 'NOT_HALFTIME' };
  return {
    ok: true,
    match: withDerivedScoreboard({
      ...match,
      status: 'LIVE',
      currentQuarter: 'Q3',
      quarterTimeRemainingSeconds: getQuarterLengthSeconds('Q3'),
    }),
  };
}

/** A live match, or one suspended at halftime (its Q2 clock stays at 00:00), can be finished. */
export function finishMatch(match: Match): MatchResult<'MATCH_NOT_LIVE'> {
  if (!isLive(match) && match.status !== 'HALFTIME') return { ok: false, reason: 'MATCH_NOT_LIVE' };
  const clock = match.status === 'HALFTIME' ? 0 : match.quarterTimeRemainingSeconds;
  return {
    ok: true,
    match: withDerivedScoreboard({ ...match, status: 'FINISHED', quarterTimeRemainingSeconds: clock }),
  };
}
