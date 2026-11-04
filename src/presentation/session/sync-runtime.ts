import {
  createSyncEngine,
  type ClubDataPort,
  type SyncEngine,
  type SyncStorePort,
} from '@/core/application/sync/sync-engine';
import { reconcileSelection } from '@/core/application/sync/pull-merge';
import { pickSyncableClubData } from '@/core/application/sync/record-kinds';
import { createEditHandoff } from '@/core/application/sync/edit-handoff';
import {
  createSyncTabCoordinator,
  type SyncTabCoordinator,
  type TabChannelPort,
} from '@/core/application/sync/tab-coordinator';
import { createTabsVisibility, type TabsVisibility } from '@/core/application/sync/tab-visibility';
import { useAuthStore } from '@/core/application/stores/useAuthStore';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { useSyncStore } from '@/core/application/stores/useSyncStore';
import { CLUB_STORAGE_KEY, persistenceGate, SYNC_STORAGE_KEY } from '@/core/application/stores/persistence-gate';
import {
  browserConnectivity,
  browserKeyValueStorage,
  browserStorageEvents,
  createBrowserLeaderElection,
  browserVisibility,
  createBrowserTabChannel,
} from '@/core/infrastructure/sync-api/browser-adapters';
import { createHttpAuthApi, createHttpSyncApi } from '@/core/infrastructure/sync-api/http-sync-api';
import { claimSyncData } from './sync-ownership';

/**
 * Composition root of the client session: wires the sync engine and the tab
 * coordinator (one engine per browser, S13.3) to the stores, the HTTP adapters
 * and the browser (client components only).
 */

export const authApi = createHttpAuthApi();

const clubPort: ClubDataPort = {
  getData: () => pickSyncableClubData(useClubStore.getState()),
  applyData: (data) => useClubStore.getState().applySyncedData(data),
  subscribe: (listener) => useClubStore.subscribe(listener),
};

const syncStorePort: SyncStorePort = {
  getState: () => useSyncStore.getState(),
  setState: (patch) => useSyncStore.setState(patch),
};

let messageCount = 0;
// crypto.randomUUID needs a secure context; tablets may use plain http on the LAN.
const newMessageId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${++messageCount}`;

/** This tab, its channel to the other tabs and the visibility of all of them (created on first use). */
let tab: { id: string; channel: TabChannelPort | null; visibility: TabsVisibility } | null = null;

function getTab(): NonNullable<typeof tab> {
  if (!tab) {
    const id = newMessageId();
    const channel = createBrowserTabChannel();
    tab = { id, channel, visibility: createTabsVisibility({ local: browserVisibility, channel, tabId: id }) };
  }
  return tab;
}

let engine: SyncEngine | null = null;

export function getSyncEngine(): SyncEngine {
  engine ??= createSyncEngine({
    api: createHttpSyncApi(),
    club: clubPort,
    store: syncStorePort,
    connectivity: browserConnectivity,
    // Polls while any tab of this browser is visible, not only this one (S4, L8).
    visibility: getTab().visibility,
    // The outbox stays persisted: it is pushed after the next login.
    onUnauthorized: () => useAuthStore.getState().clearUser(),
  });
  return engine;
}

/** Reloads the persisted club data another tab wrote, keeping this tab's selection. */
async function rehydrateClub(): Promise<void> {
  const { activeDivisionId, activeMatchId } = useClubStore.getState();
  await useClubStore.persist.rehydrate();
  useClubStore.setState(reconcileSelection({ activeDivisionId, activeMatchId }, useClubStore.getState()));
}

let coordinator: SyncTabCoordinator | null = null;

function createCoordinator(): SyncTabCoordinator {
  const { id: tabId, channel, visibility } = getTab();
  const storage = browserKeyValueStorage();
  return createSyncTabCoordinator({
    engine: getSyncEngine(),
    club: { ...clubPort, rehydrate: rehydrateClub },
    syncStore: {
      ...syncStorePort,
      subscribe: (listener) => useSyncStore.subscribe(listener),
      rehydrate: async () => {
        await useSyncStore.persist.rehydrate();
      },
    },
    // Web Locks, or the localStorage lease on plain http (LAN tablets).
    lock: createBrowserLeaderElection(tabId, storage),
    channel,
    visibility,
    handoff: storage
      ? createEditHandoff({ storage, tabId, owner: () => useAuthStore.getState().user?.id ?? null, now: Date.now })
      : undefined,
    storageEvents: browserStorageEvents,
    persistence: persistenceGate,
    storageKeys: { club: CLUB_STORAGE_KEY, sync: SYNC_STORAGE_KEY },
    // The leader binds the device sync data to the user before syncing it.
    onLeader: () => {
      const user = useAuthStore.getState().user;
      if (user) claimSyncData(user);
    },
    newId: newMessageId,
  });
}

export function getSyncCoordinator(): SyncTabCoordinator {
  coordinator ??= createCoordinator();
  return coordinator;
}

/** "Sync now" from any tab: the leader syncs, a follower asks the leader to. */
export function requestSyncNow(): Promise<void> {
  return getSyncCoordinator().requestSyncNow();
}
