import type { AccountApiResult } from '@/core/application/auth/auth-session';
import { useAuthStore } from '@/core/application/stores/useAuthStore';
import { notify } from '@/presentation/organisms/DialogHost/dialog-store';
import { accountFailureMessage } from '@/presentation/session/account-messages';

const SERVER_FALLBACK = 'El servidor no respondió como se esperaba. Inténtalo de nuevo en unos minutos.';

type Failure = Extract<AccountApiResult<unknown>, { ok: false }>;

/**
 * Tells the admin why a user request failed, with the server's message as-is.
 * Resolves true when the form should close: the account no longer exists, or
 * the session ended (the user is then sent to log in again).
 */
export async function reportUserAdminFailure(failure: Failure, title: string): Promise<boolean> {
  if (failure.error === 'UNAUTHORIZED') {
    await notify({
      title: 'Tu sesión terminó',
      message: 'Inicia sesión de nuevo para gestionar los usuarios.',
      tone: 'warning',
    });
    useAuthStore.getState().clearUser();
    return true;
  }
  await notify({
    title: failure.error === 'NETWORK' ? 'Sin conexión' : title,
    message: accountFailureMessage(failure, SERVER_FALLBACK),
    tone: 'warning',
  });
  return failure.reason === 'USER_NOT_FOUND';
}
