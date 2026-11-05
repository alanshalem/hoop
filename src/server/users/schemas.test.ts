import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CreateUserBodySchema, ResetPasswordBodySchema, UpdateUserBodySchema } from './schemas';

const VALID_CREATE = {
  name: '  Ana Pérez ',
  email: ' Ana.Perez@CAMG.com.ar ',
  role: 'HEAD_COACH',
  temporaryPassword: 'temporal1',
};

describe('create user body (S2, S6)', () => {
  it('trims the name, normalizes the email and keeps the password as typed', () => {
    const result = CreateUserBodySchema.safeParse({ ...VALID_CREATE, temporaryPassword: ' temporal1 ' });
    assert.ok(result.success);
    assert.deepStrictEqual(result.data, {
      name: 'Ana Pérez',
      email: 'ana.perez@camg.com.ar',
      role: 'HEAD_COACH',
      temporaryPassword: ' temporal1 ',
    });
  });

  it('accepts names of 2 and 60 characters and passwords of 8 and 256', () => {
    for (const name of ['Al', 'x'.repeat(60)]) {
      assert.ok(CreateUserBodySchema.safeParse({ ...VALID_CREATE, name }).success, `name of ${name.length}`);
    }
    for (const temporaryPassword of ['x'.repeat(8), 'x'.repeat(256)]) {
      assert.ok(CreateUserBodySchema.safeParse({ ...VALID_CREATE, temporaryPassword }).success);
    }
  });

  it('rejects short or long names, bad emails, unknown roles and out-of-range passwords', () => {
    for (const override of [
      { name: ' A ' },
      { name: 'x'.repeat(61) },
      { email: 'not-an-email' },
      { role: 'OWNER' },
      { temporaryPassword: 'x'.repeat(7) },
      { temporaryPassword: 'x'.repeat(257) },
      { temporaryPassword: undefined },
    ]) {
      assert.strictEqual(CreateUserBodySchema.safeParse({ ...VALID_CREATE, ...override }).success, false);
    }
  });
});

describe('update user body (S4, S6)', () => {
  it('accepts any non-empty subset of name, email, role and active', () => {
    assert.deepStrictEqual(UpdateUserBodySchema.parse({ active: false }), { active: false });
    assert.deepStrictEqual(UpdateUserBodySchema.parse({ email: 'X@Camg.com.ar', name: ' Ana ' }), {
      email: 'x@camg.com.ar',
      name: 'Ana',
    });
    assert.deepStrictEqual(UpdateUserBodySchema.parse({ role: 'ADMIN' }), { role: 'ADMIN' });
  });

  it('rejects an empty patch, bad values and a password field alone', () => {
    for (const body of [
      {},
      { passwordHash: 'x' },
      { name: 'A' },
      { email: 'nope' },
      { role: 'OWNER' },
      { active: 'false' },
    ]) {
      assert.strictEqual(UpdateUserBodySchema.safeParse(body).success, false, JSON.stringify(body));
    }
  });

  it('drops fields that are not editable', () => {
    assert.deepStrictEqual(UpdateUserBodySchema.parse({ name: 'Ana', mustChangePassword: false }), { name: 'Ana' });
  });
});

describe('reset password body (S2, S6)', () => {
  it('accepts a temporary password of 8 to 256 characters', () => {
    assert.ok(ResetPasswordBodySchema.safeParse({ temporaryPassword: 'x'.repeat(8) }).success);
    assert.ok(ResetPasswordBodySchema.safeParse({ temporaryPassword: 'x'.repeat(256) }).success);
    assert.strictEqual(ResetPasswordBodySchema.safeParse({ temporaryPassword: 'x'.repeat(7) }).success, false);
    assert.strictEqual(ResetPasswordBodySchema.safeParse({ temporaryPassword: 'x'.repeat(257) }).success, false);
    assert.strictEqual(ResetPasswordBodySchema.safeParse({}).success, false);
  });
});
