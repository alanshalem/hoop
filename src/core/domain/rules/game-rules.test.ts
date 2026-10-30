import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  crossesHalftime,
  formatGameClock,
  getNextQuarter,
  getQuarterLengthSeconds,
} from './game-clock';
import {
  consumeTimeout,
  createInitialTimeouts,
  FIBA_LAST_TWO_MINUTES_MAX_TIMEOUTS,
  FIBA_LAST_TWO_MINUTES_SECONDS,
  getRemainingTimeouts,
  getTimeoutPeriod,
  isLastTwoMinutesOfFourthQuarter,
} from './timeouts';
import { FIBA_MAX_ROSTER, FIBA_STARTERS, validateLineup } from './lineup-rules';
import { can } from './permissions';
import { USER_ROLE_LABELS } from '../entities/club.types';

describe('Halftime boundary', () => {
  it('is crossed by any move from Q1/Q2 to a later half or overtime, and by nothing else', () => {
    assert.strictEqual(crossesHalftime('Q2', 'Q3'), true);
    assert.strictEqual(crossesHalftime('Q2', 'Q4'), true);
    assert.strictEqual(crossesHalftime('Q1', 'Q3'), true);
    assert.strictEqual(crossesHalftime('Q1', 'OT1'), true);
    assert.strictEqual(crossesHalftime('Q1', 'Q2'), false);
    assert.strictEqual(crossesHalftime('Q3', 'Q4'), false);
    assert.strictEqual(crossesHalftime('Q3', 'Q2'), false);
  });
});

describe('Game clock', () => {
  it('regulation quarters last 600s and overtimes 300s', () => {
    assert.strictEqual(getQuarterLengthSeconds('Q1'), 600);
    assert.strictEqual(getQuarterLengthSeconds('Q4'), 600);
    assert.strictEqual(getQuarterLengthSeconds('OT1'), 300);
    assert.strictEqual(getQuarterLengthSeconds('OT4'), 300);
  });

  it('getNextQuarter walks Q1..Q4, OT1..OT4 and returns null after the last period', () => {
    assert.strictEqual(getNextQuarter('Q1'), 'Q2');
    assert.strictEqual(getNextQuarter('Q4'), 'OT1');
    assert.strictEqual(getNextQuarter('OT3'), 'OT4');
    assert.strictEqual(getNextQuarter('OT4'), null);
  });

  it('formats seconds as MM:SS', () => {
    assert.strictEqual(formatGameClock(600), '10:00');
    assert.strictEqual(formatGameClock(428), '07:08');
    assert.strictEqual(formatGameClock(0), '00:00');
  });
});

describe('Timeouts (FIBA Art. 18)', () => {
  it('maps quarters to timeout periods', () => {
    assert.strictEqual(getTimeoutPeriod('Q1'), 'FIRST_HALF');
    assert.strictEqual(getTimeoutPeriod('Q2'), 'FIRST_HALF');
    assert.strictEqual(getTimeoutPeriod('Q3'), 'SECOND_HALF');
    assert.strictEqual(getTimeoutPeriod('Q4'), 'SECOND_HALF');
    assert.strictEqual(getTimeoutPeriod('OT2'), 'OVERTIME');
  });

  it('starts with 2 / 3 / 1 timeouts', () => {
    const t = createInitialTimeouts();
    assert.strictEqual(getRemainingTimeouts(t, 'Q1'), 2);
    assert.strictEqual(getRemainingTimeouts(t, 'Q3'), 3);
    assert.strictEqual(getRemainingTimeouts(t, 'OT1'), 1);
  });

  it('consumes a timeout from the period of the given quarter', () => {
    const result = consumeTimeout(createInitialTimeouts(), 'Q2');
    assert.deepStrictEqual(result, {
      ok: true,
      remaining: 1,
      timeouts: { firstHalfRemaining: 1, secondHalfRemaining: 3, overtimeRemaining: 1 },
    });
  });

  it('refuses when no timeouts remain in the period and leaves the input untouched', () => {
    const timeouts = { firstHalfRemaining: 0, secondHalfRemaining: 3, overtimeRemaining: 1 };
    const result = consumeTimeout(timeouts, 'Q1');
    assert.deepStrictEqual(result, { ok: false, reason: 'NO_TIMEOUTS_LEFT' });
    assert.deepStrictEqual(timeouts, {
      firstHalfRemaining: 0,
      secondHalfRemaining: 3,
      overtimeRemaining: 1,
    });
  });
});

describe('Timeouts: last 2 minutes of the 4th quarter (FIBA Art. 18.2.5)', () => {
  const fullSecondHalf = createInitialTimeouts();

  it('applies only to Q4 when the game clock shows 2:00 or less', () => {
    assert.strictEqual(FIBA_LAST_TWO_MINUTES_SECONDS, 120);
    assert.strictEqual(FIBA_LAST_TWO_MINUTES_MAX_TIMEOUTS, 2);
    assert.strictEqual(isLastTwoMinutesOfFourthQuarter('Q4', 120), true);
    assert.strictEqual(isLastTwoMinutesOfFourthQuarter('Q4', 0), true);
    assert.strictEqual(isLastTwoMinutesOfFourthQuarter('Q4', 121), false);
    assert.strictEqual(isLastTwoMinutesOfFourthQuarter('Q3', 60), false);
    assert.strictEqual(isLastTwoMinutesOfFourthQuarter('OT1', 60), false);
  });

  it('shows at most 2 usable timeouts when entering the last 2 minutes with 3 left', () => {
    assert.strictEqual(getRemainingTimeouts(fullSecondHalf, 'Q4', 121), 3);
    assert.strictEqual(getRemainingTimeouts(fullSecondHalf, 'Q4', 120), 2);
    assert.strictEqual(getRemainingTimeouts({ ...fullSecondHalf, secondHalfRemaining: 1 }, 'Q4', 30), 1);
    assert.strictEqual(getRemainingTimeouts(fullSecondHalf, 'Q3', 30), 3, 'Q3 is not restricted');
    assert.strictEqual(getRemainingTimeouts(fullSecondHalf, 'OT1', 30), 1, 'overtimes keep 1 each');
  });

  it('allows only 2 timeouts in the span: the third second-half timeout is forfeited', () => {
    const first = consumeTimeout(fullSecondHalf, 'Q4', 100);
    assert.deepStrictEqual(first, {
      ok: true,
      remaining: 1,
      timeouts: { firstHalfRemaining: 2, secondHalfRemaining: 1, overtimeRemaining: 1 },
    });
    if (!first.ok) throw new Error('expected ok');
    const second = consumeTimeout(first.timeouts, 'Q4', 40);
    assert.deepStrictEqual(second, {
      ok: true,
      remaining: 0,
      timeouts: { firstHalfRemaining: 2, secondHalfRemaining: 0, overtimeRemaining: 1 },
    });
    if (!second.ok) throw new Error('expected ok');
    assert.deepStrictEqual(consumeTimeout(second.timeouts, 'Q4', 10), { ok: false, reason: 'NO_TIMEOUTS_LEFT' });
  });

  it('keeps the regular count before 2:00 of the 4th quarter', () => {
    assert.deepStrictEqual(consumeTimeout(fullSecondHalf, 'Q4', 300), {
      ok: true,
      remaining: 2,
      timeouts: { firstHalfRemaining: 2, secondHalfRemaining: 2, overtimeRemaining: 1 },
    });
  });
});

describe('Lineup rules', () => {
  const roster = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('exposes FIBA limits', () => {
    assert.strictEqual(FIBA_STARTERS, 5);
    assert.strictEqual(FIBA_MAX_ROSTER, 12);
  });

  it('accepts 5 starters inside a valid roster', () => {
    assert.deepStrictEqual(validateLineup(roster, ['a', 'b', 'c', 'd', 'e']), []);
  });

  it('requires exactly 5 starters', () => {
    const codes = validateLineup(roster, ['a', 'b', 'c', 'd']).map((i) => i.code);
    assert.deepStrictEqual(codes, ['STARTERS_COUNT']);
  });

  it('requires starters to belong to the roster', () => {
    const codes = validateLineup(roster, ['a', 'b', 'c', 'd', 'z']).map((i) => i.code);
    assert.deepStrictEqual(codes, ['STARTER_NOT_IN_ROSTER']);
  });

  it('rejects rosters larger than 12 or smaller than 5', () => {
    const big = Array.from({ length: 13 }, (_, i) => `p${i}`);
    assert.deepStrictEqual(
      validateLineup(big, big.slice(0, 5)).map((i) => i.code),
      ['ROSTER_TOO_LARGE']
    );
    assert.deepStrictEqual(
      validateLineup(['a', 'b'], ['a', 'b']).map((i) => i.code),
      ['ROSTER_TOO_SMALL', 'STARTERS_COUNT']
    );
  });

  it('every issue carries a Spanish message', () => {
    for (const issue of validateLineup([], [])) {
      assert.ok(issue.message.length > 0);
    }
  });
});

describe('Permissions', () => {
  it('ADMIN can do everything', () => {
    for (const p of [
      'MANAGE_DIVISIONS',
      'MANAGE_PLAYERS',
      'MANAGE_MATCHES',
      'MANAGE_LINEUP',
      'RECORD_LIVE',
    ] as const) {
      assert.strictEqual(can('ADMIN', p), true, p);
    }
  });

  it('HEAD_COACH can do everything except managing divisions', () => {
    assert.strictEqual(can('HEAD_COACH', 'MANAGE_DIVISIONS'), false);
    assert.strictEqual(can('HEAD_COACH', 'MANAGE_PLAYERS'), true);
    assert.strictEqual(can('HEAD_COACH', 'MANAGE_MATCHES'), true);
    assert.strictEqual(can('HEAD_COACH', 'MANAGE_LINEUP'), true);
    assert.strictEqual(can('HEAD_COACH', 'RECORD_LIVE'), true);
  });

  it('ASSISTANT_STATISTICIAN can only record live', () => {
    assert.strictEqual(can('ASSISTANT_STATISTICIAN', 'RECORD_LIVE'), true);
    assert.strictEqual(can('ASSISTANT_STATISTICIAN', 'MANAGE_PLAYERS'), false);
    assert.strictEqual(can('ASSISTANT_STATISTICIAN', 'MANAGE_LINEUP'), false);
    assert.strictEqual(can('ASSISTANT_STATISTICIAN', 'MANAGE_DIVISIONS'), false);
    assert.strictEqual(can('ASSISTANT_STATISTICIAN', 'MANAGE_MATCHES'), false);
  });

  it('labels roles in Spanish', () => {
    assert.deepStrictEqual(USER_ROLE_LABELS, {
      HEAD_COACH: 'Entrenador principal',
      ASSISTANT_STATISTICIAN: 'Asistente planillero',
      ADMIN: 'Administrador',
    });
  });
});
