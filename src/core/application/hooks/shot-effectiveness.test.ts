import { describe, it } from 'node:test';
import assert from 'node:assert';
import { makeEvent } from '@/core/testing/fixtures';
import { calculateShotEffectiveness, selectOwnShots } from './shot-effectiveness';

const events = [
  makeEvent({ type: 'FG2_MADE', playerId: 'p1', quarter: 'Q1' }),
  makeEvent({ type: 'FG2_MISS', playerId: 'p1', quarter: 'Q2' }),
  makeEvent({ type: 'FG3_MADE', playerId: 'p2', quarter: 'Q2' }),
  makeEvent({ type: 'FG3_MISS', playerId: 'p2', quarter: 'Q2' }),
  makeEvent({ type: 'FG3_MISS', playerId: 'p1', quarter: 'OT1' }),
  makeEvent({ type: 'FT_MADE', playerId: 'p1', quarter: 'Q1' }),
  makeEvent({ type: 'DREB', playerId: 'p2', quarter: 'Q1' }),
  makeEvent({ type: 'FG2_MADE', isOwnTeam: false, quarter: 'Q1' }),
];

describe('selectOwnShots', () => {
  it('keeps only own-team field goal attempts when no filter is given', () => {
    const shots = selectOwnShots(events);
    assert.deepStrictEqual(
      shots.map((e) => e.type),
      ['FG2_MADE', 'FG2_MISS', 'FG3_MADE', 'FG3_MISS', 'FG3_MISS']
    );
  });

  it('filters by period', () => {
    const shots = selectOwnShots(events, { quarter: 'Q2', playerId: 'ALL' });
    assert.strictEqual(shots.length, 3);
    assert.ok(shots.every((e) => e.quarter === 'Q2'));
  });

  it('filters by player and period together', () => {
    const shots = selectOwnShots(events, { quarter: 'OT1', playerId: 'p1' });
    assert.deepStrictEqual(
      shots.map((e) => e.type),
      ['FG3_MISS']
    );
  });
});

describe('calculateShotEffectiveness', () => {
  it('splits made/attempted and percentage by zone (2P, 3P, total)', () => {
    const result = calculateShotEffectiveness(selectOwnShots(events));
    assert.deepStrictEqual(result.fg2, { made: 1, attempted: 2, percentage: 50 });
    assert.deepStrictEqual(result.fg3, { made: 1, attempted: 3, percentage: 33.3 });
    assert.deepStrictEqual(result.total, { made: 2, attempted: 5, percentage: 40 });
  });

  it('ignores non field goal events and returns zeros for an empty list', () => {
    const result = calculateShotEffectiveness([makeEvent({ type: 'FT_MADE' })]);
    assert.deepStrictEqual(result.total, { made: 0, attempted: 0, percentage: 0 });
    assert.deepStrictEqual(calculateShotEffectiveness([]).fg2, { made: 0, attempted: 0, percentage: 0 });
  });
});
