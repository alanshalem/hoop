import type { ScoringLine } from '@/core/domain/rules/basketball-rules';

/**
 * Player rows and the team total are both scoring lines, so one column model serves them all.
 */
export type BoxScoreLine = ScoringLine;

export interface BoxScoreColumn {
  label: string;
  title: string;
  value: (line: BoxScoreLine) => number;
}

export const BOX_SCORE_COLUMNS: readonly BoxScoreColumn[] = [
  { label: 'PTS', title: 'Puntos', value: (line) => line.points },
  { label: 'TL', title: 'Tiros libres convertidos', value: (line) => line.ft.made },
  { label: '2P', title: 'Dobles convertidos', value: (line) => line.fg2.made },
  { label: '3P', title: 'Triples convertidos', value: (line) => line.fg3.made },
];
