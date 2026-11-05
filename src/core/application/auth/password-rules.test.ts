import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  NEW_PASSWORD_MESSAGE,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  newPasswordError,
  validatePasswordChange,
} from './password-rules';

const VALID = { currentPassword: 'temporal-123', newPassword: 'nueva-clave-1', repeatPassword: 'nueva-clave-1' };

describe('newPasswordError (S6)', () => {
  it('accepts 8 to 256 characters, kept exactly as typed', () => {
    assert.strictEqual(PASSWORD_MIN_LENGTH, 8);
    assert.strictEqual(PASSWORD_MAX_LENGTH, 256);
    for (const value of ['a'.repeat(8), 'a'.repeat(256), '  espacios  ']) {
      assert.strictEqual(newPasswordError(value), undefined, `${value.length} characters`);
    }
  });

  it('refuses shorter and longer passwords with the length message', () => {
    assert.strictEqual(NEW_PASSWORD_MESSAGE, 'La contraseña debe tener entre 8 y 256 caracteres.');
    for (const value of ['', 'a'.repeat(7), 'a'.repeat(257)]) {
      assert.strictEqual(newPasswordError(value), NEW_PASSWORD_MESSAGE, `${value.length} characters`);
    }
  });
});

describe('validatePasswordChange (S5)', () => {
  it('has no errors for a valid change', () => {
    assert.deepStrictEqual(validatePasswordChange(VALID), {});
  });

  it('asks for the current password', () => {
    assert.deepStrictEqual(validatePasswordChange({ ...VALID, currentPassword: '' }), {
      currentPassword: 'Ingresa tu contraseña actual.',
    });
  });

  it('checks the length of the new password', () => {
    assert.deepStrictEqual(validatePasswordChange({ ...VALID, newPassword: 'corta', repeatPassword: 'corta' }), {
      newPassword: NEW_PASSWORD_MESSAGE,
    });
  });

  it('requires the new password twice, equal', () => {
    assert.deepStrictEqual(validatePasswordChange({ ...VALID, repeatPassword: '' }), {
      repeatPassword: 'Repite la nueva contraseña.',
    });
    assert.deepStrictEqual(validatePasswordChange({ ...VALID, repeatPassword: 'nueva-clave-2' }), {
      repeatPassword: 'Las contraseñas no coinciden.',
    });
  });

  it('refuses keeping the current password as the new one', () => {
    assert.deepStrictEqual(
      validatePasswordChange({ currentPassword: 'temporal-123', newPassword: 'temporal-123', repeatPassword: 'temporal-123' }),
      { newPassword: 'La nueva contraseña debe ser distinta de la actual.' }
    );
  });

  it('reports every field at once', () => {
    assert.deepStrictEqual(validatePasswordChange({ currentPassword: '', newPassword: 'x', repeatPassword: 'y' }), {
      currentPassword: 'Ingresa tu contraseña actual.',
      newPassword: NEW_PASSWORD_MESSAGE,
      repeatPassword: 'Las contraseñas no coinciden.',
    });
  });
});
