import type { AuthUser } from '@/core/application/auth/auth-session';
import { resolveSyncOwnership } from '@/core/application/sync/sync-owner';
import { useSyncStore } from '@/core/application/stores/useSyncStore';
import { notify } from '@/presentation/organisms/DialogHost/dialog-store';

const discardedMessage = (count: number, previousName: string) =>
  count === 1
    ? `Se descartó 1 cambio sin sincronizar de ${previousName}. Se hizo con otra sesión en este dispositivo y no llegó al servidor.`
    : `Se descartaron ${count} cambios sin sincronizar de ${previousName}. Se hicieron con otra sesión en este dispositivo y no llegaron al servidor.`;

/**
 * Binds the device sync data to `user` before the sync engine starts: another
 * user's pending changes are discarded (never pushed under this identity) and
 * the device resyncs from a full snapshot.
 */
export function claimSyncData(user: AuthUser): void {
  const decision = resolveSyncOwnership(useSyncStore.getState(), user);
  useSyncStore.setState(decision.patch);
  if (decision.action === 'discard' && decision.discardedCount > 0) {
    void notify({
      title: 'Cambios descartados',
      message: discardedMessage(decision.discardedCount, decision.previousOwner.name),
      tone: 'warning',
    });
  }
}
