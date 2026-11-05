/**
 * Password rules the client checks before asking the server (S5, S6). The
 * server enforces the same bounds; passwords are kept exactly as typed.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 256;

export const NEW_PASSWORD_MESSAGE = `La contraseña debe tener entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres.`;

/** Length error of a password a user or the admin chooses, or undefined when it is valid. */
export function newPasswordError(password: string): string | undefined {
  return password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH
    ? NEW_PASSWORD_MESSAGE
    : undefined;
}

export interface PasswordChangeInput {
  currentPassword: string;
  newPassword: string;
  /** The new password typed a second time. */
  repeatPassword: string;
}

export type PasswordChangeErrors = Partial<Record<keyof PasswordChangeInput, string>>;

/** Field errors of the change-password form; empty when it can be sent. */
export function validatePasswordChange({
  currentPassword,
  newPassword,
  repeatPassword,
}: PasswordChangeInput): PasswordChangeErrors {
  const errors: PasswordChangeErrors = {};
  if (!currentPassword) errors.currentPassword = 'Ingresa tu contraseña actual.';

  const lengthError = newPasswordError(newPassword);
  if (lengthError) errors.newPassword = lengthError;
  // A temporary password the admin knows must not survive the change.
  else if (newPassword === currentPassword) errors.newPassword = 'La nueva contraseña debe ser distinta de la actual.';

  if (!repeatPassword) errors.repeatPassword = 'Repite la nueva contraseña.';
  else if (repeatPassword !== newPassword) errors.repeatPassword = 'Las contraseñas no coinciden.';
  return errors;
}
