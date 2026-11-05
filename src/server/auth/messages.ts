import 'server-only';

/** User-facing auth error messages (Spanish UI copy). */
export const AUTH_MESSAGES = {
  invalidCredentials: 'Email o contraseña incorrectos',
  invalidBody: 'Ingresa un email válido y tu contraseña.',
  unsupportedMediaType: 'La solicitud debe enviarse en formato JSON.',
  unauthenticated: 'No has iniciado sesión o tu sesión expiró.',
  forbiddenOrigin: 'Solicitud rechazada: el origen no está permitido.',
  invalidPasswordChangeBody: 'Ingresa tu contraseña actual y una nueva de 8 a 256 caracteres.',
  wrongCurrentPassword: 'La contraseña actual no es correcta.',
  samePassword: 'La nueva contraseña debe ser distinta de la actual.',
  passwordChangeRequired: 'Debes cambiar tu contraseña temporal antes de continuar.',
  tooManyAttempts: 'Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.',
} as const;
