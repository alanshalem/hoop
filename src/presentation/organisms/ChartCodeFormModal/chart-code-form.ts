import { z } from 'zod';
import {
  CHART_LABEL_MAX_LENGTH,
  CHART_SYMBOL_MAX_LENGTH,
  ChartToneSchema,
  type ChartCategory,
  type ChartTone,
} from '@/core/domain/entities/chart.types';
import type { ChartCodeEditReason } from '@/core/application/use-cases/chart-catalog-use-cases';

const SYMBOL_MESSAGE = `El símbolo debe tener de 1 a ${CHART_SYMBOL_MAX_LENGTH} caracteres.`;
const LABEL_MESSAGE = `El nombre debe tener de 1 a ${CHART_LABEL_MAX_LENGTH} caracteres.`;

/** Same limits as the use-cases (S9), so the form refuses what the store would refuse. */
export const ChartCodeFormSchema = z.object({
  symbol: z.string().trim().min(1, SYMBOL_MESSAGE).max(CHART_SYMBOL_MAX_LENGTH, SYMBOL_MESSAGE),
  label: z.string().trim().min(1, LABEL_MESSAGE).max(CHART_LABEL_MAX_LENGTH, LABEL_MESSAGE),
  tone: ChartToneSchema,
});

export type ChartCodeFormData = z.infer<typeof ChartCodeFormSchema>;

export const CHART_CODE_REFUSAL_MESSAGES: Record<ChartCodeEditReason, string> = {
  INVALID_SYMBOL: SYMBOL_MESSAGE,
  INVALID_LABEL: LABEL_MESSAGE,
  CHART_CODE_NOT_FOUND: 'El código ya no está en el catálogo del club.',
};

export const CHART_TONE_LABELS: Record<ChartTone, string> = {
  POSITIVE: 'Azul (positiva)',
  NEGATIVE: 'Rojo (negativa)',
};

/** Pérdidas and Puntos recibidos are negative on the paper sheet; new codes start that way. */
export function defaultChartTone(category: ChartCategory): ChartTone {
  return category === 'TURNOVER' || category === 'POINTS_ALLOWED' ? 'NEGATIVE' : 'POSITIVE';
}

/** Section summary, e.g. "8 códigos · 1 archivado". */
export function formatChartCodeCounts(active: number, archived: number): string {
  const codes = `${active} ${active === 1 ? 'código' : 'códigos'}`;
  if (archived === 0) return codes;
  return `${codes} · ${archived} ${archived === 1 ? 'archivado' : 'archivados'}`;
}
