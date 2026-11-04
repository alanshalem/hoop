import type {
  Division,
  Player,
  Team,
} from '@/core/domain/entities/club.types';
import type { Coach } from '@/core/domain/entities/coach.types';

/**
 * =============================================================================
 * HOOP - CLUB USE-CASES (divisions, teams, players)
 * Pure functions over the club aggregate; they keep team rosters and player
 * assignments consistent.
 * =============================================================================
 */

export interface ClubData {
  divisions: Division[];
  teams: Team[];
  players: Player[];
}

export type ClubResult<Reason extends string> =
  | { ok: true; data: ClubData }
  | { ok: false; reason: Reason };

export type NewDivisionInput = Omit<Division, 'id'>;

export interface CreateDivisionContext {
  divisionId: string;
  teamId: string;
  season: string;
  clubName: string;
  /** Coach id (S5). */
  headCoachId?: string;
  /** Coach ids (S5). */
  assistantCoachIds?: readonly string[];
}

/** Refusal when an id is not one of the club coaches (S5). */
type CoachNotFound = 'COACH_NOT_FOUND';

function allCoachesExist(coaches: readonly Coach[], ids: readonly string[]): boolean {
  return ids.every((id) => coaches.some((coach) => coach.id === id));
}

/**
 * Creates the division and its team; head coach and assistants are coach ids
 * and must exist.
 */
export function createDivision(
  data: ClubData,
  coaches: readonly Coach[],
  input: NewDivisionInput,
  ctx: CreateDivisionContext
): ClubResult<CoachNotFound> {
  const assistantCoachIds = [...new Set(ctx.assistantCoachIds ?? [])];
  const coachIds = ctx.headCoachId === undefined ? assistantCoachIds : [ctx.headCoachId, ...assistantCoachIds];
  if (!allCoachesExist(coaches, coachIds)) return { ok: false, reason: 'COACH_NOT_FOUND' };
  const team: Team = {
    id: ctx.teamId,
    name: buildTeamName(ctx.clubName, input.name),
    divisionId: ctx.divisionId,
    season: ctx.season,
    headCoachId: ctx.headCoachId,
    assistantCoachIds,
    playerIds: [],
    clubId: input.clubId,
  };
  return {
    ok: true,
    data: {
      ...data,
      divisions: [...data.divisions, { ...input, id: ctx.divisionId }],
      teams: [...data.teams, team],
    },
  };
}

function buildTeamName(clubName: string, divisionName: string): string {
  return `${clubName} - ${divisionName}`;
}

/**
 * Updates a division; a rename also renames the teams of that division.
 */
export function updateDivision(
  data: ClubData,
  divisionId: string,
  updates: Partial<Omit<Division, 'id'>>,
  ctx: { clubName: string }
): ClubData {
  const renamedTo = updates.name;
  return {
    ...data,
    divisions: data.divisions.map((d) => (d.id === divisionId ? { ...d, ...updates } : d)),
    teams: renamedTo
      ? data.teams.map((t) =>
          t.divisionId === divisionId ? { ...t, name: buildTeamName(ctx.clubName, renamedTo) } : t
        )
      : data.teams,
  };
}

/**
 * Removes a division, its teams, and leaves their players without a team.
 */
export function deleteDivision(data: ClubData, divisionId: string): ClubData {
  const removedTeamIds = new Set(
    data.teams.filter((t) => t.divisionId === divisionId).map((t) => t.id)
  );
  return {
    divisions: data.divisions.filter((d) => d.id !== divisionId),
    teams: data.teams.filter((t) => !removedTeamIds.has(t.id)),
    players: data.players.map((p) =>
      p.teamId && removedTeamIds.has(p.teamId) ? { ...p, teamId: undefined } : p
    ),
  };
}

/** Assigns any existing coach as the team head coach (S5). */
export function assignHeadCoach(
  data: ClubData,
  coaches: readonly Coach[],
  teamId: string,
  /** `null` leaves the team without a head coach. */
  coachId: string | null
): ClubResult<'TEAM_NOT_FOUND' | CoachNotFound> {
  if (!data.teams.some((t) => t.id === teamId)) return { ok: false, reason: 'TEAM_NOT_FOUND' };
  if (coachId !== null && !allCoachesExist(coaches, [coachId])) return { ok: false, reason: 'COACH_NOT_FOUND' };
  const headCoachId = coachId ?? undefined;
  return {
    ok: true,
    data: {
      ...data,
      teams: data.teams.map((t) => (t.id === teamId ? { ...t, headCoachId } : t)),
    },
  };
}

/** Replaces the team assistants with existing coaches, once each, in the given order (S5). */
export function assignAssistantCoaches(
  data: ClubData,
  coaches: readonly Coach[],
  teamId: string,
  coachIds: readonly string[]
): ClubResult<'TEAM_NOT_FOUND' | CoachNotFound> {
  if (!data.teams.some((t) => t.id === teamId)) return { ok: false, reason: 'TEAM_NOT_FOUND' };
  if (!allCoachesExist(coaches, coachIds)) return { ok: false, reason: 'COACH_NOT_FOUND' };
  const assistantCoachIds = [...new Set(coachIds)];
  return {
    ok: true,
    data: {
      ...data,
      teams: data.teams.map((t) => (t.id === teamId ? { ...t, assistantCoachIds } : t)),
    },
  };
}

function addToRoster(teams: Team[], teamId: string | undefined, playerId: string): Team[] {
  return teams.map((t) =>
    t.id === teamId && !t.playerIds.includes(playerId)
      ? { ...t, playerIds: [...t.playerIds, playerId] }
      : t
  );
}

function removeFromRoster(teams: Team[], teamId: string | undefined, playerId: string): Team[] {
  return teams.map((t) =>
    t.id === teamId ? { ...t, playerIds: t.playerIds.filter((id) => id !== playerId) } : t
  );
}

export function addPlayer(
  data: ClubData,
  input: Omit<Player, 'id'>,
  ctx: { id: string }
): ClubData {
  return {
    ...data,
    players: [...data.players, { ...input, id: ctx.id }],
    teams: addToRoster(data.teams, input.teamId, ctx.id),
  };
}

/**
 * Updates a player; when the team changes, moves it between team rosters.
 */
export function updatePlayer(
  data: ClubData,
  playerId: string,
  updates: Partial<Omit<Player, 'id'>>
): ClubData {
  const current = data.players.find((p) => p.id === playerId);
  if (!current) return data;

  const teamChanged = 'teamId' in updates && updates.teamId !== current.teamId;
  const teams = teamChanged
    ? addToRoster(removeFromRoster(data.teams, current.teamId, playerId), updates.teamId, playerId)
    : data.teams;

  return {
    ...data,
    players: data.players.map((p) => (p.id === playerId ? { ...p, ...updates } : p)),
    teams,
  };
}

export function deletePlayer(data: ClubData, playerId: string): ClubData {
  return {
    ...data,
    players: data.players.filter((p) => p.id !== playerId),
    teams: data.teams.map((t) => ({
      ...t,
      playerIds: t.playerIds.filter((id) => id !== playerId),
    })),
  };
}

/**
 * Calls a player (typically a juvenile) up to another team's roster. The player
 * keeps its own team assignment.
 */
export function callUpPlayer(
  data: ClubData,
  playerId: string,
  teamId: string
): ClubResult<'PLAYER_NOT_FOUND' | 'TEAM_NOT_FOUND' | 'ALREADY_IN_TEAM'> {
  if (!data.players.some((p) => p.id === playerId)) return { ok: false, reason: 'PLAYER_NOT_FOUND' };
  const team = data.teams.find((t) => t.id === teamId);
  if (!team) return { ok: false, reason: 'TEAM_NOT_FOUND' };
  if (team.playerIds.includes(playerId)) return { ok: false, reason: 'ALREADY_IN_TEAM' };
  return { ok: true, data: { ...data, teams: addToRoster(data.teams, teamId, playerId) } };
}
