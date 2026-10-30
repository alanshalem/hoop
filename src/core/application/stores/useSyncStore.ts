import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createEmptyOutbox } from '@/core/application/sync/outbox';
import type { SyncPersistedData, SyncStoreData } from '@/core/application/sync/sync-types';
import { gatedLocalStorage, SYNC_STORAGE_KEY } from './persistence-gate';

/** Bump when the persisted sync shape changes; older storage restarts with a full resync. */
export const SYNC_STORE_VERSION = 2;

export function createInitialSyncData(): SyncStoreData {
  return {
    owner: null,
    cursor: null,
    versions: {},
    outbox: createEmptyOutbox(),
    lastSyncedAt: null,
    status: 'idle',
    lastError: null,
  };
}

export interface SyncStoreState extends SyncStoreData {
  /** Forgets the owner, the server baseline and the outbox (logout). */
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
      name: SYNC_STORAGE_KEY,
      version: SYNC_STORE_VERSION,
      // Only the tab running the sync engine writes it (S13.3).
      storage: createJSONStorage(gatedLocalStorage),
      partialize: (state): SyncPersistedData => ({
        owner: state.owner,
        cursor: state.cursor,
        versions: state.versions,
        outbox: state.outbox,
        lastSyncedAt: state.lastSyncedAt,
      }),
      // A cursor-less store does a full resync: the server snapshot replaces local data.
      // Version 1 had no owner: its outbox is claimed by the next user who logs in.
      migrate: (persisted, version): SyncPersistedData => {
        if (version === SYNC_STORE_VERSION) return persisted as SyncPersistedData;
        if (version === 1) return { ...(persisted as Omit<SyncPersistedData, 'owner'>), owner: null };
        const { owner, cursor, versions, outbox, lastSyncedAt } = createInitialSyncData();
        return { owner, cursor, versions, outbox, lastSyncedAt };
      },
    }
  )
);
