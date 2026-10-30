import type { ApiResult } from '@/core/application/sync/sync-types';
import type { ConfirmOptions, NotifyOptions } from '@/presentation/organisms/DialogHost/dialog-store';

/** Ports of the logout flow, so its decisions are testable without a browser. */
export interface LogoutDeps {
  pendingCount(): number;
  /** Pushes pending changes; resolves with how many are still pending. */
  flush(): Promise<number>;
  confirm(options: ConfirmOptions): Promise<boolean>;
  notify(options: NotifyOptions): Promise<void>;
  /** `POST /api/auth/logout`: deletes the server session. */
  revokeServerSession(): Promise<ApiResult<void>>;
  /** Stops sync, forgets the sync data and the cached user, and leaves for /login. */
  clearLocalSession(): void;
}

export const OFFLINE_LOGOUT_NOTICE = {
  title: 'Sesión cerrada en este dispositivo',
  message:
    'No se pudo avisar al servidor (sin conexión). La sesión del servidor seguirá activa hasta que venza (30 días) o hasta el próximo inicio de sesión en este dispositivo.',
  tone: 'warning',
} as const satisfies NotifyOptions;

const unsyncedMessage = (pending: number) =>
  pending === 1
    ? 'Hay 1 cambio sin sincronizar. Si cierras sesión ahora, se perderá en este dispositivo.'
    : `Hay ${pending} cambios sin sincronizar. Si cierras sesión ahora, se perderán en este dispositivo.`;

/**
 * Logout (S10.8): pending changes are flushed first; if some cannot be sent the
 * user must confirm losing them. Then the server session is revoked and the
 * local one cleared, even when the server cannot be reached (the user is told
 * the server session stays valid). Resolves false when the user stays logged in.
 */
export async function runLogout(deps: LogoutDeps): Promise<boolean> {
  let pending = deps.pendingCount();
  if (pending > 0) pending = await deps.flush();

  if (pending > 0) {
    const accepted = await deps.confirm({
      title: 'Cerrar sesión',
      message: unsyncedMessage(pending),
      tone: 'warning',
      confirmLabel: 'Cerrar sesión igual',
      cancelLabel: 'Seguir conectado',
    });
    if (!accepted) return false;
  }

  const revoked = await deps.revokeServerSession();
  deps.clearLocalSession();
  // A 401 means the server session is already gone; any other failure may leave it active.
  if (!revoked.ok && revoked.error !== 'UNAUTHORIZED') void deps.notify(OFFLINE_LOGOUT_NOTICE);
  return true;
}
