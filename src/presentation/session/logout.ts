import { LOGIN_PATH } from '@/core/application/auth/auth-session';
import { countPending } from '@/core/application/sync/outbox';
import { useAuthStore } from '@/core/application/stores/useAuthStore';
import { useSyncStore } from '@/core/application/stores/useSyncStore';
import { confirm, notify } from '@/presentation/organisms/DialogHost/dialog-store';
import { runLogout } from './logout-flow';
import { authApi, getSyncCoordinator } from './sync-runtime';

/**
 * Logout from the user menu (see `runLogout`): the session, owner, cursor,
 * versions and outbox are cleared. Resolves false when the user stays logged in.
 */
export function logoutWithConfirmation(navigate: (path: string) => void): Promise<boolean> {
  const coordinator = getSyncCoordinator();
  return runLogout({
    pendingCount: () => countPending(useSyncStore.getState().outbox),
    // A follower tab cannot push: what is pending counts as unsynced.
    flush: () => coordinator.flush(),
    confirm,
    notify,
    revokeServerSession: () => authApi.logout(),
    clearLocalSession: () => {
      // Leaves the tab role first, so the reset below is persisted.
      coordinator.stop();
      useSyncStore.getState().resetSyncData();
      navigate(LOGIN_PATH);
      useAuthStore.getState().clearUser();
    },
  });
}
