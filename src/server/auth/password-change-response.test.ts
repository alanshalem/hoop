import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AUTH_MESSAGES } from './messages';
import { passwordChangeErrorResponse } from './password-change-response';

describe('own password change refusals (S3, S5)', () => {
  it('answers a wrong or kept current password with 400, its Spanish message and typed reason', async () => {
    const expected = [
      ['WRONG_CURRENT_PASSWORD', AUTH_MESSAGES.wrongCurrentPassword],
      ['SAME_PASSWORD', AUTH_MESSAGES.samePassword],
    ] as const;
    for (const [reason, error] of expected) {
      const response = passwordChangeErrorResponse(reason);
      assert.strictEqual(response.status, 400, reason);
      assert.strictEqual(response.headers.get('cache-control'), 'no-store');
      assert.deepStrictEqual(await response.json(), { error, reason });
    }
  });

  it('answers a blocked change with 429, the Spanish message and TOO_MANY_ATTEMPTS (S2)', async () => {
    const response = passwordChangeErrorResponse('TOO_MANY_ATTEMPTS');
    assert.strictEqual(response.status, 429);
    assert.strictEqual(response.headers.get('cache-control'), 'no-store');
    assert.deepStrictEqual(await response.json(), {
      error: 'Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.',
      reason: 'TOO_MANY_ATTEMPTS',
    });
  });

  it('answers a session that ended with 401 and no reason', async () => {
    const response = passwordChangeErrorResponse('UNAUTHENTICATED');
    assert.strictEqual(response.status, 401);
    assert.strictEqual(response.headers.get('cache-control'), 'no-store');
    assert.deepStrictEqual(await response.json(), { error: AUTH_MESSAGES.unauthenticated });
  });
});
