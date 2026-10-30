import 'server-only';

/** User-facing sync error messages (Spanish UI copy). */
export const SYNC_MESSAGES = {
  invalidBody: 'Los cambios enviados no tienen un formato válido.',
  payloadTooLarge: 'Demasiados cambios en un solo envío. Envíalos en partes más pequeñas.',
  invalidCursor: 'El cursor de sincronización no es válido.',
} as const;
