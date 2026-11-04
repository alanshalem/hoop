import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  CHART_CATALOG,
  ChartCodeRecordSchema,
  chartCodeRecordId,
  findChartCode,
  type ChartCodeRecord,
} from '../entities/chart.types';
import { activeChartCodes, resolveChartCatalog } from './chart-catalog';

const CLUB = 'club-1';

const record = (overrides: Partial<ChartCodeRecord> & Pick<ChartCodeRecord, 'category' | 'code'>): ChartCodeRecord => ({
  id: chartCodeRecordId(CLUB, overrides.category, overrides.code),
  clubId: CLUB,
  symbol: 'X',
  label: 'Label',
  tone: 'NEGATIVE',
  archived: false,
  order: 0,
  ...overrides,
});

describe('ChartCodeRecordSchema (S9)', () => {
  const valid = record({ category: 'TURNOVER', code: 'BAD_PASS', symbol: 'PM', label: 'Pase malo', order: 0 });

  it('accepts an override of a built-in code and a custom code', () => {
    assert.ok(ChartCodeRecordSchema.safeParse(valid).success);
    const custom = record({ category: 'DEFENSE', code: 'CUSTOM_abc-1', order: 14 });
    assert.ok(ChartCodeRecordSchema.safeParse(custom).success);
  });

  it('trims symbol and label', () => {
    const parsed = ChartCodeRecordSchema.parse({ ...valid, symbol: ' PM ', label: '  Pase malo ' });
    assert.strictEqual(parsed.symbol, 'PM');
    assert.strictEqual(parsed.label, 'Pase malo');
  });

  it('rejects symbols outside 1-3 chars and labels outside 1-40 chars', () => {
    for (const symbol of ['', '   ', 'ABCD']) {
      assert.strictEqual(ChartCodeRecordSchema.safeParse({ ...valid, symbol }).success, false, `symbol "${symbol}"`);
    }
    for (const label of ['', '  ', 'x'.repeat(41)]) {
      assert.strictEqual(ChartCodeRecordSchema.safeParse({ ...valid, label }).success, false, `label "${label}"`);
    }
    assert.ok(ChartCodeRecordSchema.safeParse({ ...valid, symbol: 'ABC', label: 'x'.repeat(40) }).success);
  });

  it('rejects an id that is not <clubId>:<category>:<code>', () => {
    assert.strictEqual(ChartCodeRecordSchema.safeParse({ ...valid, id: 'other' }).success, false);
  });

  it('rejects a code that is neither built-in in its category nor CUSTOM_<id>', () => {
    const misplaced = record({ category: 'TURNOVER', code: 'GOOD_SHOT' });
    assert.strictEqual(ChartCodeRecordSchema.safeParse(misplaced).success, false);
    const unknown = record({ category: 'TURNOVER', code: 'WHATEVER' });
    assert.strictEqual(ChartCodeRecordSchema.safeParse(unknown).success, false);
  });

  it('rejects an unknown tone and a negative or fractional order', () => {
    assert.strictEqual(ChartCodeRecordSchema.safeParse({ ...valid, tone: 'BLUE' }).success, false);
    assert.strictEqual(ChartCodeRecordSchema.safeParse({ ...valid, order: -1 }).success, false);
    assert.strictEqual(ChartCodeRecordSchema.safeParse({ ...valid, order: 1.5 }).success, false);
  });
});

describe('resolveChartCatalog (S9)', () => {
  it('without records is the built-in catalog, active, not custom, ordered by catalog index', () => {
    const catalog = resolveChartCatalog([]);
    assert.deepStrictEqual(catalog, CHART_CATALOG);
    CHART_CATALOG.TURNOVER.forEach((code, index) => {
      assert.strictEqual(code.order, index);
      assert.strictEqual(code.archived, false);
      assert.strictEqual(code.custom, false);
    });
  });

  it('overrides a built-in code by category and code, leaving the same code of other categories', () => {
    const catalog = resolveChartCatalog([
      record({ category: 'DEFENSE', code: 'CUT', symbol: 'C', label: 'Corte rival', tone: 'POSITIVE', order: 11 }),
    ]);
    const cut = catalog.DEFENSE.find((code) => code.code === 'CUT');
    assert.deepStrictEqual(cut, {
      code: 'CUT',
      symbol: 'C',
      label: 'Corte rival',
      tone: 'POSITIVE',
      archived: false,
      custom: false,
      order: 11,
    });
    assert.deepStrictEqual(
      catalog.POINTS_ALLOWED.find((code) => code.code === 'CUT'),
      CHART_CATALOG.POINTS_ALLOWED.find((code) => code.code === 'CUT')
    );
    assert.strictEqual(catalog.DEFENSE.length, CHART_CATALOG.DEFENSE.length);
  });

  it('appends custom codes and sorts every code by order', () => {
    const catalog = resolveChartCatalog([
      record({ category: 'OFFENSE', code: 'CUSTOM_b', symbol: 'Z', label: 'Zona', tone: 'POSITIVE', order: 5 }),
      record({ category: 'OFFENSE', code: 'CUSTOM_a', symbol: 'TL', label: 'Tiro libre', tone: 'POSITIVE', order: 4 }),
      record({ category: 'OFFENSE', code: 'GOOD_SHOT', symbol: 'A', label: 'Buen lanzamiento', tone: 'POSITIVE', order: 6 }),
    ]);
    assert.deepStrictEqual(
      catalog.OFFENSE.map((code) => [code.code, code.order, code.custom]),
      [
        ['BAD_SHOT', 1, false],
        ['LAYUP', 2, false],
        ['FORCED_SHOT', 3, false],
        ['CUSTOM_a', 4, true],
        ['CUSTOM_b', 5, true],
        ['GOOD_SHOT', 6, false],
      ]
    );
  });

  it('breaks order ties with built-in codes first, then by code', () => {
    const catalog = resolveChartCatalog([
      record({ category: 'OFFENSE', code: 'CUSTOM_z', order: 0 }),
      record({ category: 'OFFENSE', code: 'CUSTOM_y', order: 0 }),
    ]);
    assert.deepStrictEqual(
      catalog.OFFENSE.slice(0, 3).map((code) => code.code),
      ['GOOD_SHOT', 'CUSTOM_y', 'CUSTOM_z']
    );
  });

  it('keeps archived codes resolvable but out of the active codes', () => {
    const catalog = resolveChartCatalog([
      record({ category: 'TURNOVER', code: 'OTHER', symbol: '?', label: 'Otra', archived: true, order: 8 }),
      record({ category: 'TURNOVER', code: 'CUSTOM_old', symbol: 'V', label: 'Vieja', archived: true, order: 9 }),
    ]);
    assert.strictEqual(findChartCode('TURNOVER', 'OTHER', catalog)?.archived, true);
    assert.strictEqual(findChartCode('TURNOVER', 'CUSTOM_old', catalog)?.label, 'Vieja');
    const active = activeChartCodes(catalog, 'TURNOVER').map((code) => code.code);
    assert.ok(!active.includes('OTHER'));
    assert.ok(!active.includes('CUSTOM_old'));
    assert.strictEqual(active.length, CHART_CATALOG.TURNOVER.length - 1);
  });
});

describe('findChartCode', () => {
  it('defaults to the built-in catalog', () => {
    assert.strictEqual(findChartCode('OFFENSE', 'GOOD_SHOT')?.symbol, 'A');
    assert.strictEqual(findChartCode('OFFENSE', 'CUSTOM_a'), undefined);
  });
});
