import { describe, it } from 'node:test';
import assert from 'node:assert';
import { makeEvent, makePlayer } from '@/core/testing/fixtures';
import type { ChartCategory, ChartCodeRecord, ChartPoints } from '@/core/domain/entities/chart.types';
import { resolveChartCatalog } from '@/core/domain/rules/chart-catalog';
import {
  buildChartSummaryRows,
  chartEntryTag,
  chartEntryTitle,
  chartEntryResult,
  formatChartPoints,
  formatCodeCounts,
} from './chart-sheet-view';

const chart = (category: ChartCategory, code: string, playerId?: string, points?: ChartPoints) =>
  makeEvent({ type: 'CHART', playerId, chart: { category, code, points } });

const ana = makePlayer({ id: 'p-ana', firstName: 'Ana', lastName: 'Gómez', dorsal: 7 });
const bea = makePlayer({ id: 'p-bea', firstName: 'Bea', lastName: 'Ruiz', dorsal: 12 });
const playersById = new Map([ana, bea].map((p) => [p.id, p]));

const record = (
  category: ChartCategory,
  code: string,
  fields: Pick<ChartCodeRecord, 'symbol' | 'label' | 'tone'> & { archived?: boolean; order: number }
): ChartCodeRecord => ({
  id: `club-1:${category}:${code}`,
  clubId: 'club-1',
  category,
  code,
  archived: false,
  ...fields,
});

// A club that renamed two built-in codes, added a custom one and archived another.
const clubCatalog = resolveChartCatalog([
  record('OFFENSE', 'GOOD_SHOT', { symbol: 'BL', label: 'Lanzamiento abierto', tone: 'POSITIVE', order: 0 }),
  record('TURNOVER', 'BAD_PASS', { symbol: 'PM', label: 'Pase perdido', tone: 'NEGATIVE', order: 0 }),
  record('OFFENSE', 'CUSTOM_p', { symbol: 'PT', label: 'Poste', tone: 'POSITIVE', order: 4 }),
  record('OFFENSE', 'FORCED_SHOT', { symbol: 'F', label: 'Forzado', tone: 'POSITIVE', archived: true, order: 3 }),
]);

describe('formatCodeCounts (S4)', () => {
  it('lists symbol=count in catalog order and skips missing codes', () => {
    assert.strictEqual(formatCodeCounts('OFFENSE', { FORCED_SHOT: 4, GOOD_SHOT: 1 }), 'A=1 F=4');
    assert.strictEqual(formatCodeCounts('OFFENSE', {}), '');
  });

  it('uses the club symbols, custom codes and archived codes of old entries (S9)', () => {
    assert.strictEqual(
      formatCodeCounts('OFFENSE', { CUSTOM_p: 2, FORCED_SHOT: 4, GOOD_SHOT: 1 }, clubCatalog),
      'BL=1 F=4 PT=2'
    );
  });
});

describe('chartEntryTag (S4)', () => {
  it('shows the jersey number, EQ for team entries and #? for unknown players', () => {
    assert.strictEqual(chartEntryTag('p-ana', playersById), '#7');
    assert.strictEqual(chartEntryTag(undefined, playersById), 'EQ');
    assert.strictEqual(chartEntryTag('p-gone', playersById), '#?');
  });
});

describe('chartEntryTitle (S4)', () => {
  it('spells the code label, player, points and clock', () => {
    assert.strictEqual(
      chartEntryTitle('TURNOVER', { eventId: 'e1', playerId: 'p-ana', code: 'BAD_PASS', gameClockFormatted: '05:32' }, playersById),
      'Pase malo · #7 Ana Gómez · 05:32'
    );
    assert.strictEqual(
      chartEntryTitle('POINTS_ALLOWED', { eventId: 'e2', code: 'CUT', points: 3, gameClockFormatted: '01:10' }, playersById),
      'Corte (3 pts) · Equipo · 01:10'
    );
  });

  it('spells the club label of renamed and custom codes (S9)', () => {
    assert.strictEqual(
      chartEntryTitle('TURNOVER', { eventId: 'e1', playerId: 'p-ana', code: 'BAD_PASS' }, playersById, clubCatalog),
      'Pase perdido · #7 Ana Gómez'
    );
    assert.strictEqual(
      chartEntryTitle('OFFENSE', { eventId: 'e2', code: 'CUSTOM_p', gameClockFormatted: '02:00' }, playersById, clubCatalog),
      'Poste · Equipo · 02:00'
    );
    assert.strictEqual(
      chartEntryTitle('OFFENSE', { eventId: 'e3', code: 'CUSTOM_gone' }, playersById, clubCatalog),
      'CUSTOM_gone · Equipo'
    );
  });
});

describe('formatChartPoints (S4)', () => {
  it('pluralizes points', () => {
    assert.strictEqual(formatChartPoints(1), '1 pt');
    assert.strictEqual(formatChartPoints(13), '13 pts');
  });
});

describe('buildChartSummaryRows (S4)', () => {
  it('sorts players by negative entries and appends the team row last', () => {
    const rows = buildChartSummaryRows(
      [
        chart('OFFENSE', 'GOOD_SHOT', 'p-ana'),
        chart('TURNOVER', 'BAD_PASS', 'p-bea'),
        chart('POINTS_ALLOWED', 'CUT', 'p-bea', 3),
        chart('DEFENSE', 'HELP'),
        makeEvent({ type: 'FG2_MADE', playerId: 'p-ana' }),
      ],
      [ana, bea]
    );
    assert.deepStrictEqual(
      rows.map((row) => [row.key, row.dorsal, row.name, row.summary.negative, row.summary.positive]),
      [
        ['p-bea', 12, 'Bea Ruiz', 2, 0],
        ['p-ana', 7, 'Ana Gómez', 0, 1],
        ['TEAM', undefined, 'Equipo', 0, 1],
      ]
    );
    assert.strictEqual(rows[0].summary.pointsAllowed, 3);
  });

  it('breaks ties by jersey number and omits the team row without team entries', () => {
    const rows = buildChartSummaryRows(
      [chart('TURNOVER', 'BAD_PASS', 'p-bea'), chart('TURNOVER', 'TRAVELLING', 'p-ana')],
      [bea, ana]
    );
    assert.deepStrictEqual(
      rows.map((row) => row.key),
      ['p-ana', 'p-bea']
    );
  });

  it('counts tones with the club catalog (S9)', () => {
    const rows = buildChartSummaryRows(
      [chart('OFFENSE', 'FORCED_SHOT', 'p-ana'), chart('OFFENSE', 'CUSTOM_p', 'p-ana')],
      [ana],
      clubCatalog
    );
    assert.deepStrictEqual(
      rows.map((row) => [row.key, row.summary.positive, row.summary.negative]),
      [['p-ana', 2, 0]]
    );
  });

  it('is empty when there are no chart entries', () => {
    assert.deepStrictEqual(buildChartSummaryRows([makeEvent({ type: 'FG2_MADE' })], [ana]), []);
  });
});

describe('offensive result on the sheet (S11)', () => {
  const playersById = new Map([['p-ana', makePlayer({ id: 'p-ana', dorsal: 9, firstName: 'Ana', lastName: 'Delfino' })]]);

  it('marks made actions with their points and missed ones with +0', () => {
    assert.strictEqual(chartEntryResult({ made: true, points: 3 }), '+3');
    assert.strictEqual(chartEntryResult({ made: false }), '+0');
    assert.strictEqual(chartEntryResult({ points: 2 }), '');
  });

  it('describes the result in the entry title', () => {
    assert.strictEqual(
      chartEntryTitle('OFFENSE', { eventId: 'e1', playerId: 'p-ana', code: 'BAD_SHOT', made: true, points: 3, gameClockFormatted: '04:10' }, playersById),
      'Mal lanzamiento (convirtió, 3 pts) · #9 Ana Delfino · 04:10'
    );
    assert.strictEqual(
      chartEntryTitle('OFFENSE', { eventId: 'e2', code: 'GOOD_SHOT', made: false }, playersById),
      'Buen lanzamiento (no convirtió) · Equipo'
    );
  });
});
