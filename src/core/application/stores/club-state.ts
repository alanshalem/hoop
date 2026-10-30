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
  };
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
