import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createEmptyOutbox } from '@/core/application/sync/outbox';
import type { SyncPersistedData, SyncStoreData } from '@/core/application/sync/sync-types';

/** Bump when the persisted sync shape changes; older storage restarts with a full resync. */
export const SYNC_STORE_VERSION = 1;

export function createInitialSyncData(): SyncStoreData {
  return {
    cursor: null,
    versions: {},
    outbox: createEmptyOutbox(),
    lastSyncedAt: null,
    status: 'idle',
    lastError: null,
  };
}

export interface SyncStoreState extends SyncStoreData {
  /** Forgets the server baseline and the outbox (logout). */
  resetSyncData: () => void;
}

/** Outbox, cursor and versions survive reloads in their own storage key (S10.7). */
export const useSyncStore = create<SyncStoreState>()(
  persist(
    (set) => ({
      ...createInitialSyncData(),
      resetSyncData: () => set(createInitialSyncData()),
    }),
    {
      name: 'hoop-sync-storage',
      version: SYNC_STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): SyncPersistedData => ({
        cursor: state.cursor,
        versions: state.versions,
        outbox: state.outbox,
        lastSyncedAt: state.lastSyncedAt,
      }),
      // A cursor-less store does a full resync: the server snapshot replaces local data.
      migrate: (persisted, version): SyncPersistedData => {
        if (version === SYNC_STORE_VERSION) return persisted as SyncPersistedData;
        const { cursor, versions, outbox, lastSyncedAt } = createInitialSyncData();
        return { cursor, versions, outbox, lastSyncedAt };
      },
    }
  )
);
