import 'server-only';

/** User-facing auth error messages (Spanish UI copy). */
export const AUTH_MESSAGES = {
  invalidCredentials: 'Email o contraseña incorrectos',
  invalidBody: 'Ingresa un email válido y tu contraseña.',
  unsupportedMediaType: 'La solicitud debe enviarse en formato JSON.',
  unauthenticated: 'No has iniciado sesión o tu sesión expiró.',
  forbiddenOrigin: 'Solicitud rechazada: el origen no está permitido.',
} as const;
