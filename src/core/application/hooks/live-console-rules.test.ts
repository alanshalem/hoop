import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getPeriodEndAction, getSelectableQuarters } from './live-console-rules';

describe('getSelectableQuarters', () => {
  it('offers only regulation quarters before the 4th quarter', () => {
    assert.deepStrictEqual(getSelectableQuarters('Q1'), ['Q1', 'Q2', 'Q3', 'Q4']);
    assert.deepStrictEqual(getSelectableQuarters('Q3'), ['Q1', 'Q2', 'Q3', 'Q4']);
  });

  it('unlocks overtimes one at a time from the 4th quarter on', () => {
    assert.deepStrictEqual(getSelectableQuarters('Q4'), ['Q1', 'Q2', 'Q3', 'Q4', 'OT1']);
    assert.deepStrictEqual(getSelectableQuarters('OT2'), ['Q1', 'Q2', 'Q3', 'Q4', 'OT1', 'OT2', 'OT3']);
    assert.deepStrictEqual(getSelectableQuarters('OT4'), [
      'Q1', 'Q2', 'Q3', 'Q4', 'OT1', 'OT2', 'OT3', 'OT4',
    ]);
  });
});

describe('getPeriodEndAction', () => {
  it('advances to the next quarter during regulation, even when tied', () => {
    assert.deepStrictEqual(getPeriodEndAction('Q1', { own: 10, rival: 10 }), { kind: 'ADVANCE', next: 'Q2' });
    assert.deepStrictEqual(getPeriodEndAction('Q3', { own: 50, rival: 40 }), { kind: 'ADVANCE', next: 'Q4' });
  });

  it('sends the end of the 2nd quarter to halftime', () => {
    assert.deepStrictEqual(getPeriodEndAction('Q2', { own: 30, rival: 30 }), { kind: 'HALFTIME' });
  });

  it('offers to finish after the 4th quarter or an overtime when not tied', () => {
    assert.deepStrictEqual(getPeriodEndAction('Q4', { own: 70, rival: 68 }), { kind: 'FINISH' });
    assert.deepStrictEqual(getPeriodEndAction('OT1', { own: 75, rival: 80 }), { kind: 'FINISH' });
  });

  it('goes to overtime when tied after the 4th quarter', () => {
    assert.deepStrictEqual(getPeriodEndAction('Q4', { own: 70, rival: 70 }), { kind: 'ADVANCE', next: 'OT1' });
    assert.deepStrictEqual(getPeriodEndAction('OT3', { own: 90, rival: 90 }), { kind: 'ADVANCE', next: 'OT4' });
  });

  it('has nothing to offer when tied after the last supported overtime', () => {
    assert.deepStrictEqual(getPeriodEndAction('OT4', { own: 99, rival: 99 }), { kind: 'NONE' });
  });
});
