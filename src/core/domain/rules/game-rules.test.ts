import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  formatGameClock,
  getNextQuarter,
  getQuarterLengthSeconds,
} from './game-clock';
import {
  consumeTimeout,
  createInitialTimeouts,
  getRemainingTimeouts,
  getTimeoutPeriod,
} from './timeouts';
import { FIBA_MAX_ROSTER, FIBA_STARTERS, validateLineup } from './lineup-rules';
import { can } from './permissions';
import { USER_ROLE_LABELS } from '../entities/club.types';

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
