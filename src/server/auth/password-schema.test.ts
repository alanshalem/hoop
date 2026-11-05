import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PasswordChangeBodySchema } from './password-schema';

describe('password change body (S5, S6)', () => {
  it('keeps both passwords exactly as typed', () => {
    assert.deepStrictEqual(PasswordChangeBodySchema.parse({ currentPassword: ' old ', newPassword: ' new-pass ' }), {
      currentPassword: ' old ',
      newPassword: ' new-pass ',
    });
  });

  it('accepts a new password of 8 and 256 characters', () => {
    for (const newPassword of ['x'.repeat(8), 'x'.repeat(256)]) {
      assert.ok(PasswordChangeBodySchema.safeParse({ currentPassword: 'old', newPassword }).success);
    }
  });

  it('rejects a new password of 7 or 257 characters and a missing or empty current password', () => {
    for (const body of [
      { currentPassword: 'old', newPassword: 'x'.repeat(7) },
      { currentPassword: 'old', newPassword: 'x'.repeat(257) },
      { currentPassword: '', newPassword: 'x'.repeat(8) },
      { newPassword: 'x'.repeat(8) },
      { currentPassword: 'x'.repeat(257), newPassword: 'x'.repeat(8) },
    ]) {
      assert.strictEqual(PasswordChangeBodySchema.safeParse(body).success, false, JSON.stringify(body));
    }
  });
});
