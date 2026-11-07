import { calculatePercentage, type MadeShots, type ScoringLine } from '@/core/domain/rules/basketball-rules';

/**
 * Player rows and the team total are both scoring lines, so one column model serves them all.
 */
export type BoxScoreLine = ScoringLine;

export interface BoxScoreColumn {
  label: string;
  title: string;
  value: (line: BoxScoreLine) => number | string;
}

/**
 * Shooting percentage as the box score shows it: decimal comma, no trailing ",0",
 * and a dash when there were no attempts.
 */
export function formatShootingPercentage(made: number, attempted: number): string {
  if (attempted <= 0) return '—';
  return `${String(calculatePercentage(made, attempted)).replace('.', ',')}%`;
}

/** Field goals: doubles plus triples, free throws excluded. */
function fieldGoals(line: BoxScoreLine): MadeShots {
  return {
    made: line.fg2.made + line.fg3.made,
    attempted: line.fg2.attempted + line.fg3.attempted,
  };
}

const madeOfAttempted = ({ made, attempted }: MadeShots) => `${made}/${attempted}`;
const percentageOf = ({ made, attempted }: MadeShots) => formatShootingPercentage(made, attempted);

export const BOX_SCORE_COLUMNS: readonly BoxScoreColumn[] = [
  { label: 'PTS', title: 'Puntos', value: (line) => line.points },
  { label: 'TL', title: 'Tiros libres convertidos/intentados', value: (line) => madeOfAttempted(line.ft) },
  { label: 'TL%', title: 'Porcentaje de tiros libres', value: (line) => percentageOf(line.ft) },
  { label: '2P', title: 'Dobles convertidos/intentados', value: (line) => madeOfAttempted(line.fg2) },
  { label: '2P%', title: 'Porcentaje de dobles', value: (line) => percentageOf(line.fg2) },
  { label: '3P', title: 'Triples convertidos/intentados', value: (line) => madeOfAttempted(line.fg3) },
  { label: '3P%', title: 'Porcentaje de triples', value: (line) => percentageOf(line.fg3) },
  { label: 'TC', title: 'Tiros de campo convertidos/intentados', value: (line) => madeOfAttempted(fieldGoals(line)) },
  { label: 'TC%', title: 'Porcentaje de tiros de campo', value: (line) => percentageOf(fieldGoals(line)) },
];
