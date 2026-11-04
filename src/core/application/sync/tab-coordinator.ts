import { applyClubDiff } from './apply-club-diff';
import { diffClubState } from './club-diff';
import { countPending } from './outbox';
import { dropSupersededChanges } from './stale-diff';
import type { ClubDataPort, SyncEngine } from './sync-engine';
import type { SyncableClubData } from './record-kinds';
import type { ClubDiff, SyncStatus, SyncStoreData } from './sync-types';

/**
 * =============================================================================
 * HOOP - ONE SYNC ENGINE PER BROWSER (S13.3)
 * Tabs share localStorage, so only one of them may run the sync engine and
 * write the persisted club and sync stores: the holder of the Web Lock
 * `hoop-sync-leader` or, where Web Locks are missing (plain http on the LAN),
 * of the localStorage lease (./leader-lease.ts). Until its role is known a tab
 * keeps the persisted stores read-only. The other tabs are followers:
 * - they never write the persisted stores, and reload them on `storage` events;
 * - their local edits travel to the leader as club diffs (BroadcastChannel);
 *   the leader applies them to its store, so its engine enqueues them through
 *   the usual diff/outbox path, and acknowledges them;
 * - an edit stays unacknowledged until the leader confirms it: a new leader
 *   announces itself and followers send their unacknowledged edits again;
 *   meanwhile it is also kept in localStorage (./edit-handoff.ts), so it
 *   survives its tab closing while no tab leads;
 * - when the leader tab closes the lock passes to a follower, which reloads the
 *   persisted state, starts the engine and enqueues its own unacknowledged
 *   edits (also those made before the lock was decided) and the ones closed
 *   tabs left in the handoff;
 * - a leader that loses its lease (its tab was frozen past the lease) steps
 *   down to follower;
 * - every tab announces its page visibility (./tab-visibility.ts), so the
 *   leader keeps polling while any tab of the browser is visible.
 * Without any leader lock or without BroadcastChannel every tab leads
 * (behaviour before S13.3).
 * =============================================================================
 */

/** Bumped when messages change: tabs of another app version ignore each other. */
export const TAB_PROTOCOL_VERSION = 1;

export type TabMessage =
  | { v: number; type: 'club-diff'; id: string; diff: ClubDiff }
  | { v: number; type: 'ack'; id: string }
  | { v: number; type: 'status'; status: SyncStatus; lastError: string | null }
  | { v: number; type: 'sync-now' }
  | { v: number; type: 'leader' }
  | { v: number; type: 'visibility'; tabId: string; visible: boolean };

type TabMessageBody = TabMessage extends infer M ? (M extends TabMessage ? Omit<M, 'v'> : never) : never;

export interface LeaderLockPort {
  /**
   * Asks for the leader lock: `onAcquired` once it is held; `onQueued` first
   * when another tab holds it; `onLost` if it is taken away (a lease that
   * expired), after which `onAcquired` may come again. The returned function
   * releases it (or stops waiting).
   */
  request(onAcquired: () => void, onQueued: () => void, onLost?: () => void): () => void;
}

/** localStorage as the lease and the edit handoff need it. */
export interface KeyValueStoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
}

export interface HandoffEdit {
  id: string;
  diff: ClubDiff;
  /** When the edit was made (ms): a later leader replays it at that time, never as new. */
  madeAt?: number;
}

export interface EditHandoffPort {
  /** Keeps this tab's unacknowledged edits for the next leader (an empty list forgets them). */
  save(edits: readonly HandoffEdit[]): void;
  /** The leader applied this edit: no tab key keeps it any longer. */
  forget(editId: string): void;
  /** Takes the edits every tab of the current user left, oldest first. */
  drain(): HandoffEdit[];
}

export interface TabChannelPort {
  post(message: TabMessage): void;
  /** Messages are untrusted input (another tab may run another app version). */
  subscribe(listener: (message: unknown) => void): () => void;
}

export interface StorageEventsPort {
  /** Keys of localStorage entries written by another tab. */
  subscribe(listener: (key: string) => void): () => void;
}

export interface PersistenceGatePort {
  /** False: the persisted stores keep working in memory but skip their storage writes. */
  setWritable(writable: boolean): void;
}

export interface SyncTabCoordinatorDeps {
  engine: Pick<SyncEngine, 'start' | 'stop' | 'syncNow' | 'flush' | 'enqueue'>;
  /** Clock for stamping local edits (defaults to Date.now). */
  now?: () => number;
  club: ClubDataPort & { rehydrate(): Promise<void> };
  syncStore: {
    getState(): SyncStoreData;
    setState(patch: Partial<SyncStoreData>): void;
    subscribe(listener: () => void): () => void;
    rehydrate(): Promise<void>;
  };
  /** Null when the browser offers no way to elect a leader. */
  lock: LeaderLockPort | null;
  /** Persisted copy of unacknowledged edits; none when omitted. */
  handoff?: EditHandoffPort;
  /** Null when the browser has no BroadcastChannel. */
  channel: TabChannelPort | null;
  storageEvents: StorageEventsPort;
  persistence: PersistenceGatePort;
  /** localStorage keys of the persisted club and sync stores. */
  storageKeys: { club: string; sync: string };
  /** Visibility of every tab (./tab-visibility.ts): runs while the coordinator does. */
  visibility?: { start(): void; stop(): void };
  /** Runs when this tab becomes the leader, right before the engine starts. */
  onLeader?: () => void;
  newId: () => string;
}

export type TabRole = 'idle' | 'follower' | 'leader';

export interface SyncTabCoordinator {
  start(): void;
  /** Leaves the role (logout or unmount): releases the lock and stops the engine. */
  stop(): void;
  role(): TabRole;
  /** The leader syncs now; a follower asks the leader to. */
  requestSyncNow(): Promise<void>;
  /** Pushes pending changes (leader); resolves with how many remain pending. */
  flush(): Promise<number>;
}

const SYNC_STATUSES: readonly SyncStatus[] = ['idle', 'syncing', 'offline', 'error'];

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** A message of this protocol version, or null. */
export function parseTabMessage(raw: unknown): TabMessage | null {
  if (!isObject(raw) || raw.v !== TAB_PROTOCOL_VERSION) return null;
  switch (raw.type) {
    case 'club-diff': {
      const { diff } = raw;
      const valid =
        typeof raw.id === 'string' && isObject(diff) && Array.isArray(diff.records) && Array.isArray(diff.events);
      return valid ? (raw as TabMessage) : null;
    }
    case 'ack':
      return typeof raw.id === 'string' ? (raw as TabMessage) : null;
    case 'status': {
      const validStatus = SYNC_STATUSES.some((status) => status === raw.status);
      const validError = raw.lastError === null || typeof raw.lastError === 'string';
      return validStatus && validError ? (raw as TabMessage) : null;
    }
    case 'visibility':
      return typeof raw.tabId === 'string' && typeof raw.visible === 'boolean' ? (raw as TabMessage) : null;
    case 'sync-now':
    case 'leader':
      return raw as TabMessage;
    default:
      return null;
  }
}

export function createSyncTabCoordinator(deps: SyncTabCoordinatorDeps): SyncTabCoordinator {
  const { engine, club, syncStore, channel } = deps;

  let started = false;
  /** Bumped by stop(): a promotion still reloading is abandoned. */
  let generation = 0;
  let currentRole: TabRole = 'idle';
  let releaseLock: (() => void) | null = null;
  let channelCleanup: (() => void) | null = null;
  let clubCleanup: (() => void) | null = null;
  let roleCleanups: (() => void)[] = [];

  const now = deps.now ?? Date.now;
  /** Edits made while not leading, in order, until a leader acknowledges them. */
  const unacked = new Map<string, { diff: ClubDiff; madeAt: number }>();
  let baseline: SyncableClubData | null = null;
  let reloading = false;
  let sharedStatus: string | null = null;

  const post = (body: TabMessageBody) => channel?.post({ v: TAB_PROTOCOL_VERSION, ...body } as TabMessage);

  const persistUnacked = () => deps.handoff?.save([...unacked].map(([id, edit]) => ({ id, ...edit })));

  function clearRoleListeners(): void {
    roleCleanups.forEach((cleanup) => cleanup());
    roleCleanups = [];
  }

  function onMessage(raw: unknown): void {
    const message = parseTabMessage(raw);
    if (!message) return;
    if (currentRole === 'leader') {
      if (message.type === 'club-diff') {
        club.applyData(applyClubDiff(club.getData(), message.diff));
        // Applied: the sender may close before the ack arrives, so its copy goes now.
        deps.handoff?.forget(message.id);
        post({ type: 'ack', id: message.id });
      } else if (message.type === 'sync-now') {
        void engine.syncNow();
      }
    } else if (currentRole === 'follower') {
      if (message.type === 'ack') {
        if (unacked.delete(message.id)) persistUnacked();
      } else if (message.type === 'status') syncStore.setState({ status: message.status, lastError: message.lastError });
      else if (message.type === 'leader') resendUnacked();
    }
  }

  function resendUnacked(): void {
    for (const [id, { diff }] of unacked) post({ type: 'club-diff', id, diff });
  }

  /** Reloads the persisted club store without taking the reload for a local edit. */
  async function reloadClub(): Promise<void> {
    reloading = true;
    try {
      await club.rehydrate();
    } finally {
      reloading = false;
      baseline = club.getData();
    }
  }

  /** Local edits while not leading (idle or follower); the leader's engine watches its own. */
  function onLocalClubChange(): void {
    if (currentRole === 'leader') return;
    const next = club.getData();
    const previous = baseline;
    baseline = next;
    if (reloading || !previous) return;
    const diff = diffClubState(previous, next);
    if (diff.records.length === 0 && diff.events.length === 0) return;
    const id = deps.newId();
    unacked.set(id, { diff, madeAt: now() });
    persistUnacked();
    if (currentRole === 'follower') post({ type: 'club-diff', id, diff });
  }

  function becomeFollower(): void {
    if (!started || currentRole !== 'idle') return;
    currentRole = 'follower';
    deps.persistence.setWritable(false);
    roleCleanups.push(
      deps.storageEvents.subscribe((key) => {
        if (key === deps.storageKeys.club) void reloadClub();
        else if (key === deps.storageKeys.sync) void syncStore.rehydrate();
      })
    );
    resendUnacked();
  }

  /** The lock was taken away while leading or promoting: back to follower. */
  function stepDown(): void {
    if (!started) return;
    generation += 1; // abandons a promotion still reloading
    clearRoleListeners();
    if (currentRole === 'leader') engine.stop();
    currentRole = 'idle';
    baseline = club.getData();
    sharedStatus = null;
    becomeFollower();
  }

  function shareStatus(): void {
    const { status, lastError } = syncStore.getState();
    const key = `${status}:${lastError ?? ''}`;
    if (key === sharedStatus) return;
    sharedStatus = key;
    post({ type: 'status', status, lastError });
  }

  /** `reload`: catch up with what the previous leader persisted before taking over. */
  async function lead(reload: boolean): Promise<void> {
    if (!started || currentRole === 'leader') return;
    const gen = generation;
    clearRoleListeners();
    if (reload) {
      await reloadClub();
      await syncStore.rehydrate();
      if (gen !== generation) return;
    }
    deps.persistence.setWritable(true);
    currentRole = 'leader';
    deps.onLeader?.();
    engine.start();
    roleCleanups.push(syncStore.subscribe(shareStatus));
    shareStatus();
    // Edits made before leading that no leader confirmed, after those closed tabs
    // left: enqueued here (the reload may already hold them, so re-applying alone
    // would not be seen as a change), then re-applied in case the reload dropped them.
    // Each one is replayed at the time it was made, without the changes a newer
    // local version already superseded, so a stale edit never rewinds the data.
    const pending = new Map<string, { diff: ClubDiff; madeAt?: number }>(
      (deps.handoff?.drain() ?? []).map(({ id, diff, madeAt }) => [id, { diff, madeAt }])
    );
    for (const [id, edit] of unacked) pending.set(id, edit);
    unacked.clear();
    persistUnacked();
    for (const { diff, madeAt } of pending.values()) {
      const fresh = madeAt === undefined ? diff : dropSupersededChanges(diff, madeAt, syncStore.getState().versions);
      if (fresh.records.length === 0 && fresh.events.length === 0) continue;
      engine.enqueue(fresh, madeAt);
      club.applyData(applyClubDiff(club.getData(), fresh));
    }
    post({ type: 'leader' });
  }

  return {
    start() {
      if (started) return;
      started = true;
      generation += 1;
      if (channel) channelCleanup = channel.subscribe(onMessage);
      deps.visibility?.start();
      if (!deps.lock || !channel) {
        void lead(false);
        return;
      }
      deps.persistence.setWritable(false);
      baseline = club.getData();
      clubCleanup = club.subscribe(onLocalClubChange);
      releaseLock = deps.lock.request(() => void lead(true), becomeFollower, stepDown);
    },

    stop() {
      if (!started) return;
      started = false;
      generation += 1;
      releaseLock?.();
      releaseLock = null;
      channelCleanup?.();
      channelCleanup = null;
      clubCleanup?.();
      clubCleanup = null;
      clearRoleListeners();
      if (currentRole === 'leader') engine.stop();
      deps.visibility?.stop();
      // Out of the tab roles (logout): this tab writes again, e.g. the sync data reset.
      deps.persistence.setWritable(true);
      currentRole = 'idle';
      unacked.clear();
      persistUnacked();
      baseline = null;
      sharedStatus = null;
    },

    role: () => currentRole,

    async requestSyncNow() {
      if (currentRole === 'follower') post({ type: 'sync-now' });
      else await engine.syncNow();
    },

    async flush() {
      if (currentRole === 'follower') return countPending(syncStore.getState().outbox);
      return engine.flush();
    },
  };
}
