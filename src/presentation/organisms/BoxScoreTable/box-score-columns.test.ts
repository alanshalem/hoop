import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateMatchBoxScore } from '@/core/domain/rules/match-derivations';
import { makeEvent, makeMatch } from '@/core/testing/fixtures';
import { BOX_SCORE_COLUMNS, formatShootingPercentage } from './box-score-columns';

const match = makeMatch({
  rosterOwnPlayerIds: ['p1', 'p2', 'p3'],
  events: [
    makeEvent({ type: 'FT_MADE', playerId: 'p1' }),
    makeEvent({ type: 'FT_MISS', playerId: 'p1' }),
    makeEvent({ type: 'FG2_MADE', playerId: 'p1' }),
    makeEvent({ type: 'FG2_MADE', playerId: 'p2' }),
    makeEvent({ type: 'FG2_MISS', playerId: 'p2' }),
    makeEvent({ type: 'FG3_MADE', playerId: 'p2' }),
    makeEvent({ type: 'FG3_MISS', playerId: 'p1' }),
    makeEvent({ type: 'DREB', playerId: 'p1' }),
    makeEvent({ type: 'FG3_MADE', isOwnTeam: false }),
    makeEvent({ type: 'FT_MISS', isOwnTeam: false }),
    makeEvent({ type: 'FG2_MISS', isOwnTeam: false }),
  ],
});
const box = calculateMatchBoxScore(match);
const valuesOf = (line: Parameters<(typeof BOX_SCORE_COLUMNS)[number]['value']>[0]) =>
  BOX_SCORE_COLUMNS.map((column) => column.value(line));

describe('box score columns', () => {
  it('shows points, made/attempted and percentage of each shot type and field goals, with Spanish titles', () => {
    assert.deepStrictEqual(
      BOX_SCORE_COLUMNS.map(({ label, title }) => ({ label, title })),
      [
        { label: 'PTS', title: 'Puntos' },
        { label: 'TL', title: 'Tiros libres convertidos/intentados' },
        { label: 'TL%', title: 'Porcentaje de tiros libres' },
        { label: '2P', title: 'Dobles convertidos/intentados' },
        { label: '2P%', title: 'Porcentaje de dobles' },
        { label: '3P', title: 'Triples convertidos/intentados' },
        { label: '3P%', title: 'Porcentaje de triples' },
        { label: 'TC', title: 'Tiros de campo convertidos/intentados' },
        { label: 'TC%', title: 'Porcentaje de tiros de campo' },
      ]
    );
  });

  it('reads points, made/attempted and percentages of each player, counting misses as attempts', () => {
    assert.deepStrictEqual(valuesOf(box.players.p1), [3, '1/2', '50%', '1/1', '100%', '0/1', '0%', '1/2', '50%']);
    assert.deepStrictEqual(valuesOf(box.players.p2), [5, '0/0', '—', '1/2', '50%', '1/1', '100%', '2/3', '66,7%']);
  });

  it('shows a dash as the percentage of a player without attempts', () => {
    assert.deepStrictEqual(valuesOf(box.players.p3), [0, '0/0', '—', '0/0', '—', '0/0', '—', '0/0', '—']);
  });

  it('reads the own team total, without the rival plays', () => {
    assert.deepStrictEqual(valuesOf(box.teamTotal), [8, '1/2', '50%', '2/3', '66,7%', '1/2', '50%', '3/5', '60%']);
  });
});

describe('formatShootingPercentage', () => {
  it('uses a decimal comma, drops a trailing ",0" and shows a dash without attempts', () => {
    assert.strictEqual(formatShootingPercentage(1, 2), '50%');
    assert.strictEqual(formatShootingPercentage(1, 3), '33,3%');
    assert.strictEqual(formatShootingPercentage(2, 3), '66,7%');
    assert.strictEqual(formatShootingPercentage(0, 4), '0%');
    assert.strictEqual(formatShootingPercentage(0, 0), '—');
  });
});
