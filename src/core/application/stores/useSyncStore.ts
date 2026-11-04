import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createEmptyOutbox } from '@/core/application/sync/outbox';
import type { SyncPersistedData, SyncStoreData } from '@/core/application/sync/sync-types';
import { gatedLocalStorage, SYNC_STORAGE_KEY } from './persistence-gate';

/**
 * Bump when the persisted sync shape changes; older storage restarts with a full resync.
 * v3: data epoch (S1, L5); older outboxes belong to replaced server data and are dropped.
 */
export const SYNC_STORE_VERSION = 3;

export function createInitialSyncData(): SyncStoreData {
  return {
    owner: null,
    cursor: null,
    versions: {},
    outbox: createEmptyOutbox(),
    lastSyncedAt: null,
    epoch: null,
    status: 'idle',
    lastError: null,
  };
}

/**
 * Persist migration: storage of any older version restarts empty (no owner,
 * cursor, versions or outbox), so changes made on replaced server data are
 * never pushed; the next sync pulls a full snapshot.
 */
export function migrateSyncStore(persisted: unknown, version: number): SyncPersistedData {
  if (version === SYNC_STORE_VERSION) return persisted as SyncPersistedData;
  const { owner, cursor, versions, outbox, lastSyncedAt, epoch } = createInitialSyncData();
  return { owner, cursor, versions, outbox, lastSyncedAt, epoch };
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
        epoch: state.epoch,
      }),
      // A cursor-less store does a full resync: the server snapshot replaces local data.
      migrate: migrateSyncStore,
    }
  )
);
