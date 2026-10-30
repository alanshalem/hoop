import { describe, it } from 'node:test';
import assert from 'node:assert';
import { LoginBodySchema } from './login-schema';

describe('login body schema', () => {
  it('accepts email + password and normalizes the email (trim, lowercase)', () => {
    const result = LoginBodySchema.safeParse({ email: '  FBalbi@CAMG.com.ar ', password: 'camg1922' });
    assert.ok(result.success);
    assert.deepStrictEqual(result.data, { email: 'fbalbi@camg.com.ar', password: 'camg1922' });
  });

  it('keeps the password exactly as typed (no trimming)', () => {
    const result = LoginBodySchema.safeParse({ email: 'a@camg.com.ar', password: ' secret ' });
    assert.ok(result.success);
    assert.strictEqual(result.data.password, ' secret ');
  });

  it('drops unknown fields', () => {
    const result = LoginBodySchema.safeParse({
      email: 'a@camg.com.ar',
      password: 'x',
      role: 'ADMIN',
    });
    assert.ok(result.success);
    assert.deepStrictEqual(Object.keys(result.data).sort(), ['email', 'password']);
  });

  it('rejects invalid or missing fields', () => {
    for (const body of [
      null,
      'email=a@camg.com.ar',
      {},
      { email: 'a@camg.com.ar' },
      { password: 'camg1922' },
      { email: 'not-an-email', password: 'camg1922' },
      { email: 'a@camg.com.ar', password: '' },
      { email: 'a@camg.com.ar', password: 1922 },
      { email: `${'a'.repeat(250)}@camg.com.ar`, password: 'camg1922' },
      { email: 'a@camg.com.ar', password: 'x'.repeat(257) },
    ]) {
      assert.strictEqual(LoginBodySchema.safeParse(body).success, false, JSON.stringify(body));
    }
  });
});
