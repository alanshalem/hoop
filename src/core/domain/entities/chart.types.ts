import { z } from 'zod';

/**
 * =============================================================================
 * HOOP OS - TACTICAL CHARTING ("PLANILLA")
 * The coach's live charting sheet: why things happened, not just what. There is
 * no universal charting standard, so the catalog follows the coach's paper
 * legend, names turnovers after the FIBA Statisticians' Manual 2024 (Annex B,
 * types of turnovers) and uses the usual coaching charts: turnover chart,
 * defensive breakdown chart (one entry per basket allowed) and hustle chart.
 * Codes are stable ids stored in events; labels and symbols can evolve.
 * =============================================================================
 */

export const ChartCategorySchema = z.enum(['TURNOVER', 'POINTS_ALLOWED', 'OFFENSE', 'DEFENSE']);
export type ChartCategory = z.infer<typeof ChartCategorySchema>;

export const CHART_CATEGORIES: readonly ChartCategory[] = ChartCategorySchema.options;

export const CHART_CATEGORY_LABELS: Record<ChartCategory, string> = {
  TURNOVER: 'Pérdidas',
  POINTS_ALLOWED: 'Puntos recibidos',
  OFFENSE: 'Acciones ofensivas',
  DEFENSE: 'Acciones defensivas',
};

export const ChartPointsSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type ChartPoints = z.infer<typeof ChartPointsSchema>;

/** Points allowed default to a two-point basket (the most common one). */
export const DEFAULT_CHART_POINTS: ChartPoints = 2;

export const ChartEntrySchema = z.object({
  category: ChartCategorySchema,
  code: z.string().min(1, 'Chart code is required'),
  /** Only for POINTS_ALLOWED: points of the basket allowed. */
  points: ChartPointsSchema.optional(),
});
export type ChartEntry = z.infer<typeof ChartEntrySchema>;

/** POSITIVE is drawn in blue and NEGATIVE in red, like the inks on the paper sheet. */
export type ChartTone = 'POSITIVE' | 'NEGATIVE';

export interface ChartCode {
  code: string;
  /** One to three characters shown next to the jersey number on the sheet. */
  symbol: string;
  label: string;
  tone: ChartTone;
}

const negative = (code: string, symbol: string, label: string): ChartCode => ({
  code,
  symbol,
  label,
  tone: 'NEGATIVE',
});
const positive = (code: string, symbol: string, label: string): ChartCode => ({
  code,
  symbol,
  label,
  tone: 'POSITIVE',
});

export const CHART_CATALOG: Record<ChartCategory, readonly ChartCode[]> = {
  TURNOVER: [
    negative('BAD_PASS', 'P', 'Pase malo'),
    negative('TRAVELLING', 'C', 'Caminos'),
    negative('DOUBLE_DRIBBLE', 'DD', 'Doble dribling'),
    negative('BALL_HANDLING', 'M', 'Manejo de balón'),
    negative('OFFENSIVE_FOUL', 'FO', 'Falta ofensiva'),
    negative('UNNECESSARY_FOUL', 'FI', 'Foul innecesario'),
    negative('TIME_VIOLATION', 'T', 'Violación de tiempo'),
    negative('OUT_OF_BOUNDS', 'AF', 'Pelota afuera'),
    negative('OTHER', '?', 'Otra'),
  ],
  POINTS_ALLOWED: [
    negative('CUT', 'CO', 'Corte'),
    negative('ONE_ON_ONE', '1x1', '1x1'),
    negative('NO_DEF_REBOUND', 'RD', 'Sin rebote defensivo'),
    negative('UNNECESSARY_FOUL', 'FI', 'Foul innecesario'),
    negative('TURNOVER_FAST_BREAK', 'PC', 'Pérdida + contra'),
    negative('NO_CLOSEOUT', 'X', 'No puntear tiro'),
    negative('NO_ROTATION', 'NR', 'No rotar'),
    negative('NO_TRANSITION_D', 'NT', 'No transición defensiva'),
    negative('BAD_SHOT_TRANSITION', 'TM', 'Transición por mal tiro'),
    negative('PICK', 'PK', 'Pick'),
    negative('OPPONENT_MERIT', 'MR', 'Mérito rival'),
  ],
  OFFENSE: [
    positive('GOOD_SHOT', 'A', 'Buen lanzamiento'),
    negative('BAD_SHOT', 'R', 'Mal lanzamiento'),
    positive('LAYUP', 'B', 'Bandeja'),
    negative('FORCED_SHOT', 'F', 'Forzado permitido'),
  ],
  DEFENSE: [
    positive('DEF_REBOUND', 'RD', 'Rebote defensivo'),
    positive('BOX_OUT', 'BR', 'Bloqueo de rebote'),
    positive('HELP', 'AY', 'Ayuda'),
    positive('CONTEST', 'CT', 'Contestar tiro'),
    positive('ROTATION', 'RO', 'Rotación'),
    positive('TRANSITION_D', 'TD', 'Transición defensiva'),
    positive('PRESSURE', 'PR', 'Presión'),
    positive('STEAL', 'RB', 'Robo'),
    positive('DEFLECTION', 'DV', 'Desvío'),
    positive('GOOD_FOUL', 'BF', 'Buen foul'),
    negative('SECOND_CHANCE', '2O', '2da oportunidad'),
    negative('CUT', 'CO', 'Corte'),
    negative('PICK', 'PK', 'Pick'),
    negative('BAD_FOUL', 'MF', 'Mal foul'),
  ],
};

export function findChartCode(category: ChartCategory, code: string): ChartCode | undefined {
  return CHART_CATALOG[category].find((entry) => entry.code === code);
}
