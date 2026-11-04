import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ChartLabelSchema, ChartSymbolSchema } from '@/core/domain/entities/chart.types';
import {
  CHART_CODE_REFUSAL_MESSAGES,
  ChartCodeFormSchema,
  defaultChartTone,
  formatChartCodeCounts,
} from './chart-code-form';

const parse = (symbol: string, label: string) => ChartCodeFormSchema.safeParse({ symbol, label, tone: 'POSITIVE' });
const firstMessage = (symbol: string, label: string) => {
  const result = parse(symbol, label);
  return result.success ? null : result.error.issues[0]?.message;
};

describe('ChartCodeFormSchema (S9)', () => {
  it('trims and accepts symbols of 1 to 3 characters and names of 1 to 40', () => {
    const result = parse(' 1x1 ', `  ${'a'.repeat(40)} `);
    assert.ok(result.success);
    assert.strictEqual(result.data.symbol, '1x1');
    assert.strictEqual(result.data.label, 'a'.repeat(40));
  });

  it('refuses an empty or too long symbol with the Spanish message', () => {
    assert.strictEqual(firstMessage('   ', 'Poste'), 'El símbolo debe tener de 1 a 3 caracteres.');
    assert.strictEqual(firstMessage('ABCD', 'Poste'), 'El símbolo debe tener de 1 a 3 caracteres.');
  });

  it('refuses an empty or too long name with the Spanish message', () => {
    assert.strictEqual(firstMessage('PT', ''), 'El nombre debe tener de 1 a 40 caracteres.');
    assert.strictEqual(firstMessage('PT', 'a'.repeat(41)), 'El nombre debe tener de 1 a 40 caracteres.');
  });

  it('agrees with the use-case validation on every boundary', () => {
    for (const symbol of ['', ' ', 'A', ' AB ', 'ABC', 'ABCD']) {
      assert.strictEqual(parse(symbol, 'Poste').success, ChartSymbolSchema.safeParse(symbol).success, symbol);
    }
    for (const label of ['', '  ', 'P', 'a'.repeat(40), 'a'.repeat(41)]) {
      assert.strictEqual(parse('PT', label).success, ChartLabelSchema.safeParse(label).success, label);
    }
  });
});

describe('CHART_CODE_REFUSAL_MESSAGES (S9)', () => {
  it('spells every use-case refusal in Spanish', () => {
    assert.deepStrictEqual(CHART_CODE_REFUSAL_MESSAGES, {
      INVALID_SYMBOL: 'El símbolo debe tener de 1 a 3 caracteres.',
      INVALID_LABEL: 'El nombre debe tener de 1 a 40 caracteres.',
      CHART_CODE_NOT_FOUND: 'El código ya no está en el catálogo del club.',
    });
  });
});

describe('defaultChartTone (S9)', () => {
  it('starts red in the all-negative categories and blue in the others', () => {
    assert.strictEqual(defaultChartTone('TURNOVER'), 'NEGATIVE');
    assert.strictEqual(defaultChartTone('POINTS_ALLOWED'), 'NEGATIVE');
    assert.strictEqual(defaultChartTone('OFFENSE'), 'POSITIVE');
    assert.strictEqual(defaultChartTone('DEFENSE'), 'POSITIVE');
  });
});

describe('formatChartCodeCounts (S9)', () => {
  it('counts active codes and mentions archived ones only when present', () => {
    assert.strictEqual(formatChartCodeCounts(1, 0), '1 código');
    assert.strictEqual(formatChartCodeCounts(9, 0), '9 códigos');
    assert.strictEqual(formatChartCodeCounts(8, 1), '8 códigos · 1 archivado');
    assert.strictEqual(formatChartCodeCounts(0, 2), '0 códigos · 2 archivados');
  });
});
