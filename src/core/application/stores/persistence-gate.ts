import type { StateStorage } from 'zustand/middleware';

/**
 * Write switch for the persisted club and sync stores (S13.3). Only the tab
 * that runs the sync engine writes them; follower tabs keep their state in
 * memory and reload it when the leader writes (see tab-coordinator.ts).
 */
let writable = true;

export const persistenceGate = {
  setWritable(value: boolean): void {
    writable = value;
  },
};

/** Persisted store keys, shared with the tab coordinator's `storage` events. */
export const CLUB_STORAGE_KEY = 'hoop-club-storage';
export const SYNC_STORAGE_KEY = 'hoop-sync-storage';

/**
 * `localStorage` whose writes follow the gate. Reading `localStorage` throws
 * outside the browser (prerender), which `createJSONStorage` treats as "no
 * storage", exactly like `createJSONStorage(() => localStorage)`.
 */
export function gatedLocalStorage(): StateStorage {
  const storage = localStorage;
  return {
    getItem: (name) => storage.getItem(name),
    setItem: (name, value) => {
      if (writable) storage.setItem(name, value);
    },
    removeItem: (name) => {
      if (writable) storage.removeItem(name);
    },
  };
}
