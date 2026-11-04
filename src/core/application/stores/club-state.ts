import type { ChartCatalog, ChartCodeRecord } from '@/core/domain/entities/chart.types';
import { resolveChartCatalog } from '@/core/domain/rules/chart-catalog';
import type { Division, Player, Team, User } from '@/core/domain/entities/club.types';
import type { Coach } from '@/core/domain/entities/coach.types';
import type { Match } from '@/core/domain/entities/match.types';
import type { RivalPlayer, RivalTeam } from '@/core/domain/entities/rival.types';
import { findRivalTeam } from '@/core/domain/rules/rival-teams';

/**
 * Persisted shape of the club store (data only, no actions).
 */
export interface ClubDataState {
  currentUser: User;
  users: User[];
  divisions: Division[];
  activeDivisionId: string;
  teams: Team[];
  players: Player[];
  matches: Match[];
  activeMatchId: string;
  /** Club edits of the chart catalog (S9); empty means the built-in catalog. */
  chartCodes: ChartCodeRecord[];
  /** Rival teams and their players, per division (S14). */
  rivalTeams: RivalTeam[];
  /** Coaches without login, assigned to division teams (S5). */
  coaches: Coach[];
}

/**
 * Bump whenever the persisted shape changes; older storage is dropped.
 * v2: derived scoreboard, startingLineupOwn, users, medicalNote, full play-by-play seed.
 * v4: no bundled demo data; storage of older versions (which may hold the demo
 * seed or data replaced on the server) is discarded (S1, L5).
 */
export const CLUB_STORE_VERSION = 4;

/** Stands in for the account until the session provides it (see SessionProvider). */
const PLACEHOLDER_USER_ID = 'user-pending';

/**
 * Empty club: every record comes from the server (no demo seed in the client,
 * L5). The placeholder user has the fewest permissions and is replaced by the
 * authenticated account after login.
 */
export function createInitialClubState(now: Date = new Date()): ClubDataState {
  const timestamp = now.toISOString();
  return {
    currentUser: {
      id: PLACEHOLDER_USER_ID,
      email: 'pending@hoop.invalid',
      name: 'Usuario',
      role: 'ASSISTANT_STATISTICIAN',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    users: [],
    divisions: [],
    activeDivisionId: '',
    teams: [],
    players: [],
    matches: [],
    activeMatchId: '',
    // No records: the built-in chart catalog.
    chartCodes: [],
    rivalTeams: [],
    coaches: [],
  };
}

const resolvedCatalogs = new WeakMap<readonly ChartCodeRecord[], ChartCatalog>();

/**
 * The club's effective chart catalog. Memoized by the records array, so store
 * selectors get the same object until the chart codes change.
 */
export function selectChartCatalog(state: Pick<ClubDataState, 'chartCodes'>): ChartCatalog {
  let catalog = resolvedCatalogs.get(state.chartCodes);
  if (!catalog) {
    catalog = resolveChartCatalog(state.chartCodes);
    resolvedCatalogs.set(state.chartCodes, catalog);
  }
  return catalog;
}

const EMPTY_RIVAL_ROSTER: readonly RivalPlayer[] = [];

/**
 * The rival roster of a match (S14, L18): players of the rival team of the match
 * division with the match rival name; one shared empty list when there is none.
 */
export function selectRivalRoster(
  state: Pick<ClubDataState, 'rivalTeams'>,
  match: Pick<Match, 'divisionId' | 'rivalTeamName'>
): readonly RivalPlayer[] {
  return findRivalTeam(state.rivalTeams, match.divisionId, match.rivalTeamName)?.players ?? EMPTY_RIVAL_ROSTER;
}

/**
 * Persist merge: stored data of the current version over the in-memory state.
 * Fields added without a version bump get their default, so older storage keeps
 * its data instead of being reseeded (chart codes L9, rival teams L18, coaches S5).
 */
export function mergePersistedClubState<S extends ClubDataState>(persisted: unknown, current: S): S {
  if (!persisted || typeof persisted !== 'object') return current;
  const stored = persisted as Partial<ClubDataState>;
  return {
    ...current,
    ...stored,
    chartCodes: stored.chartCodes ?? [],
    rivalTeams: stored.rivalTeams ?? [],
    coaches: stored.coaches ?? [],
  };
}

/**
 * Persist migration: storage written by an older version cannot be trusted to
 * match the current schemas or the server data, so it is replaced by the empty
 * initial state; the next sync loads the server snapshot.
 */
export function migrateClubState(
  persisted: unknown,
  version: number,
  now: Date = new Date()
): ClubDataState {
  if (version < CLUB_STORE_VERSION) return createInitialClubState(now);
  return persisted as ClubDataState;
}
