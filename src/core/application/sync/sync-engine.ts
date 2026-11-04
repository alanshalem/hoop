import { diffClubState } from './club-diff';
import {
  applyPushResult,
  buildPushBatch,
  countPending,
  createEmptyOutbox,
  enqueueChanges,
  markBatchAttempted,
} from './outbox';
import {
  applyServerSnapshot,
  isServerCursorBehind,
  mergePulledChanges,
  type MergeState,
} from './pull-merge';
import { createEmptyClubData, type SyncableClubData } from './record-kinds';
import type { ApiResult, ClubDiff, PullPage, SyncApi, SyncStoreData } from './sync-types';

/**
 * =============================================================================
 * HOOP - SYNC ENGINE (S10.7)
 * Watches the club store, stamps local changes into the persisted outbox and
 * flushes it. Server changes are polled (S4, serverless hosting has no
 * long-lived connections): a pull on start, every SYNC_POLL_INTERVAL_MS while
 * the page is visible (paused while hidden), at once when the page becomes
 * visible again or the connection returns, and right after every push. Only
 * the leader tab runs the engine (./tab-coordinator.ts), so followers never poll.
 * Data epoch (S1, L5): pushes carry the epoch of the last pull. When a pull or
 * a refused push reveals another epoch (the server data was replaced), the
 * outbox, cursor, versions and local club data are dropped and a snapshot is
 * pulled, so old local data never reaches the new server data.
 * Framework-free: browser APIs and stores arrive as ports.
 * =============================================================================
 */

export const FLUSH_DEBOUNCE_MS = 500;
export const RETRY_BASE_MS = 1000;
export const RETRY_MAX_MS = 60_000;
/** Pull interval while the page is visible (S4). */
export const SYNC_POLL_INTERVAL_MS = 10_000;
/** Guard against a server that keeps answering `hasMore`. */
const MAX_PULL_PAGES = 1000;

export const SYNC_ERROR_MESSAGES = {
  unauthorized: 'Tu sesión expiró. Vuelve a iniciar sesión para sincronizar.',
  server: 'El servidor no pudo procesar la sincronización.',
  invalidResponse: 'El servidor respondió con datos inesperados.',
  rejected: (count: number) =>
    count === 1
      ? 'El servidor rechazó 1 cambio (sin permiso o con datos inválidos).'
      : `El servidor rechazó ${count} cambios (sin permiso o con datos inválidos).`,
  dataReset: (count: number) =>
    count === 1
      ? 'Los datos del servidor se reemplazaron: se descartó 1 cambio sin sincronizar de este dispositivo.'
      : `Los datos del servidor se reemplazaron: se descartaron ${count} cambios sin sincronizar de este dispositivo.`,
} as const;

export interface ClubDataPort {
  getData(): SyncableClubData;
  /** Replaces the synced collections (the engine ignores the change it causes). */
  applyData(data: SyncableClubData): void;
  subscribe(listener: () => void): () => void;
}

export interface SyncStorePort {
  getState(): SyncStoreData;
  setState(patch: Partial<SyncStoreData>): void;
}

export interface ConnectivityPort {
  isOnline(): boolean;
  subscribe(listener: (online: boolean) => void): () => void;
}

/** Whether the page is shown (Page Visibility API); polling pauses while it is hidden. */
export interface VisibilityPort {
  isVisible(): boolean;
  subscribe(listener: (visible: boolean) => void): () => void;
}

export interface TimerPort {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface SyncEngineDeps {
  api: SyncApi;
  club: ClubDataPort;
  store: SyncStorePort;
  connectivity: ConnectivityPort;
  /** Defaults to always visible. */
  visibility?: VisibilityPort;
  /** The session is gone (401): the app moves to login; the outbox is kept. */
  onUnauthorized: () => void;
  now?: () => number;
  timers?: TimerPort;
}

export interface SyncEngine {
  start(): void;
  stop(): void;
  /** Flushes pending changes and pulls, now (also clears a retry wait). */
  syncNow(): Promise<void>;
  /** Pushes everything pending; resolves with the number of changes still pending. */
  flush(): Promise<number>;
  /**
   * Stamps changes the club store already holds (made in another tab) into the
   * outbox, at `madeAtMs` when given (the time the edit was made), else now.
   */
  enqueue(diff: ClubDiff, madeAtMs?: number): void;
  /** Resolves once no sync work is running. */
  whenIdle(): Promise<void>;
}

type StepOutcome = 'ok' | 'offline' | 'error' | 'unauthorized';

const alwaysVisible: VisibilityPort = {
  isVisible: () => true,
  subscribe: () => () => undefined,
};

const defaultTimers: TimerPort = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createSyncEngine(deps: SyncEngineDeps): SyncEngine {
  const { api, club, store, connectivity } = deps;
  const now = deps.now ?? Date.now;
  const timers = deps.timers ?? defaultTimers;
  const visibility = deps.visibility ?? alwaysVisible;

  let started = false;
  /** Bumped by stop(): late responses of a stopped session are discarded. */
  let generation = 0;
  let baseline: SyncableClubData | null = null;
  let applying = false;
  let cleanups: (() => void)[] = [];

  let wantFlush = false;
  let wantPull = false;
  let running: Promise<void> | null = null;
  let failures = 0;
  let flushTimer: unknown = null;
  let retryTimer: unknown = null;
  let pollTimer: unknown = null;

  const isCurrent = (gen: number) => started && gen === generation;

  const clearTimer = (handle: unknown) => {
    if (handle !== null) timers.clearTimeout(handle);
  };

  function onClubChange(): void {
    const next = club.getData();
    const previous = baseline;
    baseline = next;
    // Pulled data is not a local change. Edits made before the first sync are kept too:
    // the snapshot re-applies them (see `applyServerSnapshot`).
    if (applying || !previous) return;

    enqueue(diffClubState(previous, next));
  }

  function enqueue(diff: ClubDiff, madeAtMs?: number): void {
    if (diff.records.length === 0 && diff.events.length === 0) return;
    const { outbox, versions } = store.getState();
    store.setState(enqueueChanges({ outbox, versions }, diff, madeAtMs ?? now()));
    if (started) scheduleFlush();
  }

  function scheduleFlush(): void {
    clearTimer(flushTimer);
    flushTimer = timers.setTimeout(() => {
      flushTimer = null;
      request({ flush: true });
    }, FLUSH_DEBOUNCE_MS);
  }

  function request({ flush = false, pull = false }: { flush?: boolean; pull?: boolean }): void {
    wantFlush ||= flush;
    wantPull ||= pull;
    if (retryTimer !== null) return; // the scheduled retry picks the work up
    void drain();
  }

  function drain(): Promise<void> {
    if (running) return running;
    running = runLoop().finally(() => {
      running = null;
    });
    return running;
  }

  async function runLoop(): Promise<void> {
    const gen = generation;
    let didWork = false;
    let errorMessage: string | null = null;
    // A poll due while syncing is redundant: the next one is scheduled once this run ends.
    clearPoll();

    while (isCurrent(gen) && (wantFlush || wantPull)) {
      if (!connectivity.isOnline()) {
        store.setState({ status: 'offline' });
        return;
      }
      store.setState({ status: 'syncing' });

      // Without a cursor the snapshot comes first: pending changes are re-applied over it, then pushed.
      // Nothing is pushed before the epoch is known.
      const { cursor, epoch } = store.getState();
      if (wantFlush && epoch === null) wantPull = true;
      const snapshotFirst = wantPull && (cursor === null || epoch === null);
      const step = wantFlush && !snapshotFirst ? 'flush' : 'pull';
      if (step === 'flush') wantFlush = false;
      else wantPull = false;

      const result = step === 'flush' ? await flushOnce(gen) : await pullAll(gen);
      if (!isCurrent(gen)) return;

      if (result.outcome !== 'ok') {
        if (step === 'flush') wantFlush = true;
        else wantPull = true;
        handleFailure(result.outcome, result.message);
        return;
      }
      didWork = true;
      errorMessage = result.message ?? errorMessage;
    }

    if (!isCurrent(gen)) return;
    failures = 0;
    store.setState({
      status: errorMessage ? 'error' : 'idle',
      lastError: errorMessage,
      ...(didWork ? { lastSyncedAt: new Date(now()).toISOString() } : {}),
    });
    schedulePoll();
  }

  function clearPoll(): void {
    clearTimer(pollTimer);
    pollTimer = null;
  }

  /** The next pull, one interval after the last run; none while the page is hidden. */
  function schedulePoll(): void {
    clearPoll();
    if (!started || !visibility.isVisible()) return;
    pollTimer = timers.setTimeout(() => {
      pollTimer = null;
      request({ pull: true });
    }, SYNC_POLL_INTERVAL_MS);
  }

  function onVisibility(visible: boolean): void {
    if (!visible) {
      clearPoll();
      return;
    }
    // Back on screen: pull now (a pending retry keeps its backoff and picks the pull up).
    request({ pull: true });
  }

  function handleFailure(outcome: Exclude<StepOutcome, 'ok'>, message?: string): void {
    if (outcome === 'unauthorized') {
      wantFlush = false;
      wantPull = false;
      store.setState({ status: 'error', lastError: SYNC_ERROR_MESSAGES.unauthorized });
      deps.onUnauthorized();
      return;
    }
    store.setState({
      status: outcome,
      lastError: outcome === 'error' ? (message ?? SYNC_ERROR_MESSAGES.server) : null,
    });
    const delay = Math.min(RETRY_BASE_MS * 2 ** failures, RETRY_MAX_MS);
    failures += 1;
    retryTimer = timers.setTimeout(() => {
      retryTimer = null;
      void drain();
    }, delay);
  }

  function failureOf(result: Extract<ApiResult<unknown>, { ok: false }>): { outcome: StepOutcome; message?: string } {
    if (result.error === 'UNAUTHORIZED') return { outcome: 'unauthorized' };
    if (result.error === 'NETWORK') return { outcome: 'offline' };
    if (result.error === 'INVALID_RESPONSE') return { outcome: 'error', message: SYNC_ERROR_MESSAGES.invalidResponse };
    return { outcome: 'error', message: result.message };
  }

  async function flushOnce(gen: number): Promise<{ outcome: StepOutcome; message?: string }> {
    const batch = buildPushBatch(store.getState().outbox);
    if (batch.size === 0) return { outcome: 'ok' };
    const { epoch } = store.getState();
    if (epoch === null) {
      wantFlush = true;
      wantPull = true;
      return { outcome: 'ok' };
    }
    store.setState({ outbox: markBatchAttempted(store.getState().outbox, batch) });

    const result = await api.push(batch.payload, epoch);
    if (!isCurrent(gen)) return { outcome: 'ok' };
    if (!result.ok && result.error === 'EPOCH_MISMATCH') return { outcome: 'ok', message: resetForNewEpoch() };
    if (!result.ok) return failureOf(result);

    const { outbox, settledCount, errorCount } = applyPushResult(store.getState().outbox, batch, result.value);
    store.setState({ outbox });
    // Pull right after a push: other devices' changes (and newer versions behind STALE) arrive at once.
    wantPull = true;

    if (isServerCursorBehind(store.getState().cursor, result.value.cursor)) {
      requireFullResync();
    } else if (settledCount > 0 && countPending(outbox) > 0) {
      wantFlush = true;
    }
    return { outcome: 'ok', message: errorCount > 0 ? SYNC_ERROR_MESSAGES.rejected(errorCount) : undefined };
  }

  async function pullAll(gen: number): Promise<{ outcome: StepOutcome; message?: string }> {
    const { cursor: storedCursor, epoch: knownEpoch } = store.getState();
    // An unknown epoch cannot trust the cursor: it starts from a snapshot.
    const since = knownEpoch === null ? null : storedCursor;
    const pages: PullPage[] = [];
    let cursor = since;
    for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
      const result = await api.pull(cursor);
      if (!isCurrent(gen)) return { outcome: 'ok' };
      if (!result.ok) return failureOf(result);
      pages.push(result.value);
      cursor = result.value.cursor;
      if (!result.value.hasMore) break;
    }

    // The cursor may have been reset while the pull was in flight; the next pull starts over.
    const state = store.getState();
    if (state.cursor !== storedCursor || state.epoch !== knownEpoch) return { outcome: 'ok' };

    // Pages of another epoch (or of two epochs: replaced mid-pull) never merge into local data.
    const epoch = pages[0].epoch;
    if (pages.some((page) => page.epoch !== epoch) || (knownEpoch !== null && epoch !== knownEpoch)) {
      return { outcome: 'ok', message: resetForNewEpoch() };
    }

    const pulled = {
      records: pages.flatMap((page) => page.records),
      events: pages.flatMap((page) => page.events),
    };
    const merged: MergeState & { changed: boolean } =
      since === null
        ? { ...applyServerSnapshot(pulled, state.outbox), changed: true }
        : mergePulledChanges({ data: club.getData(), versions: state.versions, outbox: state.outbox }, pulled);

    if (merged.changed) applyClubData(merged.data);
    store.setState({ cursor, epoch, versions: merged.versions, outbox: merged.outbox });
    if (since === null && countPending(merged.outbox) > 0) wantFlush = true;
    return { outcome: 'ok' };
  }

  /** Server data is not a local change: the engine ignores the store update it causes. */
  function applyClubData(data: SyncableClubData): void {
    applying = true;
    try {
      club.applyData(data);
    } finally {
      applying = false;
    }
  }

  /**
   * The server data was replaced (another epoch): drops what belongs to the old
   * data, local club data included, and asks for a snapshot. Returns the notice
   * for the user when unsynced changes were discarded.
   */
  function resetForNewEpoch(): string | undefined {
    const discarded = countPending(store.getState().outbox);
    store.setState({ epoch: null, cursor: null, versions: {}, outbox: createEmptyOutbox() });
    applyClubData(createEmptyClubData());
    wantFlush = false;
    wantPull = true;
    return discarded > 0 ? SYNC_ERROR_MESSAGES.dataReset(discarded) : undefined;
  }

  function requireFullResync(): void {
    store.setState({ cursor: null, versions: {} });
    wantPull = true;
  }

  function onConnectivity(online: boolean): void {
    if (!online) {
      store.setState({ status: 'offline' });
      return;
    }
    void syncNow();
  }

  function syncNow(): Promise<void> {
    if (!started) return Promise.resolve();
    clearTimer(retryTimer);
    retryTimer = null;
    failures = 0;
    request({ flush: true, pull: true });
    return whenIdle();
  }

  async function whenIdle(): Promise<void> {
    while (running) await running;
  }

  return {
    start() {
      if (started) return;
      started = true;
      baseline = club.getData();
      cleanups = [
        club.subscribe(onClubChange),
        connectivity.subscribe(onConnectivity),
        visibility.subscribe(onVisibility),
      ];
      void syncNow();
    },

    stop() {
      if (!started) return;
      started = false;
      generation += 1;
      cleanups.forEach((cleanup) => cleanup());
      cleanups = [];
      clearTimer(flushTimer);
      clearTimer(retryTimer);
      clearPoll();
      flushTimer = null;
      retryTimer = null;
      wantFlush = false;
      wantPull = false;
      failures = 0;
      baseline = null;
    },

    syncNow,

    async flush() {
      if (started && connectivity.isOnline()) {
        clearTimer(flushTimer);
        flushTimer = null;
        clearTimer(retryTimer);
        retryTimer = null;
        request({ flush: true });
        await whenIdle();
      }
      return countPending(store.getState().outbox);
    },

    enqueue,

    whenIdle,
  };
}
