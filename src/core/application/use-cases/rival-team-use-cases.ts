import {
  RivalDorsalSchema,
  RivalPlayerNameSchema,
  RivalTeamNameSchema,
  type RivalPlayer,
  type RivalTeam,
} from '@/core/domain/entities/rival.types';

/**
 * =============================================================================
 * HOOP OS - RIVAL ROSTER USE-CASES (S14)
 * Pure functions over the club's rival teams: teams in, new teams (or a typed
 * refusal) out. Untouched teams and players keep their reference so the sync
 * diff only sends the team that changed.
 * =============================================================================
 */

export type RivalPlayerReason = 'INVALID_DORSAL' | 'INVALID_PLAYER_NAME' | 'DUPLICATE_DORSAL';

export type RivalTeamResult<Reason extends string> =
  | { ok: true; rivalTeams: RivalTeam[] }
  | { ok: false; reason: Reason };

export type CreateRivalTeamResult =
  | { ok: true; rivalTeams: RivalTeam[]; id: string }
  | { ok: false; reason: 'INVALID_NAME' };

export type AddRivalPlayerResult =
  | { ok: true; rivalTeams: RivalTeam[]; playerId: string }
  | { ok: false; reason: RivalPlayerReason | 'RIVAL_TEAM_NOT_FOUND' };

export interface NewRivalTeamInput {
  divisionId: string;
  name: string;
}

export type RivalPlayerInput = Omit<RivalPlayer, 'id'>;

type PlayerResult<T> = { ok: true; value: T } | { ok: false; reason: RivalPlayerReason };

/** Checks dorsal (0-99, unique in the team) and trims names; absent fields are not checked. */
function validatePlayer<T extends Partial<RivalPlayerInput>>(
  fields: T,
  teammates: readonly RivalPlayer[]
): PlayerResult<T> {
  const value = { ...fields };
  if (fields.dorsal !== undefined) {
    if (!RivalDorsalSchema.safeParse(fields.dorsal).success) return { ok: false, reason: 'INVALID_DORSAL' };
    if (teammates.some((player) => player.dorsal === fields.dorsal)) return { ok: false, reason: 'DUPLICATE_DORSAL' };
  }
  for (const key of ['firstName', 'lastName'] as const) {
    if (fields[key] === undefined) continue;
    const name = RivalPlayerNameSchema.safeParse(fields[key]);
    if (!name.success) return { ok: false, reason: 'INVALID_PLAYER_NAME' };
    value[key] = name.data;
  }
  return { ok: true, value };
}

/** Applies `update` to one team, or refuses when the team does not exist. */
function updateTeam<Reason extends string>(
  teams: readonly RivalTeam[],
  teamId: string,
  update: (team: RivalTeam) => RivalTeam | { ok: false; reason: Reason }
): RivalTeamResult<Reason | 'RIVAL_TEAM_NOT_FOUND'> {
  const index = teams.findIndex((team) => team.id === teamId);
  if (index === -1) return { ok: false, reason: 'RIVAL_TEAM_NOT_FOUND' };
  const updated = update(teams[index]);
  if ('ok' in updated) return updated;
  return { ok: true, rivalTeams: teams.map((team, i) => (i === index ? updated : team)) };
}

/** Adds an empty rival team to a division. */
export function createRivalTeam(
  teams: readonly RivalTeam[],
  input: NewRivalTeamInput,
  ctx: { id: string; clubId: string }
): CreateRivalTeamResult {
  const name = RivalTeamNameSchema.safeParse(input.name);
  if (!name.success) return { ok: false, reason: 'INVALID_NAME' };
  const team: RivalTeam = { id: ctx.id, clubId: ctx.clubId, divisionId: input.divisionId, name: name.data, players: [] };
  return { ok: true, rivalTeams: [...teams, team], id: ctx.id };
}

/** The name must match the match rival name for the roster to resolve (L18). */
export function renameRivalTeam(
  teams: readonly RivalTeam[],
  teamId: string,
  name: string
): RivalTeamResult<'INVALID_NAME' | 'RIVAL_TEAM_NOT_FOUND'> {
  const parsed = RivalTeamNameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, reason: 'INVALID_NAME' };
  return updateTeam(teams, teamId, (team) => ({ ...team, name: parsed.data }));
}

export function deleteRivalTeam(
  teams: readonly RivalTeam[],
  teamId: string
): RivalTeamResult<'RIVAL_TEAM_NOT_FOUND'> {
  if (!teams.some((team) => team.id === teamId)) return { ok: false, reason: 'RIVAL_TEAM_NOT_FOUND' };
  return { ok: true, rivalTeams: teams.filter((team) => team.id !== teamId) };
}

/** Appends a player to a rival team; returns its id. */
export function addRivalPlayer(
  teams: readonly RivalTeam[],
  teamId: string,
  input: RivalPlayerInput,
  ctx: { id: string }
): AddRivalPlayerResult {
  const result = updateTeam<RivalPlayerReason>(teams, teamId, (team) => {
    const checked = validatePlayer(input, team.players);
    if (!checked.ok) return checked;
    const { dorsal, firstName, lastName } = checked.value;
    return { ...team, players: [...team.players, { id: ctx.id, dorsal, firstName, lastName }] };
  });
  return result.ok ? { ...result, playerId: ctx.id } : result;
}

/** Edits dorsal or names of a rival player. */
export function updateRivalPlayer(
  teams: readonly RivalTeam[],
  teamId: string,
  playerId: string,
  updates: Partial<RivalPlayerInput>
): RivalTeamResult<RivalPlayerReason | 'PLAYER_NOT_FOUND' | 'RIVAL_TEAM_NOT_FOUND'> {
  return updateTeam<RivalPlayerReason | 'PLAYER_NOT_FOUND'>(teams, teamId, (team) => {
    const index = team.players.findIndex((player) => player.id === playerId);
    if (index === -1) return { ok: false, reason: 'PLAYER_NOT_FOUND' };
    const checked = validatePlayer(updates, team.players.filter((_, i) => i !== index));
    if (!checked.ok) return checked;
    const { dorsal, firstName, lastName } = checked.value;
    const players = team.players.map((player, i) =>
      i === index
        ? {
            ...player,
            ...(dorsal === undefined ? {} : { dorsal }),
            ...(firstName === undefined ? {} : { firstName }),
            ...(lastName === undefined ? {} : { lastName }),
          }
        : player
    );
    return { ...team, players };
  });
}

export function removeRivalPlayer(
  teams: readonly RivalTeam[],
  teamId: string,
  playerId: string
): RivalTeamResult<'PLAYER_NOT_FOUND' | 'RIVAL_TEAM_NOT_FOUND'> {
  return updateTeam<'PLAYER_NOT_FOUND'>(teams, teamId, (team) => {
    if (!team.players.some((player) => player.id === playerId)) return { ok: false, reason: 'PLAYER_NOT_FOUND' };
    return { ...team, players: team.players.filter((player) => player.id !== playerId) };
  });
}
