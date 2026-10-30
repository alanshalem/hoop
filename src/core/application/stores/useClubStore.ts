import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  Division,
  Player,
  User,
} from '@/core/domain/entities/club.types';
import type {
  Match,
  PlayByPlayEvent,
  Quarter,
} from '@/core/domain/entities/match.types';
import { withDerivedScoreboard } from '@/core/domain/rules/match-derivations';
import * as club from '@/core/application/use-cases/club-use-cases';
import * as matchUseCases from '@/core/application/use-cases/match-use-cases';
import type {
  ClubData,
  NewDivisionInput,
} from '@/core/application/use-cases/club-use-cases';
import type {
  CreateMatchInput,
  MatchResult,
  RecordEventInput,
  RecordEventReason,
  RequestTimeoutResult,
  StartMatchResult,
  SubstitutionReason,
  TeamSide,
  UndoReason,
} from '@/core/application/use-cases/match-use-cases';
import { CLUB_PROFILE } from '@/core/infrastructure/mocks/seed-data';
import { reconcileSelection } from '@/core/application/sync/pull-merge';
import type { SyncableClubData } from '@/core/application/sync/sync-types';
import {
  CLUB_STORE_VERSION,
  ClubDataState,
  createInitialClubState,
  migrateClubState,
} from './club-state';
import { CLUB_STORAGE_KEY, gatedLocalStorage } from './persistence-gate';

export type ActionResult<Reason extends string> =
  | { ok: true }
  | { ok: false; reason: Reason };

export type MatchNotFound = { ok: false; reason: 'MATCH_NOT_FOUND' };

export interface ClubStoreState extends ClubDataState {
  // Current user / RBAC: the authenticated account (role comes from the server)
  setCurrentUser: (user: User) => void;

  // Sync
  /** Replaces the synced collections with pulled server data, keeping valid selections. */
  applySyncedData: (data: SyncableClubData) => void;

  // Divisions
  setActiveDivision: (divisionId: string) => void;
  /** Creates the division and its team for the current season; returns the division ID. */
  addDivision: (division: NewDivisionInput, headCoachId?: string) => string;
  updateDivision: (id: string, updates: Partial<Omit<Division, 'id'>>) => void;
  /** Also removes its team and leaves its players without a team. */
  deleteDivision: (id: string) => void;
  /** `userId: null` unassigns the head coach. */
  assignHeadCoach: (
    teamId: string,
    userId: string | null
  ) => ActionResult<'TEAM_NOT_FOUND' | 'USER_NOT_HEAD_COACH'>;

  // Players
  /** Returns the new player ID. */
  addPlayer: (player: Omit<Player, 'id'>) => string;
  updatePlayer: (id: string, updates: Partial<Omit<Player, 'id'>>) => void;
  deletePlayer: (id: string) => void;
  callUpPlayerToTeam: (
    playerId: string,
    targetTeamId: string
  ) => ActionResult<'PLAYER_NOT_FOUND' | 'TEAM_NOT_FOUND' | 'ALREADY_IN_TEAM'>;

  // Matches
  setActiveMatch: (matchId: string) => void;
  /** Returns the new match ID. */
  addMatch: (match: CreateMatchInput) => string;
  /** Generic edit; the scoreboard is re-derived from events. */
  updateMatch: (id: string, updates: Partial<Omit<Match, 'id'>>) => void;
  deleteMatch: (id: string) => void;
  /** Legacy lineup setter (sets starting five and current lineup). Prefer startMatch. */
  setStartingLineup: (matchId: string, playerIds: string[]) => void;
  startMatch: (
    matchId: string,
    rosterIds: string[],
    starterIds: string[]
  ) => StartMatchResult | MatchNotFound;
  recordEvent: (
    matchId: string,
    input: RecordEventInput
  ) => MatchResult<RecordEventReason> | MatchNotFound;
  undoLastEvent: (matchId: string) => MatchResult<UndoReason> | MatchNotFound;
  substitutePlayer: (
    matchId: string,
    playerOutId: string,
    playerInId: string,
    clockSeconds?: number
  ) => MatchResult<SubstitutionReason> | MatchNotFound;
  /** Consumes a FIBA timeout; refusal comes back as NO_TIMEOUTS_LEFT. */
  requestTimeout: (
    matchId: string,
    side: TeamSide,
    clockSeconds?: number
  ) => RequestTimeoutResult | MatchNotFound;
  /** Leaving the first half (Q1/Q2) passes through HALFTIME (see `startThirdQuarter`). */
  changeQuarter: (matchId: string, quarter: Quarter) => void;
  /** End of Q2: the match goes to HALFTIME (no plays, no timeouts). */
  startHalftime: (
    matchId: string
  ) => MatchResult<'MATCH_NOT_LIVE' | 'NOT_END_OF_FIRST_HALF'> | MatchNotFound;
  /** Leaves HALFTIME: Q3, clock 10:00, LIVE. */
  startThirdQuarter: (matchId: string) => MatchResult<'NOT_HALFTIME'> | MatchNotFound;
  setClock: (matchId: string, seconds: number) => void;
  finishMatch: (
    matchId: string,
    clockSeconds?: number
  ) => MatchResult<'MATCH_NOT_LIVE'> | MatchNotFound;

  /** @deprecated Use recordEvent. */
  addPlayByPlayEvent: (
    matchId: string,
    event: Omit<PlayByPlayEvent, 'id' | 'timestamp' | 'scoreAtEvent'>
  ) => void;
  /** @deprecated Use undoLastEvent. */
  undoLastPlayByPlayEvent: (matchId: string) => void;
}

type MatchOutcome = { ok: true; match: Match } | { ok: false; reason: string };

const MATCH_NOT_FOUND: MatchNotFound = { ok: false, reason: 'MATCH_NOT_FOUND' };

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function eventContext(): matchUseCases.UseCaseContext {
  return { id: createId('ev'), now: new Date().toISOString() };
}

function withClock(match: Match, clockSeconds?: number): Match {
  return clockSeconds === undefined ? match : matchUseCases.setClock(match, clockSeconds);
}

function toActionResult<Reason extends string>(
  result: { ok: true } | { ok: false; reason: Reason }
): ActionResult<Reason> {
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

export const useClubStore = create<ClubStoreState>()(
  persist(
    (set, get) => {
      const clubData = (): ClubData => {
        const { divisions, teams, players } = get();
        return { divisions, teams, players };
      };

      const mapMatch = (matchId: string, update: (match: Match) => Match): void => {
        set((state) => ({
          matches: state.matches.map((m) => (m.id === matchId ? update(m) : m)),
        }));
      };

      /** Runs a match use-case and stores the new match when it succeeds. */
      const runMatchUseCase = <R extends MatchOutcome>(
        matchId: string,
        run: (match: Match) => R
      ): R | MatchNotFound => {
        const match = get().matches.find((m) => m.id === matchId);
        if (!match) return MATCH_NOT_FOUND;
        const result = run(match);
        const outcome: MatchOutcome = result;
        if (outcome.ok) mapMatch(matchId, () => outcome.match);
        return result;
      };

      return {
        ...createInitialClubState(),

        setCurrentUser: (user) => set({ currentUser: user }),

        applySyncedData: (data) => set((state) => ({ ...data, ...reconcileSelection(state, data) })),

        setActiveDivision: (divisionId) => set({ activeDivisionId: divisionId }),

        addDivision: (division, headCoachId) => {
          const divisionId = createId('div');
          set(
            club.createDivision(clubData(), division, {
              divisionId,
              teamId: createId('team'),
              season: CLUB_PROFILE.season,
              clubName: CLUB_PROFILE.name,
              headCoachId,
            })
          );
          return divisionId;
        },

        updateDivision: (id, updates) =>
          set(club.updateDivision(clubData(), id, updates, { clubName: CLUB_PROFILE.name })),

        deleteDivision: (id) => set(club.deleteDivision(clubData(), id)),

        assignHeadCoach: (teamId, userId) => {
          const result = club.assignHeadCoach(clubData(), get().users, teamId, userId);
          if (result.ok) set(result.data);
          return toActionResult(result);
        },

        addPlayer: (player) => {
          const id = createId('p');
          set(club.addPlayer(clubData(), player, { id }));
          return id;
        },

        updatePlayer: (id, updates) => set(club.updatePlayer(clubData(), id, updates)),

        deletePlayer: (id) => set(club.deletePlayer(clubData(), id)),

        callUpPlayerToTeam: (playerId, targetTeamId) => {
          const result = club.callUpPlayer(clubData(), playerId, targetTeamId);
          if (result.ok) set(result.data);
          return toActionResult(result);
        },

        setActiveMatch: (matchId) => set({ activeMatchId: matchId }),

        addMatch: (input) => {
          const id = createId('match');
          set((state) => ({ matches: [...state.matches, matchUseCases.createMatch(input, { id })] }));
          return id;
        },

        updateMatch: (id, updates) =>
          mapMatch(id, (m) => withDerivedScoreboard({ ...m, ...updates })),

        deleteMatch: (id) =>
          set((state) => ({ matches: state.matches.filter((m) => m.id !== id) })),

        setStartingLineup: (matchId, playerIds) =>
          mapMatch(matchId, (m) => ({
            ...m,
            startingLineupOwn: playerIds.slice(0, 5),
            activeLineupOwn: playerIds.slice(0, 5),
          })),

        startMatch: (matchId, rosterIds, starterIds) =>
          runMatchUseCase(matchId, (m) => matchUseCases.startMatch(m, rosterIds, starterIds)),

        recordEvent: (matchId, input) =>
          runMatchUseCase(matchId, (m) => matchUseCases.recordEvent(m, input, eventContext())),

        undoLastEvent: (matchId) => runMatchUseCase(matchId, matchUseCases.undoLastEvent),

        substitutePlayer: (matchId, playerOutId, playerInId, clockSeconds) =>
          runMatchUseCase(matchId, (m) =>
            matchUseCases.substitutePlayer(
              withClock(m, clockSeconds),
              playerOutId,
              playerInId,
              eventContext()
            )
          ),

        requestTimeout: (matchId, side, clockSeconds) =>
          runMatchUseCase(matchId, (m) =>
            matchUseCases.requestTimeout(withClock(m, clockSeconds), side)
          ),

        changeQuarter: (matchId, quarter) =>
          mapMatch(matchId, (m) => matchUseCases.changeQuarter(m, quarter)),

        startHalftime: (matchId) => runMatchUseCase(matchId, matchUseCases.startHalftime),

        startThirdQuarter: (matchId) => runMatchUseCase(matchId, matchUseCases.startThirdQuarter),

        setClock: (matchId, seconds) =>
          mapMatch(matchId, (m) => matchUseCases.setClock(m, seconds)),

        finishMatch: (matchId, clockSeconds) =>
          runMatchUseCase(matchId, (m) => matchUseCases.finishMatch(withClock(m, clockSeconds))),

        addPlayByPlayEvent: (matchId, event) => {
          get().recordEvent(matchId, {
            type: event.type,
            isOwnTeam: event.isOwnTeam,
            playerId: event.playerId,
            assistedByPlayerId: event.assistedByPlayerId,
            coordinates: event.coordinates,
            clockSeconds: event.quarterTimeRemainingSeconds,
          });
        },

        undoLastPlayByPlayEvent: (matchId) => {
          get().undoLastEvent(matchId);
        },
      };
    },
    {
      name: CLUB_STORAGE_KEY,
      version: CLUB_STORE_VERSION,
      // Only the tab running the sync engine writes it (S13.3).
      storage: createJSONStorage(gatedLocalStorage),
      partialize: (state): ClubDataState => ({
        currentUser: state.currentUser,
        users: state.users,
        divisions: state.divisions,
        activeDivisionId: state.activeDivisionId,
        teams: state.teams,
        players: state.players,
        matches: state.matches,
        activeMatchId: state.activeMatchId,
      }),
      migrate: (persisted, version) => migrateClubState(persisted, version),
    }
  )
);
