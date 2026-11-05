import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isMatchInPlay } from './match-status';

describe('isMatchInPlay', () => {
  it('is true for LIVE and HALFTIME only', () => {
    assert.strictEqual(isMatchInPlay({ status: 'LIVE' }), true);
    assert.strictEqual(isMatchInPlay({ status: 'HALFTIME' }), true);
    assert.strictEqual(isMatchInPlay({ status: 'SCHEDULED' }), false);
    assert.strictEqual(isMatchInPlay({ status: 'FINISHED' }), false);
  });
});
