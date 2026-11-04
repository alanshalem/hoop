import {
  CHART_CATALOG,
  CHART_CATEGORIES,
  type ChartCatalog,
  type ChartCategory,
  type ChartCode,
  type ChartCodeRecord,
} from '../entities/chart.types';

/**
 * =============================================================================
 * HOOP OS - CLUB CHART CATALOG (S9)
 * No records means the built-in catalog. A record with the category and code of
 * a built-in code overrides it; any other record is a custom code of the club.
 * Every category is sorted by `order` (ties: built-in first, then by code) so
 * all devices show the same pad.
 * =============================================================================
 */

export function resolveChartCatalog(records: readonly ChartCodeRecord[]): ChartCatalog {
  const catalog = {} as Record<ChartCategory, ChartCode[]>;
  for (const category of CHART_CATEGORIES) {
    const ofCategory = records.filter((record) => record.category === category);
    const overrides = new Map(ofCategory.map((record) => [record.code, record]));
    const builtIn = CHART_CATALOG[category].map((code) => {
      const override = overrides.get(code.code);
      return override ? { ...code, ...fromRecord(override), custom: false } : code;
    });
    const builtInCodes = new Set(builtIn.map((code) => code.code));
    const custom = ofCategory
      .filter((record) => !builtInCodes.has(record.code))
      .map((record): ChartCode => ({ ...fromRecord(record), code: record.code, custom: true }));
    catalog[category] = [...builtIn, ...custom].sort(compareChartCodes);
  }
  return catalog;
}

/** Codes offered on the live pad: archived codes only render old entries. */
export function activeChartCodes(catalog: ChartCatalog, category: ChartCategory): ChartCode[] {
  return catalog[category].filter((code) => !code.archived);
}

function fromRecord(record: ChartCodeRecord): Omit<ChartCode, 'code' | 'custom'> {
  const { symbol, label, tone, archived, order } = record;
  return { symbol, label, tone, archived, order };
}

function compareChartCodes(a: ChartCode, b: ChartCode): number {
  if (a.order !== b.order) return a.order - b.order;
  if (a.custom !== b.custom) return a.custom ? 1 : -1;
  if (a.code === b.code) return 0;
  return a.code < b.code ? -1 : 1;
}
