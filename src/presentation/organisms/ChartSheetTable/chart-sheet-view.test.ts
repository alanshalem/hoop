import { describe, it } from 'node:test';
import assert from 'node:assert';
import { makeEvent, makePlayer } from '@/core/testing/fixtures';
import type { ChartCategory, ChartPoints } from '@/core/domain/entities/chart.types';
import {
  buildChartSummaryRows,
  chartEntryTag,
  chartEntryTitle,
  formatChartPoints,
  formatCodeCounts,
} from './chart-sheet-view';

const chart = (category: ChartCategory, code: string, playerId?: string, points?: ChartPoints) =>
  makeEvent({ type: 'CHART', playerId, chart: { category, code, points } });

const ana = makePlayer({ id: 'p-ana', firstName: 'Ana', lastName: 'Gómez', dorsal: 7 });
const bea = makePlayer({ id: 'p-bea', firstName: 'Bea', lastName: 'Ruiz', dorsal: 12 });
const playersById = new Map([ana, bea].map((p) => [p.id, p]));

describe('formatCodeCounts (S4)', () => {
  it('lists symbol=count in catalog order and skips missing codes', () => {
    assert.strictEqual(formatCodeCounts('OFFENSE', { FORCED_SHOT: 4, GOOD_SHOT: 1 }), 'A=1 F=4');
    assert.strictEqual(formatCodeCounts('OFFENSE', {}), '');
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

  it('is empty when there are no chart entries', () => {
    assert.deepStrictEqual(buildChartSummaryRows([makeEvent({ type: 'FG2_MADE' })], [ana]), []);
  });
});
