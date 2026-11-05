import type { Player, Team } from '../entities/club.types';
import type { Match } from '../entities/match.types';
import { getTeamRosterPlayers } from './team-roster';

/**
 * =============================================================================
 * HOOP - LINEUP RULES (FIBA Art. 4)
 * A team plays with 5 players and may register up to 12 for a game.
 * =============================================================================
 */

export const FIBA_STARTERS = 5;
export const FIBA_MAX_ROSTER = 12;
export const FIBA_MIN_ROSTER = FIBA_STARTERS;

export type LineupIssueCode =
  | 'ROSTER_TOO_SMALL'
  | 'ROSTER_TOO_LARGE'
  | 'STARTERS_COUNT'
  | 'STARTER_NOT_IN_ROSTER';

export interface LineupIssue {
  code: LineupIssueCode;
  message: string;
}

export function validateLineup(rosterIds: string[], starterIds: string[]): LineupIssue[] {
  const issues: LineupIssue[] = [];
  const roster = new Set(rosterIds);
  const starters = new Set(starterIds);

  if (roster.size < FIBA_MIN_ROSTER) {
    issues.push({
      code: 'ROSTER_TOO_SMALL',
      message: `La lista de buena fe necesita al menos ${FIBA_MIN_ROSTER} jugadores.`,
    });
  }
  if (roster.size > FIBA_MAX_ROSTER) {
    issues.push({
      code: 'ROSTER_TOO_LARGE',
      message: `La lista de buena fe admite como máximo ${FIBA_MAX_ROSTER} jugadores.`,
    });
  }
  if (starters.size !== FIBA_STARTERS) {
    issues.push({
      code: 'STARTERS_COUNT',
      message: `Debes elegir exactamente ${FIBA_STARTERS} titulares.`,
    });
  }
  if ([...starters].some((id) => !roster.has(id))) {
    issues.push({
      code: 'STARTER_NOT_IN_ROSTER',
      message: 'Todos los titulares deben estar en la lista de buena fe.',
    });
  }
  return issues;
}

/**
 * Players that can be listed for a match: the match team roster (own players
 * plus called-up juveniles) and anyone already listed, sorted by dorsal.
 * Suspended players are left out, except the ones already listed once the
 * match has started.
 */
export function getLineupCandidates(
  match: Pick<Match, 'status' | 'rosterOwnPlayerIds'>,
  team: Team | undefined,
  players: readonly Player[]
): Player[] {
  const listed = match.rosterOwnPlayerIds;
  const candidateIds = new Set([...getTeamRosterPlayers(team, players).map((p) => p.id), ...listed]);
  return players
    .filter(
      (p) =>
        candidateIds.has(p.id) &&
        (p.status !== 'SUSPENDED' || (match.status !== 'SCHEDULED' && listed.includes(p.id)))
    )
    .sort((a, b) => a.dorsal - b.dorsal);
}
