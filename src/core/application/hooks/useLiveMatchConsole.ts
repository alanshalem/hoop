import { useMemo } from 'react';
import type { Player } from '@/core/domain/entities/club.types';
import type { Match, PlayByPlayEventType, Quarter } from '@/core/domain/entities/match.types';
import type { RivalPlayer } from '@/core/domain/entities/rival.types';
import { deriveScoreboard } from '@/core/domain/rules/match-derivations';
import { can } from '@/core/domain/rules/permissions';
import {
  FIBA_LAST_TWO_MINUTES_SECONDS,
  getRemainingTimeouts,
  isLastTwoMinutesOfFourthQuarter,
} from '@/core/domain/rules/timeouts';
import { selectRivalRoster } from '@/core/application/stores/club-state';
import { useClubStore } from '@/core/application/stores/useClubStore';
import {
  isRivalFoul,
  type RecordChartEntryInput,
  type TeamSide,
} from '@/core/application/use-cases/match-use-cases';
import { useGameClock, type GameClock } from './useGameClock';
import {
  getPeriodEndAction,
  getRosterPlayers,
  getSelectableQuarters,
  type PeriodEndAction,
} from './live-console-rules';

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

const EMPTY_PLAYERS: Player[] = [];
const EMPTY_RIVAL_PLAYERS: readonly RivalPlayer[] = [];

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
  // Stable references: the players of the resolved rival team, or one shared empty list.
  const rivalRoster = useClubStore((state) => (match ? selectRivalRoster(state, match) : EMPTY_RIVAL_PLAYERS));
  const role = useClubStore((state) => state.currentUser.role);
  const recordEvent = useClubStore((state) => state.recordEvent);
  const undoLastRivalFoulInStore = useClubStore((state) => state.undoLastRivalFoul);
  const recordChartEntryInStore = useClubStore((state) => state.recordChartEntry);
  const undoLastChartEntryInStore = useClubStore((state) => state.undoLastChartEntry);
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

  const rosterIds = match?.rosterOwnPlayerIds;
  const rosterPlayers = useMemo(
    () => (rosterIds ? getRosterPlayers(rosterIds, players) : EMPTY_PLAYERS),
    [rosterIds, players]
  );

  const quarters = useMemo(
    () => getSelectableQuarters(match?.currentQuarter ?? 'Q1'),
    [match?.currentQuarter]
  );

  const recordRivalEvent = (type: PlayByPlayEventType) =>
    recordEvent(matchId, { type, isOwnTeam: false, clockSeconds: clock.read() });

  /** Removes the last rival foul (S15). */
  const undoRivalFoul = () => undoLastRivalFoulInStore(matchId);

  /** `rivalPlayerId` must come from `rivalRoster` (S14). */
  const recordChartEntry = (input: Omit<RecordChartEntryInput, 'clockSeconds'>) =>
    recordChartEntryInStore(matchId, { ...input, clockSeconds: clock.read() });

  const undoChartEntry = () => undoLastChartEntryInStore(matchId);

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
    /** The whole match roster by dorsal, on court or not (S15). */
    rosterPlayers,
    /** Whether the rival has a foul that "Deshacer falta" can remove. */
    hasRivalFoul: match?.events.some(isRivalFoul) ?? false,
    /** Players of the match rival team (S14); empty when the rival has no roster. */
    rivalRoster,
    role,
    canRecord: can(role, 'RECORD_LIVE'),
    isHalftime: match?.status === 'HALFTIME',
    recordRivalEvent,
    undoRivalFoul,
    recordChartEntry,
    undoChartEntry,
    callTimeout,
    changeQuarter,
    finish,
    startHalftime,
    startThirdQuarter,
  };
}

export type LiveMatchConsole = ReturnType<typeof useLiveMatchConsole>;
