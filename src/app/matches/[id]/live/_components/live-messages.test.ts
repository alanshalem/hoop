import { describe, it } from 'node:test';
import assert from 'node:assert';
import { REFUSAL_MESSAGES, timeoutWindowLabel } from './live-messages';

describe('timeoutWindowLabel', () => {
  it('names the FIBA timeout period of the quarter', () => {
    assert.strictEqual(timeoutWindowLabel('Q1', 300), 'la primera mitad');
    assert.strictEqual(timeoutWindowLabel('Q4', 121), 'la segunda mitad');
    assert.strictEqual(timeoutWindowLabel('OT1', 30), 'este suplementario');
  });

  it('names the restricted span in the last 2 minutes of Q4', () => {
    assert.strictEqual(timeoutWindowLabel('Q4', 120), 'los últimos 2 minutos del 4.º cuarto');
  });
});

describe('REFUSAL_MESSAGES', () => {
  it('explains halftime refusals', () => {
    assert.strictEqual(
      REFUSAL_MESSAGES.HALFTIME,
      'Es el entretiempo: no se registran jugadas ni tiempos muertos hasta comenzar el 3.er cuarto.'
    );
  });

  it('explains a rival player outside the rival roster (S14)', () => {
    assert.strictEqual(
      REFUSAL_MESSAGES.INVALID_RIVAL_PLAYER,
      'El jugador rival no pertenece al plantel de este rival.'
    );
  });
});
