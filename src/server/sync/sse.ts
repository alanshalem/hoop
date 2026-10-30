import 'server-only';
import { logServerError } from '../http/log-server-error';

/**
 * =============================================================================
 * HOOP OS - SYNC SERVER-SENT EVENTS
 * Each browser keeps one `GET /api/sync/stream`. It only carries cursors: on
 * `changed`, the client pulls. All streams of a process share one Postgres
 * LISTEN connection (see ./listener.ts).
 * =============================================================================
 */

export const HEARTBEAT_INTERVAL_MS = 25_000;

/** Comment lines keep proxies and the browser from timing out an idle stream. */
export const HEARTBEAT_COMMENT = ': heartbeat\n\n';

/** Flushes the headers right away and asks EventSource to reconnect after 5 s. */
export const STREAM_OPENED = ': connected\nretry: 5000\n\n';

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-store, no-transform',
  Connection: 'keep-alive',
  // Disables response buffering in nginx-style reverse proxies.
  'X-Accel-Buffering': 'no',
} as const;

export function formatChangedEvent(cursor: string): string {
  return `event: changed\ndata: ${JSON.stringify({ cursor })}\n\n`;
}

export interface SyncEventStreamOptions {
  /** Registers a change listener and returns its unsubscribe function. */
  subscribe: (listener: (cursor: string) => void) => () => void;
  /** The request signal: the stream ends when the client disconnects. */
  signal?: AbortSignal;
  heartbeatMs?: number;
  /** Checked on every heartbeat; the stream ends once the session is gone (logout, expiry). */
  isSessionValid?: () => Promise<boolean>;
}

export function createSyncEventStream({
  subscribe,
  signal,
  heartbeatMs = HEARTBEAT_INTERVAL_MS,
  isSessionValid,
}: SyncEventStreamOptions): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let cleanup: (() => void) | undefined;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (signal?.aborted) {
        controller.close();
        return;
      }

      let open = true;
      const send = (chunk: string) => {
        if (open) controller.enqueue(encoder.encode(chunk));
      };
      const unsubscribe = subscribe((cursor) => send(formatChangedEvent(cursor)));
      const heartbeat = setInterval(() => {
        void beat();
      }, heartbeatMs);

      const stop = () => {
        if (!open) return;
        open = false;
        clearInterval(heartbeat);
        unsubscribe();
        signal?.removeEventListener('abort', close);
      };
      const close = () => {
        if (!open) return;
        stop();
        controller.close();
      };
      async function beat(): Promise<void> {
        try {
          if (isSessionValid && !(await isSessionValid())) {
            close();
            return;
          }
          send(HEARTBEAT_COMMENT);
        } catch (error) {
          logServerError('sync/stream heartbeat', error);
          close();
        }
      }

      cleanup = stop;
      signal?.addEventListener('abort', close);
      send(STREAM_OPENED);
    },
    cancel() {
      cleanup?.();
    },
  });
}
