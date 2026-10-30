import type { ConnectivityPort } from '@/core/application/sync/sync-engine';
import { parseChangedEventData } from './sync-api-schemas';

/**
 * Browser adapters for the sync engine: connectivity (`navigator.onLine` +
 * `online`/`offline` events) and the SSE change stream.
 */

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
