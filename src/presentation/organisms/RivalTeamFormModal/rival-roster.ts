import { z } from 'zod';
import type { Match } from '@/core/domain/entities/match.types';
import {
  RIVAL_PLAYER_NAME_MAX_LENGTH,
  RIVAL_TEAM_NAME_MAX_LENGTH,
  type RivalPlayer,
  type RivalTeam,
} from '@/core/domain/entities/rival.types';
import { findRivalTeam } from '@/core/domain/rules/rival-teams';
import type { RivalPlayerReason } from '@/core/application/use-cases/rival-team-use-cases';

const TEAM_NAME_MESSAGE = `El nombre debe tener de 1 a ${RIVAL_TEAM_NAME_MAX_LENGTH} caracteres.`;
const DORSAL_MESSAGE = 'El dorsal debe ser un número entero de 0 a 99.';
const FIRST_NAME_MESSAGE = `El nombre debe tener de 1 a ${RIVAL_PLAYER_NAME_MAX_LENGTH} caracteres.`;
const LAST_NAME_MESSAGE = `El apellido debe tener de 1 a ${RIVAL_PLAYER_NAME_MAX_LENGTH} caracteres.`;

const playerName = (message: string) =>
  z.string().trim().min(1, message).max(RIVAL_PLAYER_NAME_MAX_LENGTH, message);

/** Same limits as the rival-team use-cases (S14), so the forms refuse what the store would refuse. */
export const RivalTeamFormSchema = z.object({
  divisionId: z.string().min(1, 'Elige la división del rival.'),
  name: z.string().trim().min(1, TEAM_NAME_MESSAGE).max(RIVAL_TEAM_NAME_MAX_LENGTH, TEAM_NAME_MESSAGE),
});
export type RivalTeamFormData = z.infer<typeof RivalTeamFormSchema>;

export const RivalPlayerFormSchema = z.object({
  dorsal: z.number({ message: DORSAL_MESSAGE }).int(DORSAL_MESSAGE).min(0, DORSAL_MESSAGE).max(99, DORSAL_MESSAGE),
  firstName: playerName(FIRST_NAME_MESSAGE),
  lastName: playerName(LAST_NAME_MESSAGE),
});
export type RivalPlayerFormData = z.infer<typeof RivalPlayerFormSchema>;

const TEAM_NOT_FOUND_MESSAGE = 'El equipo rival ya no existe.';

export const RIVAL_TEAM_REFUSAL_MESSAGES: Record<'INVALID_NAME' | 'RIVAL_TEAM_NOT_FOUND', string> = {
  INVALID_NAME: TEAM_NAME_MESSAGE,
  RIVAL_TEAM_NOT_FOUND: TEAM_NOT_FOUND_MESSAGE,
};

export type RivalPlayerRefusal = RivalPlayerReason | 'PLAYER_NOT_FOUND' | 'RIVAL_TEAM_NOT_FOUND';

export const RIVAL_PLAYER_REFUSAL_MESSAGES: Record<RivalPlayerRefusal, string> = {
  INVALID_DORSAL: DORSAL_MESSAGE,
  DUPLICATE_DORSAL: 'Ya hay un jugador con ese dorsal en este equipo.',
  INVALID_PLAYER_NAME: `El nombre y el apellido deben tener de 1 a ${RIVAL_PLAYER_NAME_MAX_LENGTH} caracteres.`,
  PLAYER_NOT_FOUND: 'El jugador ya no está en el plantel del rival.',
  RIVAL_TEAM_NOT_FOUND: TEAM_NOT_FOUND_MESSAGE,
};

/** Form field a refusal belongs to; null when it closes the form with a notice. */
export function rivalPlayerRefusalField(reason: RivalPlayerRefusal): 'dorsal' | 'firstName' | null {
  if (reason === 'INVALID_DORSAL' || reason === 'DUPLICATE_DORSAL') return 'dorsal';
  if (reason === 'INVALID_PLAYER_NAME') return 'firstName';
  return null;
}

/** Roster in jersey order, as read on a scoresheet. */
export function sortRivalPlayers(players: readonly RivalPlayer[]): RivalPlayer[] {
  return [...players].sort((a, b) => a.dorsal - b.dorsal);
}

export function formatRivalPlayerCount(count: number): string {
  if (count === 0) return 'Sin jugadores';
  return `${count} ${count === 1 ? 'jugador' : 'jugadores'}`;
}

/** Matches whose live console resolves this team as the rival roster (same division and name, L18). */
export function countLinkedMatches(
  team: RivalTeam,
  rivalTeams: readonly RivalTeam[],
  matches: readonly Pick<Match, 'divisionId' | 'rivalTeamName'>[]
): number {
  return matches.filter((match) => findRivalTeam(rivalTeams, match.divisionId, match.rivalTeamName)?.id === team.id)
    .length;
}

export function formatLinkedMatches(count: number): string {
  if (count === 0) return 'Ningún partido con este nombre';
  return `${count} ${count === 1 ? 'partido' : 'partidos'} con este nombre`;
}
