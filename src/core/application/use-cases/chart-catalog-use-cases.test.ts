import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CHART_CATALOG, chartCodeRecordId, type ChartCodeRecord } from '@/core/domain/entities/chart.types';
import { activeChartCodes, resolveChartCatalog } from '@/core/domain/rules/chart-catalog';
import { createChartCode, setChartCodeArchived, updateChartCode } from './chart-catalog-use-cases';

const CLUB = 'club-1';
const ctx = { clubId: CLUB };

function expectOk<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  assert.strictEqual(result.ok, true, JSON.stringify(result));
  return result as Extract<T, { ok: true }>;
}

const existing: ChartCodeRecord = {
  id: chartCodeRecordId(CLUB, 'OFFENSE', 'CUSTOM_a'),
  clubId: CLUB,
  category: 'OFFENSE',
  code: 'CUSTOM_a',
  symbol: 'TL',
  label: 'Tiro libre',
  tone: 'POSITIVE',
  archived: false,
  order: 4,
};

describe('createChartCode (S9)', () => {
  it('adds a custom code CUSTOM_<id> after the last code of its category, with trimmed text', () => {
    const records = [existing];
    const result = expectOk(
      createChartCode(records, { category: 'OFFENSE', symbol: ' Z ', label: '  Zona press ', tone: 'NEGATIVE' }, {
        ...ctx,
        id: 'b1',
      })
    );
    assert.strictEqual(result.code, 'CUSTOM_b1');
    assert.deepStrictEqual(result.chartCodes, [
      existing,
      {
        id: 'club-1:OFFENSE:CUSTOM_b1',
        clubId: CLUB,
        category: 'OFFENSE',
        code: 'CUSTOM_b1',
        symbol: 'Z',
        label: 'Zona press',
        tone: 'NEGATIVE',
        archived: false,
        order: 5,
      },
    ]);
    assert.strictEqual(result.chartCodes[0], existing);
    const offense = resolveChartCatalog(result.chartCodes).OFFENSE;
    assert.strictEqual(offense.at(-1)?.code, 'CUSTOM_b1');
  });

  it('orders a first custom code after the built-in codes', () => {
    const result = expectOk(
      createChartCode([], { category: 'TURNOVER', symbol: 'Z', label: 'Zona', tone: 'NEGATIVE' }, { ...ctx, id: 'x' })
    );
    assert.strictEqual(result.chartCodes[0].order, CHART_CATALOG.TURNOVER.length);
  });

  it('refuses a symbol outside 1-3 chars or a label outside 1-40 chars and leaves the records unchanged', () => {
    const records = [existing];
    const cases: [string, string, string][] = [
      ['', 'Zona', 'INVALID_SYMBOL'],
      ['   ', 'Zona', 'INVALID_SYMBOL'],
      ['ABCD', 'Zona', 'INVALID_SYMBOL'],
      ['Z', '', 'INVALID_LABEL'],
      ['Z', '   ', 'INVALID_LABEL'],
      ['Z', 'x'.repeat(41), 'INVALID_LABEL'],
    ];
    for (const [symbol, label, reason] of cases) {
      assert.deepStrictEqual(
        createChartCode(records, { category: 'OFFENSE', symbol, label, tone: 'POSITIVE' }, { ...ctx, id: 'b1' }),
        { ok: false, reason },
        `${symbol}/${label}`
      );
    }
    assert.deepStrictEqual(records, [existing]);
  });

  it('accepts the limits: 3-char symbol and 40-char label', () => {
    const label = 'x'.repeat(40);
    const result = expectOk(
      createChartCode([], { category: 'OFFENSE', symbol: 'ABC', label, tone: 'POSITIVE' }, { ...ctx, id: 'b1' })
    );
    assert.strictEqual(result.chartCodes[0].symbol, 'ABC');
    assert.strictEqual(result.chartCodes[0].label, label);
  });
});

describe('updateChartCode (S9)', () => {
  it('creates the override of a built-in code, keeping what was not changed', () => {
    const result = expectOk(updateChartCode([], 'TURNOVER', 'BAD_PASS', { label: ' Pase errado ' }, ctx));
    assert.deepStrictEqual(result.chartCodes, [
      {
        id: 'club-1:TURNOVER:BAD_PASS',
        clubId: CLUB,
        category: 'TURNOVER',
        code: 'BAD_PASS',
        symbol: 'P',
        label: 'Pase errado',
        tone: 'NEGATIVE',
        archived: false,
        order: 0,
      },
    ]);
  });

  it('replaces an existing record and keeps the other records untouched', () => {
    const other = { ...existing, id: chartCodeRecordId(CLUB, 'DEFENSE', 'STEAL'), category: 'DEFENSE' as const, code: 'STEAL' };
    const records = [other, existing];
    const result = expectOk(updateChartCode(records, 'OFFENSE', 'CUSTOM_a', { symbol: 'T', tone: 'NEGATIVE' }, ctx));
    assert.strictEqual(result.chartCodes[0], other);
    assert.deepStrictEqual(result.chartCodes[1], { ...existing, symbol: 'T', tone: 'NEGATIVE' });
    assert.strictEqual(result.chartCodes.length, 2);
  });

  it('refuses an unknown code or a code of another category, and invalid text, leaving records unchanged', () => {
    const records = [existing];
    assert.deepStrictEqual(updateChartCode(records, 'OFFENSE', 'CUSTOM_missing', { label: 'X' }, ctx), {
      ok: false,
      reason: 'CHART_CODE_NOT_FOUND',
    });
    assert.deepStrictEqual(updateChartCode(records, 'TURNOVER', 'GOOD_SHOT', { label: 'X' }, ctx), {
      ok: false,
      reason: 'CHART_CODE_NOT_FOUND',
    });
    assert.deepStrictEqual(updateChartCode(records, 'OFFENSE', 'CUSTOM_a', { symbol: 'ABCD' }, ctx), {
      ok: false,
      reason: 'INVALID_SYMBOL',
    });
    assert.deepStrictEqual(updateChartCode(records, 'OFFENSE', 'CUSTOM_a', { label: ' ' }, ctx), {
      ok: false,
      reason: 'INVALID_LABEL',
    });
    assert.deepStrictEqual(records, [existing]);
  });
});

describe('setChartCodeArchived (S9)', () => {
  it('archives a built-in code: it leaves the active codes but still resolves', () => {
    const result = expectOk(setChartCodeArchived([], 'DEFENSE', 'BAD_FOUL', true, ctx));
    assert.strictEqual(result.chartCodes[0].archived, true);
    const catalog = resolveChartCatalog(result.chartCodes);
    assert.ok(!activeChartCodes(catalog, 'DEFENSE').some((code) => code.code === 'BAD_FOUL'));
    assert.strictEqual(catalog.DEFENSE.find((code) => code.code === 'BAD_FOUL')?.label, 'Mal foul');
  });

  it('unarchives a custom code', () => {
    const archived = { ...existing, archived: true };
    const result = expectOk(setChartCodeArchived([archived], 'OFFENSE', 'CUSTOM_a', false, ctx));
    assert.deepStrictEqual(result.chartCodes, [existing]);
  });

  it('refuses an unknown code and leaves records unchanged', () => {
    const records = [existing];
    assert.deepStrictEqual(setChartCodeArchived(records, 'OFFENSE', 'CUSTOM_missing', true, ctx), {
      ok: false,
      reason: 'CHART_CODE_NOT_FOUND',
    });
    assert.deepStrictEqual(records, [existing]);
  });
});
