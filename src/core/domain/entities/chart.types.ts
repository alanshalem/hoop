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
  /** POINTS_ALLOWED: points of the basket allowed. OFFENSE: points scored when `made`. */
  points: ChartPointsSchema.optional(),
  /** Only for OFFENSE: whether the action ended in a basket (S11). */
  made: z.boolean().optional(),
});
export type ChartEntry = z.infer<typeof ChartEntrySchema>;

/** POSITIVE is drawn in blue and NEGATIVE in red, like the inks on the paper sheet. */
export const ChartToneSchema = z.enum(['POSITIVE', 'NEGATIVE']);
export type ChartTone = z.infer<typeof ChartToneSchema>;

export interface ChartCode {
  code: string;
  /** One to three characters shown next to the jersey number on the sheet. */
  symbol: string;
  label: string;
  tone: ChartTone;
  /** Hidden from the live pad and refused for new entries; old entries still render (S9). */
  archived: boolean;
  /** Added by the club (code `CUSTOM_<id>`), not part of the built-in catalog. */
  custom: boolean;
  /** Position inside its category; built-in codes default to their catalog index. */
  order: number;
}

type BuiltInCode = Pick<ChartCode, 'code' | 'symbol' | 'label' | 'tone'>;

const negative = (code: string, symbol: string, label: string): BuiltInCode => ({
  code,
  symbol,
  label,
  tone: 'NEGATIVE',
});
const positive = (code: string, symbol: string, label: string): BuiltInCode => ({
  code,
  symbol,
  label,
  tone: 'POSITIVE',
});

const builtIn = (codes: BuiltInCode[]): readonly ChartCode[] =>
  codes.map((code, order) => ({ ...code, archived: false, custom: false, order }));

/** A club's effective catalog: built-in codes with its overrides, plus its custom codes. */
export type ChartCatalog = Record<ChartCategory, readonly ChartCode[]>;

/** Built-in defaults: the catalog of a club that has not edited it. */
export const CHART_CATALOG: ChartCatalog = {
  TURNOVER: builtIn([
    negative('BAD_PASS', 'P', 'Pase malo'),
    negative('TRAVELLING', 'C', 'Caminos'),
    negative('DOUBLE_DRIBBLE', 'DD', 'Doble dribling'),
    negative('BALL_HANDLING', 'M', 'Manejo de balón'),
    negative('OFFENSIVE_FOUL', 'FO', 'Falta ofensiva'),
    negative('UNNECESSARY_FOUL', 'FI', 'Foul innecesario'),
    negative('TIME_VIOLATION', 'T', 'Violación de tiempo'),
    negative('OUT_OF_BOUNDS', 'AF', 'Pelota afuera'),
    negative('OTHER', '?', 'Otra'),
  ]),
  POINTS_ALLOWED: builtIn([
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
  ]),
  OFFENSE: builtIn([
    positive('GOOD_SHOT', 'A', 'Buen lanzamiento'),
    negative('BAD_SHOT', 'R', 'Mal lanzamiento'),
    positive('LAYUP', 'B', 'Bandeja'),
    negative('FORCED_SHOT', 'F', 'Forzado permitido'),
  ]),
  DEFENSE: builtIn([
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
  ]),
};

/** Finds a code inside its own category, archived ones included (old entries keep rendering). */
export function findChartCode(
  category: ChartCategory,
  code: string,
  catalog: ChartCatalog = CHART_CATALOG
): ChartCode | undefined {
  return catalog[category].find((entry) => entry.code === code);
}

// -----------------------------------------------------------------------------
// CLUB CATALOG RECORDS (S9)
// -----------------------------------------------------------------------------

export const CHART_SYMBOL_MAX_LENGTH = 3;
export const CHART_LABEL_MAX_LENGTH = 40;
export const CUSTOM_CHART_CODE_PREFIX = 'CUSTOM_';

export const ChartSymbolSchema = z.string().trim().min(1).max(CHART_SYMBOL_MAX_LENGTH);
export const ChartLabelSchema = z.string().trim().min(1).max(CHART_LABEL_MAX_LENGTH);

const CUSTOM_CODE_PATTERN = /^CUSTOM_[A-Za-z0-9_-]+$/;

export function customChartCode(id: string): string {
  return `${CUSTOM_CHART_CODE_PREFIX}${id}`;
}

export function isBuiltInChartCode(category: ChartCategory, code: string): boolean {
  return CHART_CATALOG[category].some((entry) => entry.code === code);
}

/** One record per club, category and code: the same code may live in several categories. */
export function chartCodeRecordId(clubId: string, category: ChartCategory, code: string): string {
  return `${clubId}:${category}:${code}`;
}

/**
 * A club's version of one code: an override of a built-in code (same category
 * and code) or a custom code. Records are archived, never deleted.
 */
export const ChartCodeRecordSchema = z
  .object({
    id: z.string().min(1, 'Chart code record ID is required'),
    clubId: z.string().min(1, 'Club ID is required'),
    category: ChartCategorySchema,
    code: z.string().min(1, 'Chart code is required'),
    symbol: ChartSymbolSchema,
    label: ChartLabelSchema,
    tone: ChartToneSchema,
    archived: z.boolean(),
    order: z.number().int().nonnegative(),
  })
  .refine((record) => record.id === chartCodeRecordId(record.clubId, record.category, record.code), {
    message: 'Chart code record id must be <clubId>:<category>:<code>',
  })
  .refine(
    (record) => isBuiltInChartCode(record.category, record.code) || CUSTOM_CODE_PATTERN.test(record.code),
    { message: 'Chart code must be built-in in its category or CUSTOM_<id>' }
  );
export type ChartCodeRecord = z.infer<typeof ChartCodeRecordSchema>;
