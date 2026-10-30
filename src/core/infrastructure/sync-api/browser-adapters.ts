import type { ConnectivityPort } from '@/core/application/sync/sync-engine';
import type {
  LeaderLockPort,
  StorageEventsPort,
  TabChannelPort,
} from '@/core/application/sync/tab-coordinator';
import { parseChangedEventData } from './sync-api-schemas';

/**
 * Browser adapters for the sync engine: connectivity (`navigator.onLine` +
 * `online`/`offline` events), the SSE change stream, and the tab coordination
 * primitives (Web Locks, BroadcastChannel, `storage` events).
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

export const SYNC_STREAM_URL = '/api/sync/stream';

/** Re-open delay after the browser gave up on the stream (e.g. a 401 or a server restart). */
const STREAM_REOPEN_MS = 15_000;

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

/**
 * Listens to `GET /api/sync/stream` and reports the cursor of every `changed`
 * event. EventSource reconnects by itself after network errors; when it closes
 * for good (non-200 answer) it is reopened later. Returns the close function.
 */
export function openSyncChangeStream(onChanged: (cursor: string) => void): () => void {
  if (typeof EventSource === 'undefined') return () => undefined;

  let source: EventSource | null = null;
  let reopenTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const handleChanged = (event: MessageEvent<string>) => {
    const cursor = parseChangedEventData(event.data);
    if (cursor !== null) onChanged(cursor);
  };

  const open = () => {
    reopenTimer = null;
    if (closed) return;
    source = new EventSource(SYNC_STREAM_URL);
    source.addEventListener('changed', handleChanged);
    source.addEventListener('error', () => {
      if (source?.readyState !== EventSource.CLOSED || closed) return;
      source.removeEventListener('changed', handleChanged);
      source = null;
      reopenTimer = setTimeout(open, STREAM_REOPEN_MS);
    });
  };

  open();
  return () => {
    closed = true;
    if (reopenTimer !== null) clearTimeout(reopenTimer);
    source?.close();
    source = null;
  };
}
