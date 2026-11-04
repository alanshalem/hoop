import {
  ChartLabelSchema,
  ChartSymbolSchema,
  chartCodeRecordId,
  customChartCode,
  findChartCode,
  type ChartCategory,
  type ChartCode,
  type ChartCodeRecord,
  type ChartTone,
} from '@/core/domain/entities/chart.types';
import { resolveChartCatalog } from '@/core/domain/rules/chart-catalog';

/**
 * =============================================================================
 * HOOP OS - CLUB CHART CATALOG USE-CASES (S9)
 * Pure functions over the club's chart code records: records in, new records
 * (or a typed refusal) out. Untouched records keep their reference so the sync
 * diff only sends the record that changed. Codes are archived, never deleted.
 * =============================================================================
 */

export type ChartCodeTextReason = 'INVALID_SYMBOL' | 'INVALID_LABEL';
export type ChartCodeEditReason = ChartCodeTextReason | 'CHART_CODE_NOT_FOUND';

export type ChartCatalogResult<Reason extends string> =
  | { ok: true; chartCodes: ChartCodeRecord[] }
  | { ok: false; reason: Reason };

export type CreateChartCodeResult =
  | { ok: true; chartCodes: ChartCodeRecord[]; code: string }
  | { ok: false; reason: ChartCodeTextReason };

export interface ChartCatalogContext {
  clubId: string;
}

export interface NewChartCodeInput {
  category: ChartCategory;
  symbol: string;
  label: string;
  tone: ChartTone;
}

export type ChartCodeUpdates = Partial<Pick<ChartCode, 'symbol' | 'label' | 'tone'>>;

type TextResult<T> = { ok: true; value: T } | { ok: false; reason: ChartCodeTextReason };

/** Trims and checks symbol (1-3 chars) and label (1-40 chars); absent fields are not checked. */
function validateText<T extends { symbol?: string; label?: string }>(text: T): TextResult<T> {
  const value = { ...text };
  if (text.symbol !== undefined) {
    const symbol = ChartSymbolSchema.safeParse(text.symbol);
    if (!symbol.success) return { ok: false, reason: 'INVALID_SYMBOL' };
    value.symbol = symbol.data;
  }
  if (text.label !== undefined) {
    const label = ChartLabelSchema.safeParse(text.label);
    if (!label.success) return { ok: false, reason: 'INVALID_LABEL' };
    value.label = label.data;
  }
  return { ok: true, value };
}

/** Adds a custom code (`CUSTOM_<id>`) after the last code of its category. */
export function createChartCode(
  records: readonly ChartCodeRecord[],
  input: NewChartCodeInput,
  ctx: ChartCatalogContext & { id: string }
): CreateChartCodeResult {
  const text = validateText(input);
  if (!text.ok) return text;
  const { category, symbol, label, tone } = text.value;
  const code = customChartCode(ctx.id);
  const codes = resolveChartCatalog(records)[category];
  const order = codes.reduce((last, entry) => Math.max(last, entry.order), -1) + 1;
  const record: ChartCodeRecord = {
    id: chartCodeRecordId(ctx.clubId, category, code),
    clubId: ctx.clubId,
    category,
    code,
    symbol,
    label,
    tone,
    archived: false,
    order,
  };
  return { ok: true, chartCodes: [...records, record], code };
}

/** Edits symbol, label or tone of any code; a built-in code gets its override record. */
export function updateChartCode(
  records: readonly ChartCodeRecord[],
  category: ChartCategory,
  code: string,
  updates: ChartCodeUpdates,
  ctx: ChartCatalogContext
): ChartCatalogResult<ChartCodeEditReason> {
  const text = validateText(updates);
  if (!text.ok) return text;
  const { symbol, label, tone } = text.value;
  return upsertRecord(records, category, code, ctx, (record) => ({
    ...record,
    ...(symbol === undefined ? {} : { symbol }),
    ...(label === undefined ? {} : { label }),
    ...(tone === undefined ? {} : { tone }),
  }));
}

/** Archived codes leave the live pad but keep rendering old entries. */
export function setChartCodeArchived(
  records: readonly ChartCodeRecord[],
  category: ChartCategory,
  code: string,
  archived: boolean,
  ctx: ChartCatalogContext
): ChartCatalogResult<'CHART_CODE_NOT_FOUND'> {
  return upsertRecord(records, category, code, ctx, (record) => ({ ...record, archived }));
}

/** Applies `update` to the record of a code, creating it from the effective code when absent. */
function upsertRecord(
  records: readonly ChartCodeRecord[],
  category: ChartCategory,
  code: string,
  ctx: ChartCatalogContext,
  update: (record: ChartCodeRecord) => ChartCodeRecord
): ChartCatalogResult<'CHART_CODE_NOT_FOUND'> {
  const current = findChartCode(category, code, resolveChartCatalog(records));
  if (!current) return { ok: false, reason: 'CHART_CODE_NOT_FOUND' };
  const index = records.findIndex((record) => record.category === category && record.code === code);
  if (index === -1) {
    const { symbol, label, tone, archived, order } = current;
    const created: ChartCodeRecord = {
      id: chartCodeRecordId(ctx.clubId, category, code),
      clubId: ctx.clubId,
      category,
      code,
      symbol,
      label,
      tone,
      archived,
      order,
    };
    return { ok: true, chartCodes: [...records, update(created)] };
  }
  return { ok: true, chartCodes: records.map((record, i) => (i === index ? update(record) : record)) };
}
