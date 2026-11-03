import type { RivalTeam } from '@/core/domain/entities/rival.types';

/** Comparable form of a team name: trimmed, lower case, without accents. */
function normalizeTeamName(name: string): string {
  return name.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * The rival roster of a match (L18): the team of the match division whose name
 * matches the match rival name, ignoring case, accents and surrounding spaces.
 */
export function findRivalTeam(
  rivalTeams: readonly RivalTeam[],
  divisionId: string,
  rivalName: string
): RivalTeam | undefined {
  const name = normalizeTeamName(rivalName);
  return rivalTeams.find((team) => team.divisionId === divisionId && normalizeTeamName(team.name) === name);
}
