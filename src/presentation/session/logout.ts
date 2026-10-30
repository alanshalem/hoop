import { LOGIN_PATH } from '@/core/application/auth/auth-session';
import { countPending } from '@/core/application/sync/outbox';
import { useAuthStore } from '@/core/application/stores/useAuthStore';
import { useSyncStore } from '@/core/application/stores/useSyncStore';
import { confirm } from '@/presentation/organisms/DialogHost/dialog-store';
import { authApi, getSyncEngine } from './sync-runtime';

const unsyncedMessage = (pending: number) =>
  pending === 1
    ? 'Hay 1 cambio sin sincronizar. Si cierras sesión ahora, se perderá en este dispositivo.'
    : `Hay ${pending} cambios sin sincronizar. Si cierras sesión ahora, se perderán en este dispositivo.`;

/**
 * Logout (S10.8): pending changes are flushed first; if some cannot be sent the
 * user must confirm losing them. Only then the session, cursor, versions and
 * outbox are cleared. Resolves false when the user stays logged in.
 */
export async function logoutWithConfirmation(navigate: (path: string) => void): Promise<boolean> {
  const engine = getSyncEngine();
  let pending = countPending(useSyncStore.getState().outbox);
  if (pending > 0) pending = await engine.flush();

  if (pending > 0) {
    const accepted = await confirm({
      title: 'Cerrar sesión',
      message: unsyncedMessage(pending),
      tone: 'warning',
      confirmLabel: 'Cerrar sesión igual',
      cancelLabel: 'Seguir conectado',
    });
    if (!accepted) return false;
  }

  // Offline the server session cannot be revoked now; it expires on its own.
  await authApi.logout();
  engine.stop();
  useSyncStore.getState().resetSyncData();
  navigate(LOGIN_PATH);
  useAuthStore.getState().clearUser();
  return true;
}
