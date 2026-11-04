import type { TeamBoxScore } from '@/core/domain/rules/basketball-rules';

/**
 * Fields the box score shows: the points and made counts that the sheet's scoring plays record.
 * A player box score has the same fields, so one column model serves player rows and the team total.
 */
export type BoxScoreLine = Pick<TeamBoxScore, 'points' | 'ft' | 'fg2' | 'fg3'>;

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
