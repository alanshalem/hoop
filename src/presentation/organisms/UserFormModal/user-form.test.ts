import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { ManagedUser } from '@/core/application/users/user-admin';
import {
  CreateUserFormSchema,
  EditUserFormSchema,
  ResetPasswordFormSchema,
  deactivateUserMessage,
  resetPasswordMessage,
  toUserFormData,
  toUserPatch,
  userRefusalField,
} from './user-form';

const USER: ManagedUser = {
  id: 'user-coach-1',
  email: 'fbalbi@camg.com.ar',
  name: 'Federico Balbi',
  role: 'HEAD_COACH',
  active: true,
  mustChangePassword: false,
  createdAt: '2026-11-01T12:00:00.000Z',
};

const firstMessage = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? undefined : result.error?.issues[0]?.message;

describe('user form schemas (S2, S6)', () => {
  it('accepts a new account and trims name and email', () => {
    const parsed = CreateUserFormSchema.parse({
      name: '  Julio Lamas ',
      email: ' JLamas@camg.com.ar ',
      role: 'HEAD_COACH',
      temporaryPassword: 'Tmp-12345678',
    });
    assert.deepStrictEqual(parsed, {
      name: 'Julio Lamas',
      email: 'JLamas@camg.com.ar',
      role: 'HEAD_COACH',
      temporaryPassword: 'Tmp-12345678',
    });
  });

  it('explains every invalid field with the server limits', () => {
    const base = { name: 'Julio Lamas', email: 'jlamas@camg.com.ar', role: 'HEAD_COACH', temporaryPassword: 'Tmp-12345678' };
    assert.strictEqual(firstMessage(CreateUserFormSchema.safeParse({ ...base, name: 'J' })), 'El nombre debe tener de 2 a 60 caracteres.');
    assert.strictEqual(firstMessage(CreateUserFormSchema.safeParse({ ...base, name: 'J'.repeat(61) })), 'El nombre debe tener de 2 a 60 caracteres.');
    assert.strictEqual(firstMessage(CreateUserFormSchema.safeParse({ ...base, email: 'jlamas' })), 'El email no tiene un formato válido.');
    assert.strictEqual(firstMessage(CreateUserFormSchema.safeParse({ ...base, role: '' })), 'Elige el rol del usuario.');
    assert.strictEqual(
      firstMessage(CreateUserFormSchema.safeParse({ ...base, temporaryPassword: '1234567' })),
      'La contraseña debe tener entre 8 y 256 caracteres.'
    );
    assert.strictEqual(
      firstMessage(ResetPasswordFormSchema.safeParse({ temporaryPassword: 'x'.repeat(257) })),
      'La contraseña debe tener entre 8 y 256 caracteres.'
    );
  });

  it('accepts an email of up to 254 characters, like the server', () => {
    const emailOfLength = (length: number) => `${'a'.repeat(length - '@camg.com.ar'.length)}@camg.com.ar`;
    const base = { name: 'Julio Lamas', role: 'HEAD_COACH' };
    assert.ok(EditUserFormSchema.safeParse({ ...base, email: emailOfLength(254) }).success);
    assert.strictEqual(
      firstMessage(EditUserFormSchema.safeParse({ ...base, email: emailOfLength(255) })),
      'El email no tiene un formato válido.'
    );
  });

  it('edits name, email and role without a password', () => {
    assert.deepStrictEqual(EditUserFormSchema.parse(toUserFormData(USER)), {
      name: 'Federico Balbi',
      email: 'fbalbi@camg.com.ar',
      role: 'HEAD_COACH',
    });
    assert.deepStrictEqual(toUserFormData(null), { name: '', email: '', role: 'ASSISTANT_STATISTICIAN' });
  });
});

describe('toUserPatch (S6)', () => {
  it('sends only what changed', () => {
    assert.deepStrictEqual(toUserPatch(USER, { name: 'F. Balbi', email: USER.email, role: USER.role }), { name: 'F. Balbi' });
    assert.deepStrictEqual(toUserPatch(USER, { name: USER.name, email: 'otro@camg.com.ar', role: 'ADMIN' }), {
      email: 'otro@camg.com.ar',
      role: 'ADMIN',
    });
  });

  it('is null when nothing changed (an email only differing in case is the same email)', () => {
    assert.strictEqual(toUserPatch(USER, { name: USER.name, email: 'FBalbi@CAMG.com.ar', role: USER.role }), null);
  });
});

describe('user refusals (S6)', () => {
  it('marks the email field for a taken email; other refusals close the form', () => {
    assert.strictEqual(userRefusalField('EMAIL_TAKEN'), 'email');
    for (const reason of ['LAST_ADMIN', 'SELF_ROLE_CHANGE', 'USER_NOT_FOUND', undefined]) {
      assert.strictEqual(userRefusalField(reason), null, String(reason));
    }
  });
});

describe('confirmation messages (S2, S4)', () => {
  it('warns that a reset closes the sessions and forces a change', () => {
    assert.strictEqual(
      resetPasswordMessage(USER, false),
      'Federico Balbi tendrá que ingresar con la contraseña temporal y cambiarla. Se cerrarán todas sus sesiones abiertas.'
    );
    assert.strictEqual(
      resetPasswordMessage(USER, true),
      'Es tu propia cuenta: se cerrarán todas tus sesiones, también esta, y tendrás que ingresar con la contraseña temporal y cambiarla.'
    );
  });

  it('explains that deactivating keeps the account and closes its sessions', () => {
    assert.strictEqual(
      deactivateUserMessage(USER),
      'Federico Balbi no podrá iniciar sesión y se cerrarán sus sesiones abiertas. La cuenta queda en la lista y se puede reactivar.'
    );
  });
});
