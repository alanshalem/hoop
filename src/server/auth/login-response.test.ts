import { describe, it } from 'node:test';
import assert from 'node:assert';
import { loginErrorResponse } from './login-response';
import { AUTH_MESSAGES } from './messages';

describe('login refusals (S1)', () => {
  it('answers any credential failure with the same generic 401 and no reason', async () => {
    const response = loginErrorResponse('INVALID_CREDENTIALS');
    assert.strictEqual(response.status, 401);
    assert.strictEqual(response.headers.get('cache-control'), 'no-store');
    assert.deepStrictEqual(await response.json(), { error: AUTH_MESSAGES.invalidCredentials });
  });

  it('answers a blocked email or IP with 429, the Spanish message and TOO_MANY_ATTEMPTS', async () => {
    const response = loginErrorResponse('TOO_MANY_ATTEMPTS');
    assert.strictEqual(response.status, 429);
    assert.strictEqual(response.headers.get('cache-control'), 'no-store');
    assert.deepStrictEqual(await response.json(), {
      error: 'Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.',
      reason: 'TOO_MANY_ATTEMPTS',
    });
  });
});
