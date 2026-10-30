import type { Player, Team } from '@/core/domain/entities/club.types';

/**
 * Players of a team: the ones assigned to it (`player.teamId`) plus the ones
 * listed in its roster (`team.playerIds`, which includes called-up juveniles).
 * Sorted by dorsal.
 */
export const getTeamRosterPlayers = (team: Team | undefined, players: Player[]): Player[] => {
  if (!team) return [];
  const rosterIds = new Set(team.playerIds);
  return players
    .filter((player) => player.teamId === team.id || rosterIds.has(player.id))
    .sort((a, b) => a.dorsal - b.dorsal);
};

/** A player listed in a team roster without belonging to that team. */
export const isCalledUpTo = (player: Player, team: Team | undefined): boolean =>
  Boolean(team && player.teamId !== team.id && team.playerIds.includes(player.id));
