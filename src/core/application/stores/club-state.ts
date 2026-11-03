import type { ChartCatalog, ChartCodeRecord } from '@/core/domain/entities/chart.types';
import { resolveChartCatalog } from '@/core/domain/rules/chart-catalog';
import type { Division, Player, Team, User } from '@/core/domain/entities/club.types';
import type { Match } from '@/core/domain/entities/match.types';
import {
  createSeedState,
  SEED_ACTIVE_DIVISION_ID,
  SEED_LIVE_MATCH_ID,
} from '@/core/infrastructure/mocks/seed-data';

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
}

/**
 * Bump whenever the persisted shape changes; older storage is reseeded.
 * v2: derived scoreboard, startingLineupOwn, users, medicalNote, full play-by-play seed.
 */
export const CLUB_STORE_VERSION = 3;

export function createInitialClubState(now: Date = new Date()): ClubDataState {
  const seed = createSeedState(now);
  return {
    currentUser: seed.users[0],
    users: seed.users,
    divisions: seed.divisions,
    activeDivisionId: SEED_ACTIVE_DIVISION_ID,
    teams: seed.teams,
    players: seed.players,
    matches: seed.matches,
    activeMatchId: SEED_LIVE_MATCH_ID,
    // No records: the seed club uses the built-in catalog.
    chartCodes: [],
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

/**
 * Persist merge: stored data of the current version over the in-memory state.
 * Fields added without a version bump get their default, so older storage keeps
 * its data instead of being reseeded (chart codes, L9).
 */
export function mergePersistedClubState<S extends ClubDataState>(persisted: unknown, current: S): S {
  if (!persisted || typeof persisted !== 'object') return current;
  const stored = persisted as Partial<ClubDataState>;
  return { ...current, ...stored, chartCodes: stored.chartCodes ?? [] };
}

/**
 * Persist migration: storage written by an older version cannot be trusted to
 * match the current schemas, so it is replaced by fresh seed data.
 */
export function migrateClubState(
  persisted: unknown,
  version: number,
  now: Date = new Date()
): ClubDataState {
  if (version < CLUB_STORE_VERSION) return createInitialClubState(now);
  return persisted as ClubDataState;
}
