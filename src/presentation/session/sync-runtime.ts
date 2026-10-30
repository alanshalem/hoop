import { createSyncEngine, type SyncEngine } from '@/core/application/sync/sync-engine';
import { useAuthStore } from '@/core/application/stores/useAuthStore';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { useSyncStore } from '@/core/application/stores/useSyncStore';
import { browserConnectivity, openSyncChangeStream } from '@/core/infrastructure/sync-api/browser-adapters';
import { createHttpAuthApi, createHttpSyncApi } from '@/core/infrastructure/sync-api/http-sync-api';

/**
 * Composition root of the client session: wires the sync engine to the stores,
 * the HTTP adapters and the browser (client components only).
 */

export const authApi = createHttpAuthApi();

let engine: SyncEngine | null = null;

export function getSyncEngine(): SyncEngine {
  engine ??= createSyncEngine({
    api: createHttpSyncApi(),
    club: {
      getData: () => {
        const { divisions, teams, players, matches } = useClubStore.getState();
        return { divisions, teams, players, matches };
      },
      applyData: (data) => useClubStore.getState().applySyncedData(data),
      subscribe: (listener) => useClubStore.subscribe(listener),
    },
    store: {
      getState: () => useSyncStore.getState(),
      setState: (patch) => useSyncStore.setState(patch),
    },
    connectivity: browserConnectivity,
    openChangeStream: openSyncChangeStream,
    // The outbox stays persisted: it is pushed after the next login.
    onUnauthorized: () => useAuthStore.getState().clearUser(),
  });
  return engine;
}
