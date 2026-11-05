import { describe, it } from 'node:test';
import assert from 'node:assert';
import { OFFLINE_ACCOUNT_MESSAGE, accountFailureMessage } from './account-messages';

describe('accountFailureMessage', () => {
  it('shows the server message as-is', () => {
    assert.strictEqual(
      accountFailureMessage({ ok: false, error: 'HTTP', status: 409, message: 'Ya existe un usuario con ese email.', reason: 'EMAIL_TAKEN' }, 'x'),
      'Ya existe un usuario con ese email.'
    );
    assert.strictEqual(accountFailureMessage({ ok: false, error: 'UNAUTHORIZED', status: 401, message: 'No autenticado' }, 'x'), 'No autenticado');
  });

  it('explains that the account screens need a connection', () => {
    assert.strictEqual(accountFailureMessage({ ok: false, error: 'NETWORK' }, 'x'), OFFLINE_ACCOUNT_MESSAGE);
    assert.match(OFFLINE_ACCOUNT_MESSAGE, /conexión/);
  });

  it('falls back when the server sent no message', () => {
    assert.strictEqual(accountFailureMessage({ ok: false, error: 'INVALID_RESPONSE', status: 200 }, 'Algo falló.'), 'Algo falló.');
    assert.strictEqual(accountFailureMessage({ ok: false, error: 'HTTP', status: 502 }, 'Algo falló.'), 'Algo falló.');
  });
});
