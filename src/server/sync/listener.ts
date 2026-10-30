import 'server-only';
import { Client } from 'pg';
import { CURRENT_CURSOR_SQL, SYNC_CHANNEL } from './repository';

export { SYNC_CHANNEL };

/**
 * =============================================================================
 * HOOP OS - SHARED SYNC CHANGE LISTENER
 * One dedicated Postgres connection per server process runs
 * `LISTEN hoop_sync` and fans each notification out to every subscriber
 * (one per open SSE stream), so browsers never hold database connections.
 * Notifications come from any server instance (pushes NOTIFY on commit).
 * =============================================================================
 */

export type ChangeListener = (cursor: string) => void;

export interface SyncChangeListener {
  /** Starts listening on first use; returns the unsubscribe function. */
  subscribe(listener: ChangeListener): () => void;
  /** Resolves once LISTEN is active. */
  ready(): Promise<void>;
  close(): Promise<void>;
}

export interface SyncChangeListenerOptions {
  connectionString: string;
  /** First reconnect delay; doubles per failed attempt up to `maxRetryMs`. */
  retryMs?: number;
  maxRetryMs?: number;
}

const CURSOR_PATTERN = /^\d+$/;

export function createSyncChangeListener({
  connectionString,
  retryMs = 1000,
  maxRetryMs = 30_000,
}: SyncChangeListenerOptions): SyncChangeListener {
  const listeners = new Set<ChangeListener>();
  let readyWaiters: (() => void)[] = [];
  let client: Client | null = null;
  let connecting = false;
  let connectedBefore = false;
  let closed = false;
  let failures = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function emit(cursor: string): void {
    for (const listener of [...listeners]) {
      try {
        listener(cursor);
      } catch (error) {
        console.error('[sync/listener] subscriber failed', error);
      }
    }
  }

  function settleReadyWaiters(): void {
    const waiters = readyWaiters;
    readyWaiters = [];
    for (const resolve of waiters) resolve();
  }

  function scheduleReconnect(): void {
    if (closed || retryTimer || listeners.size === 0) return;
    const delay = Math.min(retryMs * 2 ** failures, maxRetryMs);
    failures += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void connect();
    }, delay);
  }

  function drop(lost: Client): void {
    if (client !== lost) return;
    client = null;
    lost.end().catch(() => {});
    scheduleReconnect();
  }

  async function connect(): Promise<void> {
    if (closed || client || connecting) return;
    connecting = true;
    const next = new Client({ connectionString });
    next.on('notification', ({ channel, payload }) => {
      if (channel === SYNC_CHANNEL && payload && CURSOR_PATTERN.test(payload)) emit(payload);
    });
    next.on('error', (error) => {
      console.error('[sync/listener] connection error', error.message);
      drop(next);
    });
    next.on('end', () => drop(next));

    try {
      await next.connect();
      await next.query(`LISTEN ${SYNC_CHANNEL}`);
    } catch (error) {
      console.error('[sync/listener] could not listen', error);
      next.end().catch(() => {});
      connecting = false;
      scheduleReconnect();
      return;
    }
    connecting = false;
    if (closed) {
      await next.end().catch(() => {});
      return;
    }

    client = next;
    failures = 0;
    settleReadyWaiters();
    if (!connectedBefore) {
      connectedBefore = true;
      return;
    }
    // Notifications sent while disconnected are lost: tell subscribers to pull.
    try {
      const result = await next.query<{ cursor: string }>(CURRENT_CURSOR_SQL);
      const cursor = result.rows[0]?.cursor;
      if (cursor) emit(cursor);
    } catch (error) {
      console.error('[sync/listener] could not read the cursor after reconnecting', error);
    }
  }

  return {
    subscribe(listener) {
      if (closed) return () => {};
      listeners.add(listener);
      void connect();
      return () => {
        listeners.delete(listener);
      };
    },
    ready() {
      if (client || closed) return Promise.resolve();
      return new Promise<void>((resolve) => {
        readyWaiters.push(resolve);
        void connect();
      });
    },
    async close() {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      listeners.clear();
      settleReadyWaiters();
      const current = client;
      client = null;
      await current?.end();
    },
  };
}

// Kept on globalThis so dev hot reloads reuse the one LISTEN connection.
const globalForListener = globalThis as typeof globalThis & { hoopSyncListener?: SyncChangeListener };

/** The process-wide listener, connected to `DATABASE_URL` on first subscribe. */
export function getSyncChangeListener(): SyncChangeListener {
  if (!globalForListener.hoopSyncListener) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set.');
    globalForListener.hoopSyncListener = createSyncChangeListener({ connectionString: url });
  }
  return globalForListener.hoopSyncListener;
}
