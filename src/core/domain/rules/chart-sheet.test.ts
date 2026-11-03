import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CHART_CATALOG, findChartCode, type ChartCodeRecord } from '../entities/chart.types';
import { resolveChartCatalog } from './chart-catalog';
import { buildChartSheet, isChartEvent, summarizeChartByPlayer } from './chart-sheet';
import { calculateMatchBoxScore, deriveScoreboard } from './match-derivations';
import { makeEvent, makeMatch } from '@/core/testing/fixtures';
import { PlayByPlayEventSchema } from '../entities/match.types';

const chart = (
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'OT1',
  category: 'TURNOVER' | 'POINTS_ALLOWED' | 'OFFENSE' | 'DEFENSE',
  code: string,
  playerId?: string,
  points?: 1 | 2 | 3
) => makeEvent({ quarter, type: 'CHART', playerId, chart: { category, code, points } });

describe('chart catalog', () => {
  it('covers the four sheet categories with unique codes and a tone each', () => {
    assert.deepStrictEqual(Object.keys(CHART_CATALOG), ['TURNOVER', 'POINTS_ALLOWED', 'OFFENSE', 'DEFENSE']);
    for (const codes of Object.values(CHART_CATALOG)) {
      assert.ok(codes.length > 0);
      assert.strictEqual(new Set(codes.map((c) => c.code)).size, codes.length);
      for (const c of codes) assert.ok(c.tone === 'POSITIVE' || c.tone === 'NEGATIVE');
    }
  });

  it('includes the FIBA turnover types used on the paper sheet', () => {
    const turnovers = CHART_CATALOG.TURNOVER.map((c) => c.code);
    for (const code of ['BAD_PASS', 'TRAVELLING', 'DOUBLE_DRIBBLE', 'BALL_HANDLING', 'OFFENSIVE_FOUL']) {
      assert.ok(turnovers.includes(code), code);
    }
  });

  it('finds a code only inside its own category', () => {
    assert.strictEqual(findChartCode('OFFENSE', 'GOOD_SHOT')?.symbol, 'A');
    assert.strictEqual(findChartCode('TURNOVER', 'GOOD_SHOT'), undefined);
  });
});

describe('buildChartSheet', () => {
  it('groups entries by category and quarter with counts, points and code counts', () => {
    const events = [
      chart('Q1', 'TURNOVER', 'BAD_PASS', 'p1'),
      chart('Q1', 'TURNOVER', 'TRAVELLING', 'p2'),
      chart('Q1', 'POINTS_ALLOWED', 'NO_CLOSEOUT', 'p1', 3),
      chart('Q2', 'POINTS_ALLOWED', 'CUT', 'p3', 2),
      chart('Q2', 'OFFENSE', 'GOOD_SHOT', 'p1'),
      chart('Q2', 'OFFENSE', 'GOOD_SHOT', 'p2'),
      chart('Q3', 'OFFENSE', 'FORCED_SHOT', 'p2'),
      makeEvent({ quarter: 'Q1', type: 'FG2_MADE' }),
    ];
    const sheet = buildChartSheet(events);
    assert.deepStrictEqual(sheet.periods, ['Q1', 'Q2', 'Q3', 'Q4']);

    const turnovers = sheet.rows.find((r) => r.category === 'TURNOVER')!;
    assert.strictEqual(turnovers.cells.Q1.count, 2);
    assert.deepStrictEqual(turnovers.cells.Q1.entries.map((e) => e.code), ['BAD_PASS', 'TRAVELLING']);
    assert.strictEqual(turnovers.cells.Q2.count, 0);
    assert.deepStrictEqual(turnovers.firstHalf, { count: 2, points: 0 });
    assert.deepStrictEqual(turnovers.total, { count: 2, points: 0 });

    const allowed = sheet.rows.find((r) => r.category === 'POINTS_ALLOWED')!;
    assert.strictEqual(allowed.cells.Q1.points, 3);
    assert.strictEqual(allowed.cells.Q2.points, 2);
    assert.deepStrictEqual(allowed.firstHalf, { count: 2, points: 5 });
    assert.deepStrictEqual(allowed.secondHalf, { count: 0, points: 0 });

    const offense = sheet.rows.find((r) => r.category === 'OFFENSE')!;
    assert.deepStrictEqual(offense.cells.Q2.codeCounts, { GOOD_SHOT: 2 });
    assert.deepStrictEqual(offense.secondHalf, { count: 1, points: 0 });
  });

  it('adds an overtime column only when it has entries and counts it in the second half', () => {
    const sheet = buildChartSheet([chart('OT1', 'DEFENSE', 'STEAL', 'p1')]);
    assert.deepStrictEqual(sheet.periods, ['Q1', 'Q2', 'Q3', 'Q4', 'OT1']);
    const defense = sheet.rows.find((r) => r.category === 'DEFENSE')!;
    assert.deepStrictEqual(defense.secondHalf, { count: 1, points: 0 });
  });

  it('ignores chart events without chart data', () => {
    const sheet = buildChartSheet([makeEvent({ type: 'CHART' })]);
    assert.ok(sheet.rows.every((r) => r.total.count === 0));
  });
});

describe('summarizeChartByPlayer', () => {
  it('counts entries per category, tone and points allowed per player', () => {
    const summary = summarizeChartByPlayer([
      chart('Q1', 'TURNOVER', 'BAD_PASS', 'p1'),
      chart('Q1', 'POINTS_ALLOWED', 'CUT', 'p1', 3),
      chart('Q2', 'DEFENSE', 'STEAL', 'p1'),
      chart('Q2', 'DEFENSE', 'HELP', undefined),
    ]);
    assert.deepStrictEqual(summary.get('p1'), {
      byCategory: { TURNOVER: 1, POINTS_ALLOWED: 1, OFFENSE: 0, DEFENSE: 1 },
      positive: 1,
      negative: 2,
      pointsAllowed: 3,
    });
    assert.strictEqual(summary.get('TEAM')?.positive, 1);
  });

  it('takes the tone from the club catalog: renamed tones and custom codes count (S9)', () => {
    const record = (code: string, tone: 'POSITIVE' | 'NEGATIVE', archived = false): ChartCodeRecord => ({
      id: `club-1:OFFENSE:${code}`,
      clubId: 'club-1',
      category: 'OFFENSE',
      code,
      symbol: 'X',
      label: 'Propio',
      tone,
      archived,
      order: 10,
    });
    const catalog = resolveChartCatalog([
      record('FORCED_SHOT', 'POSITIVE'),
      record('CUSTOM_a', 'POSITIVE'),
      record('CUSTOM_b', 'NEGATIVE', true),
    ]);
    const events = [
      chart('Q1', 'OFFENSE', 'FORCED_SHOT', 'p1'),
      chart('Q1', 'OFFENSE', 'CUSTOM_a', 'p1'),
      chart('Q2', 'OFFENSE', 'CUSTOM_b', 'p1'),
    ];

    const club = summarizeChartByPlayer(events, catalog).get('p1');
    assert.strictEqual(club?.positive, 2);
    assert.strictEqual(club?.negative, 1);

    // Without the club catalog the built-in tone applies and unknown codes count for neither.
    const builtIn = summarizeChartByPlayer(events).get('p1');
    assert.strictEqual(builtIn?.positive, 0);
    assert.strictEqual(builtIn?.negative, 1);
    assert.strictEqual(builtIn?.byCategory.OFFENSE, 3);
  });
});

describe('chart events and statistics', () => {
  it('never change the scoreboard, fouls or box score', () => {
    const base = makeMatch({ events: [makeEvent({ type: 'FG2_MADE', playerId: 'p1' })] });
    const withChart = makeMatch({
      events: [...base.events, chart('Q1', 'POINTS_ALLOWED', 'CUT', 'p1', 3), chart('Q1', 'TURNOVER', 'BAD_PASS', 'p1')],
    });
    assert.deepStrictEqual(deriveScoreboard(withChart), deriveScoreboard(base));
    assert.deepStrictEqual(calculateMatchBoxScore(withChart), calculateMatchBoxScore(base));
    assert.ok(isChartEvent(withChart.events[1]));
    assert.ok(!isChartEvent(withChart.events[0]));
  });
});

describe('chart events and sync', () => {
  it('pass the play-by-play schema used by the sync API and the server', () => {
    const event = chart('Q2', 'POINTS_ALLOWED', 'CUT', 'p1', 3);
    assert.deepStrictEqual(PlayByPlayEventSchema.parse(event), event);
    assert.strictEqual(
      PlayByPlayEventSchema.safeParse({ ...event, chart: { category: 'NOPE', code: 'CUT' } }).success,
      false
    );
  });
});
