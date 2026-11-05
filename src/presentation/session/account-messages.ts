import type { AccountApiResult } from '@/core/application/auth/auth-session';

/** Account screens (users, password) always need the server: nothing is queued offline. */
export const OFFLINE_ACCOUNT_MESSAGE =
  'No hay conexión con el servidor del club. Las cuentas y las contraseñas solo se gestionan con conexión: vuelve a intentarlo cuando la tengas.';

/** Fallback when the server refused an account request without a message of its own. */
export const SERVER_FALLBACK_MESSAGE = 'El servidor no respondió como se esperaba. Inténtalo de nuevo en unos minutos.';

type AccountFailure = Extract<AccountApiResult<unknown>, { ok: false }>;

/** What to tell the user about a refused account request: the server's own message when it sent one. */
export function accountFailureMessage(failure: AccountFailure, fallback: string): string {
  if (failure.error === 'NETWORK') return OFFLINE_ACCOUNT_MESSAGE;
  return failure.message ?? fallback;
}
