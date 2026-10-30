import { useMemo } from 'react';
import type { Player } from '@/core/domain/entities/club.types';
import type { Match, PlayByPlayEventType, Quarter } from '@/core/domain/entities/match.types';
import type { CourtCoordinates } from '@/core/domain/value-objects/coordinates';
import { calculateMatchBoxScore, deriveScoreboard } from '@/core/domain/rules/match-derivations';
import { can } from '@/core/domain/rules/permissions';
import {
  FIBA_LAST_TWO_MINUTES_SECONDS,
  getRemainingTimeouts,
  isLastTwoMinutesOfFourthQuarter,
} from '@/core/domain/rules/timeouts';
import { useClubStore } from '@/core/application/stores/useClubStore';
import type { TeamSide } from '@/core/application/use-cases/match-use-cases';
import { useGameClock, type GameClock } from './useGameClock';
import { getPeriodEndAction, getSelectableQuarters, type PeriodEndAction } from './live-console-rules';

export interface PlayerLiveLine {
  points: number;
  fouls: number;
}

export interface LiveTeamLine {
  side: TeamSide;
  name: string;
  score: number;
  /** Team fouls in the current team-foul period. */
  teamFouls: number;
  /** Timeouts usable now in the current FIBA timeout period (max 2 in the last 2 minutes of Q4). */
  timeoutsLeft: number;
}

export interface UseLiveMatchConsoleOptions {
  /** Called when the running clock reaches 00:00, with what to offer next. */
  onPeriodEnd?: (action: PeriodEndAction) => void;
}

const EMPTY_LINES: Record<string, PlayerLiveLine> = {};
const EMPTY_PLAYERS: Player[] = [];

function resolvePlayers(ids: string[], players: Player[]): Player[] {
  return ids
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is Player => p !== undefined);
}

/** `clockSeconds` enables the last-2-minutes rule of Q4; omit it outside that span. */
function buildTeams(
  match: Match,
  clockSeconds?: number
): { own: LiveTeamLine; rival: LiveTeamLine; home: LiveTeamLine; away: LiveTeamLine } {
  const board = deriveScoreboard(match);
  const ownIsHome = match.condition === 'HOME';
  const timeoutsLeft = (timeouts: Match['homeTimeouts']) =>
    getRemainingTimeouts(timeouts, match.currentQuarter, clockSeconds);
  const own: LiveTeamLine = {
    side: 'OWN',
    name: match.ownTeamName,
    score: ownIsHome ? board.homeScore : board.awayScore,
    teamFouls: ownIsHome ? board.homeFoulsQuarter : board.awayFoulsQuarter,
    timeoutsLeft: timeoutsLeft(ownIsHome ? match.homeTimeouts : match.awayTimeouts),
  };
  const rival: LiveTeamLine = {
    side: 'RIVAL',
    name: match.rivalTeamName,
    score: ownIsHome ? board.awayScore : board.homeScore,
    teamFouls: ownIsHome ? board.awayFoulsQuarter : board.homeFoulsQuarter,
    timeoutsLeft: timeoutsLeft(ownIsHome ? match.awayTimeouts : match.homeTimeouts),
  };
  return { own, rival, home: ownIsHome ? own : rival, away: ownIsHome ? rival : own };
}

/**
 * Live console view model: derived match data plus the store actions, each
 * stamped with the current game clock (S5.4). Components stay presentational.
 */
export function useLiveMatchConsole(matchId: string, { onPeriodEnd }: UseLiveMatchConsoleOptions = {}) {
  const match = useClubStore((state) => state.matches.find((m) => m.id === matchId));
  const players = useClubStore((state) => state.players);
  const role = useClubStore((state) => state.currentUser.role);
  const recordEvent = useClubStore((state) => state.recordEvent);
  const undoLastEvent = useClubStore((state) => state.undoLastEvent);
  const substitutePlayer = useClubStore((state) => state.substitutePlayer);
  const requestTimeout = useClubStore((state) => state.requestTimeout);
  const changeQuarterInStore = useClubStore((state) => state.changeQuarter);
  const finishMatch = useClubStore((state) => state.finishMatch);
  const startHalftimeInStore = useClubStore((state) => state.startHalftime);
  const startThirdQuarterInStore = useClubStore((state) => state.startThirdQuarter);

  const clock: GameClock = useGameClock(match, {
    onExpire: () => {
      if (!match) return;
      const { own, rival } = buildTeams(match);
      onPeriodEnd?.(getPeriodEndAction(match.currentQuarter, { own: own.score, rival: rival.score }));
    },
  });

  // Usable timeouts only change when the ticking clock enters the last 2 minutes of Q4.
  const inLastTwoMinutes = match ? isLastTwoMinutesOfFourthQuarter(match.currentQuarter, clock.seconds) : false;
  const teams = useMemo(
    () => (match ? buildTeams(match, inLastTwoMinutes ? FIBA_LAST_TWO_MINUTES_SECONDS : undefined) : null),
    [match, inLastTwoMinutes]
  );

  const lineup = useMemo(() => {
    if (!match) {
      return { onCourt: EMPTY_PLAYERS, bench: EMPTY_PLAYERS, lines: EMPTY_LINES, fouledOutIds: new Set<string>() };
    }
    const onCourtIds = match.activeLineupOwn;
    const benchIds = match.rosterOwnPlayerIds.filter((id) => !onCourtIds.includes(id));
    const box = calculateMatchBoxScore(match);
    const lines: Record<string, PlayerLiveLine> = {};
    const fouledOutIds = new Set<string>();
    for (const [id, stats] of Object.entries(box.players)) {
      lines[id] = { points: stats.points, fouls: stats.fouls.total };
      if (stats.fouls.isFouledOut) fouledOutIds.add(id);
    }
    return {
      onCourt: resolvePlayers(onCourtIds, players),
      bench: resolvePlayers(benchIds, players),
      lines,
      fouledOutIds,
    };
  }, [match, players]);

  const quarters = useMemo(
    () => getSelectableQuarters(match?.currentQuarter ?? 'Q1'),
    [match?.currentQuarter]
  );

  const recordPlayerEvent = (playerId: string, type: PlayByPlayEventType, coordinates?: CourtCoordinates) =>
    recordEvent(matchId, { type, isOwnTeam: true, playerId, coordinates, clockSeconds: clock.read() });

  const recordRivalEvent = (type: PlayByPlayEventType) =>
    recordEvent(matchId, { type, isOwnTeam: false, clockSeconds: clock.read() });

  const undo = () => undoLastEvent(matchId);

  const substitute = (playerOutId: string, playerInId: string) =>
    substitutePlayer(matchId, playerOutId, playerInId, clock.read());

  /** Consumes a timeout; on success the clock stops. */
  const callTimeout = (side: TeamSide) => {
    const result = requestTimeout(matchId, side, clock.read());
    if (result.ok) clock.pause();
    return result;
  };

  /** Persists the clock of the period being left, then moves to `quarter`. */
  const changeQuarter = (quarter: Quarter) => {
    clock.pause();
    changeQuarterInStore(matchId, quarter);
  };

  const finish = () => {
    clock.pause();
    return finishMatch(matchId, clock.read());
  };

  /** End of Q2: HALFTIME, with recording and timeouts disabled. */
  const startHalftime = () => {
    clock.pause();
    return startHalftimeInStore(matchId);
  };

  /** Leaves HALFTIME into Q3 (clock 10:00, paused until started). */
  const startThirdQuarter = () => startThirdQuarterInStore(matchId);

  return {
    match,
    teams,
    clock,
    quarters,
    onCourtPlayers: lineup.onCourt,
    benchPlayers: lineup.bench,
    playerLines: lineup.lines,
    fouledOutIds: lineup.fouledOutIds,
    role,
    canRecord: can(role, 'RECORD_LIVE'),
    isHalftime: match?.status === 'HALFTIME',
    recordPlayerEvent,
    recordRivalEvent,
    undo,
    substitute,
    callTimeout,
    changeQuarter,
    finish,
    startHalftime,
    startThirdQuarter,
  };
}

export type LiveMatchConsole = ReturnType<typeof useLiveMatchConsole>;
