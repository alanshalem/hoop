import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateMatchBoxScore } from '@/core/domain/rules/match-derivations';
import { makeEvent, makeMatch } from '@/core/testing/fixtures';
import { BOX_SCORE_COLUMNS } from './box-score-columns';

const match = makeMatch({
  rosterOwnPlayerIds: ['p1', 'p2'],
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
  ],
});
const box = calculateMatchBoxScore(match);
const valuesOf = (line: Parameters<(typeof BOX_SCORE_COLUMNS)[number]['value']>[0]) =>
  BOX_SCORE_COLUMNS.map((column) => column.value(line));

describe('box score columns (S2)', () => {
  it('shows only PTS, TL, 2P and 3P, with Spanish titles', () => {
    assert.deepStrictEqual(
      BOX_SCORE_COLUMNS.map(({ label, title }) => ({ label, title })),
      [
        { label: 'PTS', title: 'Puntos' },
        { label: 'TL', title: 'Tiros libres convertidos' },
        { label: '2P', title: 'Dobles convertidos' },
        { label: '3P', title: 'Triples convertidos' },
      ]
    );
  });

  it('reads points and made counts of each player, ignoring misses and other plays', () => {
    assert.deepStrictEqual(valuesOf(box.players.p1), [3, 1, 1, 0]);
    assert.deepStrictEqual(valuesOf(box.players.p2), [5, 0, 1, 1]);
  });

  it('reads the own team total, without the rival plays', () => {
    assert.deepStrictEqual(valuesOf(box.teamTotal), [8, 1, 2, 1]);
  });
});
