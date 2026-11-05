import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AUTH_MESSAGES } from './messages';
import { passwordChangeRefusal } from './password-change-gate';

const USER = { id: 'u-1', email: 'a@camg.com.ar', name: 'Ana', role: 'HEAD_COACH' as const };

describe('sync refusal while the password must change (S3)', () => {
  it('answers 403 PASSWORD_CHANGE_REQUIRED for a flagged account', async () => {
    const response = passwordChangeRefusal({ ...USER, mustChangePassword: true });
    assert.ok(response);
    assert.strictEqual(response.status, 403);
    assert.strictEqual(response.headers.get('cache-control'), 'no-store');
    assert.deepStrictEqual(await response.json(), {
      error: AUTH_MESSAGES.passwordChangeRequired,
      reason: 'PASSWORD_CHANGE_REQUIRED',
    });
  });

  it('lets an account without the flag through', () => {
    assert.strictEqual(passwordChangeRefusal({ ...USER, mustChangePassword: false }), null);
  });
});
