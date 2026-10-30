/**
 * =============================================================================
 * HOOP OS - LINEUP RULES (FIBA Art. 4)
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
