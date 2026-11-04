import { describe, it } from 'node:test';
import assert from 'node:assert';
import { makeEvent, makePlayer, makeRivalTeam } from '@/core/testing/fixtures';
import type { ChartEntry } from '@/core/domain/entities/chart.types';
import {
  buildRecentEntries,
  chartOutcome,
  ownPlayerTag,
  rivalStepTitle,
} from './recent-entry-view';

const garino = makePlayer({ id: 'p-garino', dorsal: 29, firstName: 'Patricio', lastName: 'Garino' });
const playersById = new Map([[garino.id, garino]]);
const rivalById = new Map(makeRivalTeam().players.map((player) => [player.id, player]));

const chart = (entry: ChartEntry, fields: Parameters<typeof makeEvent>[0] = {}) =>
  makeEvent({ type: 'CHART', chart: entry, quarter: 'Q2', gameClockFormatted: '05:32', ...fields });

describe('ownPlayerTag (S14)', () => {
  it('shows the jersey and the full last name, Equipo for team entries, #? for unknown players', () => {
    assert.strictEqual(ownPlayerTag('p-garino', playersById), '#29 Garino');
    assert.strictEqual(ownPlayerTag(undefined, playersById), 'Equipo');
    assert.strictEqual(ownPlayerTag('p-gone', playersById), '#?');
  });
});

describe('chartOutcome (S11, S14)', () => {
  it('shows made points, a missed action and points allowed', () => {
    assert.deepStrictEqual(chartOutcome({ category: 'OFFENSE', code: 'GOOD_SHOT', made: true, points: 2 }), {
      text: '+2',
      tone: 'made',
    });
    assert.deepStrictEqual(chartOutcome({ category: 'OFFENSE', code: 'BAD_SHOT', made: false }), {
      text: 'no convirtió',
      tone: 'missed',
    });
    assert.deepStrictEqual(chartOutcome({ category: 'POINTS_ALLOWED', code: 'CUT', points: 3 }), {
      text: '3 pts',
      tone: 'allowed',
    });
    assert.deepStrictEqual(chartOutcome({ category: 'POINTS_ALLOWED', code: 'CUT', points: 1 }), {
      text: '1 pt',
      tone: 'allowed',
    });
  });

  it('has no outcome for turnovers and defensive actions', () => {
    assert.strictEqual(chartOutcome({ category: 'TURNOVER', code: 'BAD_PASS' }), undefined);
    assert.strictEqual(chartOutcome({ category: 'DEFENSE', code: 'HELP' }), undefined);
  });
});

describe('rivalStepTitle (S14)', () => {
  it('asks who scored on points allowed and the defender on offensive actions only', () => {
    assert.strictEqual(rivalStepTitle('POINTS_ALLOWED'), '¿Quién convirtió?');
    assert.strictEqual(rivalStepTitle('OFFENSE'), 'Defensor rival');
    assert.strictEqual(rivalStepTitle('TURNOVER'), null);
    assert.strictEqual(rivalStepTitle('DEFENSE'), null);
  });
});

describe('buildRecentEntries (S14)', () => {
  it('lists the latest chart entries first with period, clock, player, code, outcome and category', () => {
    const turnover = chart({ category: 'TURNOVER', code: 'BAD_PASS' }, { playerId: 'p-garino', quarter: 'Q1', gameClockFormatted: '09:10' });
    const offense = chart({ category: 'OFFENSE', code: 'GOOD_SHOT', made: true, points: 3 }, { playerId: 'p-garino' });
    const entries = buildRecentEntries([turnover, makeEvent({ type: 'FG2_MADE' }), offense], {
      playersById,
      rivalById,
    });
    assert.deepStrictEqual(entries, [
      {
        id: offense.id,
        clock: '2C 05:32',
        player: '#29 Garino',
        symbol: 'A',
        label: 'Buen lanzamiento',
        tone: 'POSITIVE',
        outcome: { text: '+3', tone: 'made' },
        category: 'Acciones ofensivas',
        rival: undefined,
      },
      {
        id: turnover.id,
        clock: '1C 09:10',
        player: '#29 Garino',
        symbol: 'P',
        label: 'Pase malo',
        tone: 'NEGATIVE',
        outcome: undefined,
        category: 'Pérdidas',
        rival: undefined,
      },
    ]);
  });

  it('shows the rival player only when recorded: scorer on points allowed, defender on offense', () => {
    const allowed = chart({ category: 'POINTS_ALLOWED', code: 'CUT', points: 2, rivalPlayerId: 'rp-1' });
    const offense = chart({ category: 'OFFENSE', code: 'BAD_SHOT', made: false, rivalPlayerId: 'rp-2' }, { playerId: 'p-garino' });
    const gone = chart({ category: 'OFFENSE', code: 'BAD_SHOT', made: false, rivalPlayerId: 'rp-gone' });
    const plain = chart({ category: 'POINTS_ALLOWED', code: 'CUT', points: 2 });
    const entries = buildRecentEntries([allowed, offense, gone, plain], { playersById, rivalById });
    assert.deepStrictEqual(
      entries.map((entry) => [entry.player, entry.rival]),
      [
        ['Equipo', undefined],
        ['Equipo', 'vs #?'],
        ['#29 Garino', 'vs #11 García'],
        ['Equipo', 'convirtió #5 Pérez'],
      ]
    );
  });

  it('keeps only the last `limit` entries and falls back to the code id for unknown codes', () => {
    const events = [1, 2, 3, 4, 5, 6].map(() => chart({ category: 'DEFENSE', code: 'HELP' }));
    events.push(chart({ category: 'DEFENSE', code: 'CUSTOM_gone' }));
    const entries = buildRecentEntries(events, { playersById, rivalById, limit: 5 });
    assert.strictEqual(entries.length, 5);
    assert.deepStrictEqual(
      [entries[0].symbol, entries[0].label, entries[0].tone],
      ['CUSTOM_gone', 'CUSTOM_gone', undefined]
    );
    assert.strictEqual(entries[4].id, events[2].id);
  });
});
