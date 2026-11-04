import { createLeaseLeaderLock } from '@/core/application/sync/leader-lease';
import type { ConnectivityPort, VisibilityPort } from '@/core/application/sync/sync-engine';
import type {
  KeyValueStoragePort,
  LeaderLockPort,
  StorageEventsPort,
  TabChannelPort,
} from '@/core/application/sync/tab-coordinator';

/**
 * Browser adapters for the sync engine: connectivity (`navigator.onLine` +
 * `online`/`offline` events), page visibility (polling), and the tab coordination
 * primitives (Web Locks or a localStorage lease, BroadcastChannel, `storage`
 * events).
 */

/** Web Lock held by the tab that runs the sync engine (S13.3). */
export const SYNC_LEADER_LOCK = 'hoop-sync-leader';
export const SYNC_TAB_CHANNEL = 'hoop-sync';

/**
 * Leader election with the Web Locks API, or null without it (older browsers,
 * and pages served over plain http on a LAN: the API needs a secure context).
 * A first `ifAvailable` attempt tells a follower apart at once; it then waits
 * in the queue and gets the lock when the leader tab closes.
 */
export function createBrowserLeaderLock(name: string = SYNC_LEADER_LOCK): LeaderLockPort | null {
  if (typeof navigator === 'undefined' || !navigator.locks) return null;
  const locks = navigator.locks;
  return {
    request(onAcquired, onQueued) {
      const waiting = new AbortController();
      let released = false;
      let release: (() => void) | null = null;
      const holdUntilReleased = () =>
        new Promise<void>((resolve) => {
          release = resolve;
          if (released) resolve();
        });
      const lead = () => {
        if (released) return Promise.resolve();
        onAcquired();
        return holdUntilReleased();
      };

      void locks.request(name, { ifAvailable: true }, (lock) => {
        if (lock) return lead();
        if (released) return undefined;
        onQueued();
        // Rejects with AbortError when the request is cancelled while waiting.
        locks.request(name, { signal: waiting.signal }, lead).catch(() => undefined);
        return undefined;
      });

      return () => {
        released = true;
        waiting.abort();
        release?.();
      };
    },
  };
}

/**
 * `localStorage`, or null when it is missing or refuses writes (private modes,
 * full quota): a lease nobody can write would leave every tab following.
 */
export function browserKeyValueStorage(): KeyValueStoragePort | null {
  try {
    const storage = window.localStorage;
    const probe = 'hoop-storage-probe';
    storage.setItem(probe, probe);
    storage.removeItem(probe);
    return {
      getItem: (key) => storage.getItem(key),
      setItem: (key, value) => storage.setItem(key, value),
      removeItem: (key) => storage.removeItem(key),
      keys: () => Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key) => key !== null),
    };
  } catch {
    return null;
  }
}

const browserPageHide = {
  subscribe: (listener: () => void) => {
    window.addEventListener('pagehide', listener);
    return () => window.removeEventListener('pagehide', listener);
  },
};

/**
 * Leader election for this browser: Web Locks when available, otherwise the
 * localStorage lease (plain http on the LAN), or null when neither works.
 */
export function createBrowserLeaderElection(tabId: string, storage: KeyValueStoragePort | null): LeaderLockPort | null {
  const webLock = createBrowserLeaderLock();
  if (webLock || !storage) return webLock;
  return createLeaseLeaderLock({
    storage,
    storageEvents: browserStorageEvents,
    tabId,
    now: Date.now,
    timers: {
      setTimeout: (callback, ms) => window.setTimeout(callback, ms),
      clearTimeout: (handle) => window.clearTimeout(handle as number),
    },
    pageHide: browserPageHide,
  });
}

/** Messages between the tabs of this origin, or null without BroadcastChannel. */
export function createBrowserTabChannel(name: string = SYNC_TAB_CHANNEL): TabChannelPort | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  const channel = new BroadcastChannel(name);
  return {
    post: (message) => channel.postMessage(message),
    subscribe: (listener) => {
      const handleMessage = (event: MessageEvent<unknown>) => listener(event.data);
      channel.addEventListener('message', handleMessage);
      return () => channel.removeEventListener('message', handleMessage);
    },
  };
}

/** localStorage keys written by other tabs. */
export const browserStorageEvents: StorageEventsPort = {
  subscribe: (listener) => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== null) listener(event.key);
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  },
};

export const browserConnectivity: ConnectivityPort = {
  isOnline: () => typeof navigator === 'undefined' || navigator.onLine,
  subscribe: (listener) => {
    const handleOnline = () => listener(true);
    const handleOffline = () => listener(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  },
};

/** `document.visibilityState` and its `visibilitychange` event. */
export const browserVisibility: VisibilityPort = {
  isVisible: () => typeof document === 'undefined' || document.visibilityState === 'visible',
  subscribe: (listener) => {
    const handleChange = () => listener(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handleChange);
    return () => document.removeEventListener('visibilitychange', handleChange);
  },
};
