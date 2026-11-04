import { describe, it } from 'node:test';
import assert from 'node:assert';
import { makeEvent } from '@/core/testing/fixtures';
import { parseEventData } from './records';

describe('parseEventData (pruned event model, S3)', () => {
  it('accepts a scoring play unchanged', () => {
    const event = makeEvent({ id: 'e-1', matchId: 'm-1', type: 'FG2_MADE' });
    assert.deepStrictEqual(parseEventData('e-1', 'm-1', event), { ok: true, value: event });
  });

  it('rejects a SUBSTITUTION event', () => {
    const event = { ...makeEvent({ id: 'e-1', matchId: 'm-1' }), type: 'SUBSTITUTION' };
    assert.strictEqual(parseEventData('e-1', 'm-1', event).ok, false);
  });

  it('drops coordinates and substitution details from a stored event', () => {
    const event = makeEvent({ id: 'e-1', matchId: 'm-1', type: 'FG3_MADE' });
    const result = parseEventData('e-1', 'm-1', {
      ...event,
      coordinates: { x: 10, y: 20 },
      substitution: { playerInId: 'p-6', playerOutId: 'p-1' },
    });
    assert.deepStrictEqual(result, { ok: true, value: event });
  });
});
