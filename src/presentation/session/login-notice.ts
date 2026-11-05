import type { AccountApiResult } from '@/core/application/auth/auth-session';
import type { NotifyOptions } from '@/presentation/organisms/DialogHost/dialog-store';
import { SERVER_FALLBACK_MESSAGE } from './account-messages';

export const OFFLINE_LOGIN_MESSAGE =
  'Para iniciar sesión necesitas conexión con el servidor del club. Si ya ingresaste antes en esta tablet, tu última sesión sigue disponible sin conexión.';

/** The server's own text for a blocked login or password change; this is only the fallback. */
export const TOO_MANY_ATTEMPTS_MESSAGE = 'Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.';

type LoginFailure = Extract<AccountApiResult<unknown>, { ok: false }>;

/** The modal shown when a login fails: the server's message when it sent one (S1). */
export function loginFailureNotice(failure: LoginFailure): NotifyOptions {
  if (failure.error === 'NETWORK') {
    return { title: 'Sin conexión', message: OFFLINE_LOGIN_MESSAGE, tone: 'warning' };
  }
  if (failure.reason === 'TOO_MANY_ATTEMPTS') {
    return { title: 'Demasiados intentos', message: failure.message ?? TOO_MANY_ATTEMPTS_MESSAGE, tone: 'warning' };
  }
  if (failure.error === 'UNAUTHORIZED') {
    return {
      title: 'No pudimos iniciar sesión',
      message: failure.message ?? 'Email o contraseña incorrectos',
      tone: 'danger',
    };
  }
  return { title: 'Error del servidor', message: failure.message ?? SERVER_FALLBACK_MESSAGE, tone: 'danger' };
}
