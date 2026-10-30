import type {
  Division,
  Player,
  Team,
  User,
} from '@/core/domain/entities/club.types';

/**
 * =============================================================================
 * HOOP OS - CLUB USE-CASES (divisions, teams, players)
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
  headCoachId?: string;
}

export function createDivision(
  data: ClubData,
  input: NewDivisionInput,
  ctx: CreateDivisionContext
): ClubData {
  const team: Team = {
    id: ctx.teamId,
    name: `${ctx.clubName} - ${input.name}`,
    divisionId: ctx.divisionId,
    season: ctx.season,
    headCoachId: ctx.headCoachId,
    assistantCoachIds: [],
    playerIds: [],
    clubId: input.clubId,
  };
  return {
    ...data,
    divisions: [...data.divisions, { ...input, id: ctx.divisionId }],
    teams: [...data.teams, team],
  };
}

export function updateDivision(
  data: ClubData,
  divisionId: string,
  updates: Partial<Omit<Division, 'id'>>
): ClubData {
  return {
    ...data,
    divisions: data.divisions.map((d) => (d.id === divisionId ? { ...d, ...updates } : d)),
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

export function assignHeadCoach(
  data: ClubData,
  users: User[],
  teamId: string,
  userId: string
): ClubResult<'TEAM_NOT_FOUND' | 'USER_NOT_HEAD_COACH'> {
  if (!data.teams.some((t) => t.id === teamId)) return { ok: false, reason: 'TEAM_NOT_FOUND' };
  const user = users.find((u) => u.id === userId);
  if (!user || user.role !== 'HEAD_COACH') return { ok: false, reason: 'USER_NOT_HEAD_COACH' };
  return {
    ok: true,
    data: {
      ...data,
      teams: data.teams.map((t) => (t.id === teamId ? { ...t, headCoachId: userId } : t)),
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
