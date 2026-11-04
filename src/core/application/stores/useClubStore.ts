import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  Division,
  Player,
  User,
} from '@/core/domain/entities/club.types';
import type {
  Match,
  Quarter,
} from '@/core/domain/entities/match.types';
import { withDerivedScoreboard } from '@/core/domain/rules/match-derivations';
import type { ChartCategory } from '@/core/domain/entities/chart.types';
import * as chartCatalog from '@/core/application/use-cases/chart-catalog-use-cases';
import * as club from '@/core/application/use-cases/club-use-cases';
import * as coachUseCases from '@/core/application/use-cases/coach-use-cases';
import type { CoachInput, CoachReason } from '@/core/application/use-cases/coach-use-cases';
import * as matchUseCases from '@/core/application/use-cases/match-use-cases';
import * as rivalUseCases from '@/core/application/use-cases/rival-team-use-cases';
import type {
  ChartCodeEditReason,
  ChartCodeTextReason,
  ChartCodeUpdates,
  NewChartCodeInput,
} from '@/core/application/use-cases/chart-catalog-use-cases';
import type {
  ClubData,
  NewDivisionInput,
} from '@/core/application/use-cases/club-use-cases';
import type {
  NewRivalTeamInput,
  RivalPlayerInput,
  RivalPlayerReason,
} from '@/core/application/use-cases/rival-team-use-cases';
import type {
  CreateMatchInput,
  MatchResult,
  RecordChartEntryInput,
  RecordChartReason,
  RecordEventInput,
  RecordEventReason,
  RequestTimeoutResult,
  StartMatchResult,
  TeamSide,
  UndoChartReason,
  UndoRivalFoulReason,
} from '@/core/application/use-cases/match-use-cases';
import { CLUB_PROFILE } from '@/core/domain/club-profile';
import { reconcileSelection } from '@/core/application/sync/pull-merge';
import type { SyncableClubData } from '@/core/application/sync/sync-types';
import {
  CLUB_STORE_VERSION,
  ClubDataState,
  createInitialClubState,
  mergePersistedClubState,
  migrateClubState,
  selectChartCatalog,
  selectRivalRoster,
} from './club-state';
import { CLUB_STORAGE_KEY, gatedLocalStorage } from './persistence-gate';

export type ActionResult<Reason extends string> =
  | { ok: true }
  | { ok: false; reason: Reason };

export type MatchNotFound = { ok: false; reason: 'MATCH_NOT_FOUND' };

/** Coach ids assigned to a new division's team (S5). */
export interface DivisionStaff {
  headCoachId?: string;
  assistantCoachIds?: string[];
}

export interface ClubStoreState extends ClubDataState {
  // Current user / RBAC: the authenticated account (role comes from the server)
  setCurrentUser: (user: User) => void;

  // Sync
  /** Replaces the synced collections with pulled server data, keeping valid selections. */
  applySyncedData: (data: SyncableClubData) => void;

  // Divisions
  setActiveDivision: (divisionId: string) => void;
  /**
   * Creates the division and its team for the current season, with optional
   * head coach and assistants (coach ids, S5); returns the division ID.
   */
  addDivision: (
    division: NewDivisionInput,
    staff?: DivisionStaff
  ) => { ok: true; id: string } | { ok: false; reason: 'COACH_NOT_FOUND' };
  updateDivision: (id: string, updates: Partial<Omit<Division, 'id'>>) => void;
  /** Also removes its team and leaves its players without a team. */
  deleteDivision: (id: string) => void;
  /** Any existing coach (S5); `coachId: null` unassigns the head coach. */
  assignHeadCoach: (
    teamId: string,
    coachId: string | null
  ) => ActionResult<'TEAM_NOT_FOUND' | 'COACH_NOT_FOUND'>;
  /** Replaces the team assistants with existing coaches (S5). */
  assignAssistantCoaches: (
    teamId: string,
    coachIds: string[]
  ) => ActionResult<'TEAM_NOT_FOUND' | 'COACH_NOT_FOUND'>;

  // Coaches (S5): records without login
  /** Returns the new coach's id. */
  createCoach: (input: CoachInput) => { ok: true; id: string } | { ok: false; reason: CoachReason };
  updateCoach: (coachId: string, updates: Partial<CoachInput>) => ActionResult<CoachReason | 'COACH_NOT_FOUND'>;
  /** Also unassigns the coach from every team. */
  deleteCoach: (coachId: string) => ActionResult<'COACH_NOT_FOUND'>;

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
  startMatch: (
    matchId: string,
    rosterIds: string[],
    starterIds: string[]
  ) => StartMatchResult | MatchNotFound;
  recordEvent: (
    matchId: string,
    input: RecordEventInput
  ) => MatchResult<RecordEventReason> | MatchNotFound;
  /** Removes the last rival foul (S15). */
  undoLastRivalFoul: (matchId: string) => MatchResult<UndoRivalFoulReason> | MatchNotFound;
  recordChartEntry: (
    matchId: string,
    input: RecordChartEntryInput
  ) => MatchResult<RecordChartReason> | MatchNotFound;
  undoLastChartEntry: (matchId: string) => MatchResult<UndoChartReason> | MatchNotFound;

  // Chart catalog (S9): read it with `selectChartCatalog`
  /** Adds a custom code to a category; returns its code. */
  createChartCode: (
    input: NewChartCodeInput
  ) => { ok: true; code: string } | { ok: false; reason: ChartCodeTextReason };
  /** Edits symbol, label or tone of a built-in or custom code. */
  updateChartCode: (
    category: ChartCategory,
    code: string,
    updates: ChartCodeUpdates
  ) => ActionResult<ChartCodeEditReason>;
  /** Archived codes leave the live pad; old entries keep rendering. */
  setChartCodeArchived: (
    category: ChartCategory,
    code: string,
    archived: boolean
  ) => ActionResult<'CHART_CODE_NOT_FOUND'>;

  // Rival rosters (S14): a match resolves its roster with `selectRivalRoster`
  /** Adds an empty rival team to a division; returns its id. */
  createRivalTeam: (
    input: NewRivalTeamInput
  ) => { ok: true; id: string } | { ok: false; reason: 'INVALID_NAME' };
  renameRivalTeam: (teamId: string, name: string) => ActionResult<'INVALID_NAME' | 'RIVAL_TEAM_NOT_FOUND'>;
  deleteRivalTeam: (teamId: string) => ActionResult<'RIVAL_TEAM_NOT_FOUND'>;
  /** Returns the new player's id. */
  addRivalPlayer: (
    teamId: string,
    input: RivalPlayerInput
  ) => { ok: true; playerId: string } | { ok: false; reason: RivalPlayerReason | 'RIVAL_TEAM_NOT_FOUND' };
  updateRivalPlayer: (
    teamId: string,
    playerId: string,
    updates: Partial<RivalPlayerInput>
  ) => ActionResult<RivalPlayerReason | 'PLAYER_NOT_FOUND' | 'RIVAL_TEAM_NOT_FOUND'>;
  removeRivalPlayer: (
    teamId: string,
    playerId: string
  ) => ActionResult<'PLAYER_NOT_FOUND' | 'RIVAL_TEAM_NOT_FOUND'>;

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

      /** Stores the collections a successful use-case returns and reports its outcome. */
      const runCollectionUseCase = <Success, Reason extends string>(
        result: ({ ok: true } & Success) | { ok: false; reason: Reason },
        toState: (success: Success) => Partial<ClubDataState>
      ): ActionResult<Reason> => {
        if (result.ok) set(toState(result));
        return toActionResult(result);
      };

      return {
        ...createInitialClubState(),

        setCurrentUser: (user) => set({ currentUser: user }),

        applySyncedData: (data) => set((state) => ({ ...data, ...reconcileSelection(state, data) })),

        setActiveDivision: (divisionId) => set({ activeDivisionId: divisionId }),

        addDivision: (division, staff = {}) => {
          const divisionId = createId('div');
          const result = club.createDivision(clubData(), get().coaches, division, {
            divisionId,
            teamId: createId('team'),
            season: CLUB_PROFILE.season,
            clubName: CLUB_PROFILE.name,
            headCoachId: staff.headCoachId,
            assistantCoachIds: staff.assistantCoachIds,
          });
          if (!result.ok) return result;
          set(result.data);
          return { ok: true, id: divisionId };
        },

        updateDivision: (id, updates) =>
          set(club.updateDivision(clubData(), id, updates, { clubName: CLUB_PROFILE.name })),

        deleteDivision: (id) => set(club.deleteDivision(clubData(), id)),

        assignHeadCoach: (teamId, coachId) =>
          runCollectionUseCase(club.assignHeadCoach(clubData(), get().coaches, teamId, coachId), (r) => r.data),

        assignAssistantCoaches: (teamId, coachIds) =>
          runCollectionUseCase(
            club.assignAssistantCoaches(clubData(), get().coaches, teamId, coachIds),
            (r) => r.data
          ),

        createCoach: (input) => {
          const result = coachUseCases.createCoach(get().coaches, input, {
            id: createId('coach'),
            clubId: CLUB_PROFILE.id,
          });
          if (!result.ok) return result;
          set({ coaches: result.coaches });
          return { ok: true, id: result.id };
        },

        updateCoach: (coachId, updates) =>
          runCollectionUseCase(coachUseCases.updateCoach(get().coaches, coachId, updates), (r) => ({
            coaches: r.coaches,
          })),

        deleteCoach: (coachId) => {
          const { coaches, teams } = get();
          return runCollectionUseCase(coachUseCases.deleteCoach({ coaches, teams }, coachId), (r) => ({
            coaches: r.coaches,
            teams: r.teams,
          }));
        },

        addPlayer: (player) => {
          const id = createId('p');
          set(club.addPlayer(clubData(), player, { id }));
          return id;
        },

        updatePlayer: (id, updates) => set(club.updatePlayer(clubData(), id, updates)),

        deletePlayer: (id) => set(club.deletePlayer(clubData(), id)),

        callUpPlayerToTeam: (playerId, targetTeamId) =>
          runCollectionUseCase(club.callUpPlayer(clubData(), playerId, targetTeamId), (r) => r.data),

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

        startMatch: (matchId, rosterIds, starterIds) =>
          runMatchUseCase(matchId, (m) => matchUseCases.startMatch(m, rosterIds, starterIds)),

        recordEvent: (matchId, input) =>
          runMatchUseCase(matchId, (m) => matchUseCases.recordEvent(m, input, eventContext())),

        undoLastRivalFoul: (matchId) => runMatchUseCase(matchId, matchUseCases.undoLastRivalFoul),

        recordChartEntry: (matchId, input) =>
          runMatchUseCase(matchId, (m) =>
            matchUseCases.recordChartEntry(
              m,
              input,
              eventContext(),
              selectChartCatalog(get()),
              selectRivalRoster(get(), m)
            )
          ),

        undoLastChartEntry: (matchId) => runMatchUseCase(matchId, matchUseCases.undoLastChartEntry),

        createChartCode: (input) => {
          const result = chartCatalog.createChartCode(get().chartCodes, input, {
            id: createId('cc'),
            clubId: CLUB_PROFILE.id,
          });
          if (!result.ok) return result;
          set({ chartCodes: result.chartCodes });
          return { ok: true, code: result.code };
        },

        updateChartCode: (category, code, updates) =>
          runCollectionUseCase(
            chartCatalog.updateChartCode(get().chartCodes, category, code, updates, { clubId: CLUB_PROFILE.id }),
            (r) => ({ chartCodes: r.chartCodes })
          ),

        setChartCodeArchived: (category, code, archived) =>
          runCollectionUseCase(
            chartCatalog.setChartCodeArchived(get().chartCodes, category, code, archived, { clubId: CLUB_PROFILE.id }),
            (r) => ({ chartCodes: r.chartCodes })
          ),

        createRivalTeam: (input) => {
          const result = rivalUseCases.createRivalTeam(get().rivalTeams, input, {
            id: createId('rival'),
            clubId: CLUB_PROFILE.id,
          });
          if (!result.ok) return result;
          set({ rivalTeams: result.rivalTeams });
          return { ok: true, id: result.id };
        },

        renameRivalTeam: (teamId, name) =>
          runCollectionUseCase(rivalUseCases.renameRivalTeam(get().rivalTeams, teamId, name), (r) => ({
            rivalTeams: r.rivalTeams,
          })),

        deleteRivalTeam: (teamId) =>
          runCollectionUseCase(rivalUseCases.deleteRivalTeam(get().rivalTeams, teamId), (r) => ({
            rivalTeams: r.rivalTeams,
          })),

        addRivalPlayer: (teamId, input) => {
          const result = rivalUseCases.addRivalPlayer(get().rivalTeams, teamId, input, { id: createId('rp') });
          if (!result.ok) return result;
          set({ rivalTeams: result.rivalTeams });
          return { ok: true, playerId: result.playerId };
        },

        updateRivalPlayer: (teamId, playerId, updates) =>
          runCollectionUseCase(rivalUseCases.updateRivalPlayer(get().rivalTeams, teamId, playerId, updates), (r) => ({
            rivalTeams: r.rivalTeams,
          })),

        removeRivalPlayer: (teamId, playerId) =>
          runCollectionUseCase(rivalUseCases.removeRivalPlayer(get().rivalTeams, teamId, playerId), (r) => ({
            rivalTeams: r.rivalTeams,
          })),

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
        chartCodes: state.chartCodes,
        rivalTeams: state.rivalTeams,
        coaches: state.coaches,
      }),
      migrate: (persisted, version) => migrateClubState(persisted, version),
      // New synced fields default without a version bump, so local data is not reseeded (L9).
      merge: (persisted, current) => mergePersistedClubState(persisted, current),
    }
  )
);
