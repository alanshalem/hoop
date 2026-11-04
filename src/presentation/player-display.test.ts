import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatPlayerHeight, MISSING_VALUE } from './player-display';

describe('player display (S4)', () => {
  it('shows the height in cm, or a dash when it is missing', () => {
    assert.strictEqual(formatPlayerHeight(190), '190 cm');
    assert.strictEqual(formatPlayerHeight(undefined), '—');
    assert.strictEqual(MISSING_VALUE, '—');
  });
});
