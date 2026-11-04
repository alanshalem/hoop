import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createEditHandoff, type HandoffEdit } from './edit-handoff';
import { createLeaseLeaderLock, LEASE_RENEW_MS, LEASE_SETTLE_MS, LEASE_TTL_MS, SYNC_LEADER_LEASE_KEY } from './leader-lease';
import { createEmptyOutbox, enqueueChanges } from './outbox';
import { createSyncEngine, SYNC_POLL_INTERVAL_MS, type SyncEngine, type SyncEngineDeps } from './sync-engine';
import {
  createSyncTabCoordinator,
  parseTabMessage,
  TAB_PROTOCOL_VERSION,
  type EditHandoffPort,
  type KeyValueStoragePort,
  type LeaderLockPort,
  type SyncTabCoordinatorDeps,
  type TabMessage,
} from './tab-coordinator';
import type { SyncableClubData } from './record-kinds';
import type { SyncStoreData } from './sync-types';
import { makeClubData, makeDivision, makeMatch, makePlayer, makeTeam } from '@/core/testing/fixtures';

const KEYS = { club: 'club-key', sync: 'sync-key' };

interface HarnessOptions {
  withLock?: boolean;
  withChannel?: boolean;
  realEngine?: boolean;
  /** Overrides of the real engine's offline defaults (with `realEngine`). */
  engineDeps?: Partial<SyncEngineDeps>;
  /** Replaces the scripted fake lock (e.g. a real lease lock). */
  lock?: LeaderLockPort;
  handoff?: EditHandoffPort;
  /** Logs the shared visibility lifecycle (./tab-visibility.ts). */
  withVisibility?: boolean;
}

function harness({
  withLock = true,
  withChannel = true,
  realEngine = false,
  engineDeps,
  lock,
  handoff,
  withVisibility = false,
}: HarnessOptions = {}) {
  const log: string[] = [];
  let data: SyncableClubData = makeClubData({
    divisions: [makeDivision()],
    teams: [makeTeam()],
    players: [makePlayer({ id: 'p1' })],
    matches: [makeMatch()],
  });
  const clubListeners = new Set<() => void>();
  const setData = (next: SyncableClubData) => {
    data = next;
    clubListeners.forEach((listener) => listener());
  };
  let store: SyncStoreData = {
    owner: null,
    cursor: '5',
    versions: {},
    outbox: createEmptyOutbox(),
    lastSyncedAt: null,
    status: 'idle',
    lastError: null,
    epoch: 'epoch-1',
  };
  const storeListeners = new Set<() => void>();
  const posted: TabMessage[] = [];
  const channelListeners = new Set<(message: unknown) => void>();
  const storageListeners = new Set<(key: string) => void>();
  let lockCallbacks: { onAcquired: () => void; onQueued: () => void; onLost?: () => void } | null = null;
  /** Edits handed over through the (fake) persisted handoff, by save order. */
  const handoffSaves: HandoffEdit[][] = [];
  const handoffForgotten: string[] = [];
  let handoffLeft: HandoffEdit[] = [];
  let lockReleased = 0;
  let writable = true;
  /** What another tab persisted: applied on the next club rehydrate. */
  let persistedClub: SyncableClubData | null = null;
  let ids = 0;

  const fakeEngine: SyncTabCoordinatorDeps['engine'] = {
    start: () => log.push('engine.start'),
    stop: () => log.push('engine.stop'),
    syncNow: async () => {
      log.push('engine.syncNow');
    },
    flush: async () => {
      log.push('engine.flush');
      return 0;
    },
    enqueue: (diff) => log.push(`engine.enqueue:${diff.records.map((record) => `${record.kind}:${record.id}`).join(',')}`),
  };

  const deps: SyncTabCoordinatorDeps = {
    engine: fakeEngine,
    club: {
      getData: () => data,
      applyData: (next) => setData(next),
      subscribe: (listener) => {
        clubListeners.add(listener);
        return () => clubListeners.delete(listener);
      },
      rehydrate: async () => {
        log.push('club.rehydrate');
        if (persistedClub) setData(persistedClub);
      },
    },
    syncStore: {
      getState: () => store,
      setState: (patch) => {
        store = { ...store, ...patch };
        storeListeners.forEach((listener) => listener());
      },
      subscribe: (listener) => {
        storeListeners.add(listener);
        return () => storeListeners.delete(listener);
      },
      rehydrate: async () => {
        log.push('sync.rehydrate');
      },
    },
    lock:
      lock ??
      (withLock
        ? {
            request: (onAcquired, onQueued, onLost) => {
              lockCallbacks = { onAcquired, onQueued, onLost };
              return () => {
                lockReleased += 1;
              };
            },
          }
        : null),
    handoff: handoff ?? {
      save: (edits) => {
        handoffSaves.push([...edits]);
      },
      forget: (editId) => {
        handoffForgotten.push(editId);
      },
      drain: () => {
        const drained = handoffLeft;
        handoffLeft = [];
        log.push(`handoff.drain:${drained.length}`);
        return drained;
      },
    },
    channel: withChannel
      ? {
          post: (message) => posted.push(message),
          subscribe: (listener) => {
            channelListeners.add(listener);
            return () => channelListeners.delete(listener);
          },
        }
      : null,
    storageEvents: {
      subscribe: (listener) => {
        storageListeners.add(listener);
        return () => storageListeners.delete(listener);
      },
    },
    persistence: {
      setWritable: (value) => {
        writable = value;
        log.push(`writable:${value}`);
      },
    },
    storageKeys: KEYS,
    visibility: withVisibility
      ? { start: () => log.push('visibility.start'), stop: () => log.push('visibility.stop') }
      : undefined,
    onLeader: () => log.push('onLeader'),
    newId: () => `msg-${++ids}`,
  };

  if (realEngine) {
    // Offline: the engine keeps everything in the outbox, so the test can inspect it.
    const engine: SyncEngine = createSyncEngine({
      api: {
        pull: async () => ({ ok: false, error: 'NETWORK' }),
        push: async () => ({ ok: false, error: 'NETWORK' }),
      },
      club: deps.club,
      store: deps.syncStore,
      connectivity: { isOnline: () => false, subscribe: () => () => undefined },
      onUnauthorized: () => undefined,
      now: () => Date.parse('2026-10-30T18:00:00.000Z'),
      timers: { setTimeout: () => 0, clearTimeout: () => undefined },
      ...engineDeps,
    });
    deps.engine = engine;
  }

  const coordinator = createSyncTabCoordinator(deps);
  const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));
  return {
    coordinator,
    log,
    posted,
    get data() {
      return data;
    },
    setData,
    get store() {
      return store;
    },
    setStore: deps.syncStore.setState,
    get writable() {
      return writable;
    },
    get lockReleased() {
      return lockReleased;
    },
    acquire: async () => {
      lockCallbacks?.onAcquired();
      await flushMicrotasks();
    },
    queue: () => lockCallbacks?.onQueued(),
    lose: () => lockCallbacks?.onLost?.(),
    handoffSaves,
    handoffForgotten,
    /** Edits other (closed) tabs left in the persisted handoff. */
    leaveInHandoff: (edits: HandoffEdit[]) => {
      handoffLeft = edits;
    },
    receive: async (message: unknown) => {
      channelListeners.forEach((listener) => listener(message));
      await flushMicrotasks();
    },
    storageEvent: async (key: string, persisted?: SyncableClubData) => {
      persistedClub = persisted ?? null;
      storageListeners.forEach((listener) => listener(key));
      await flushMicrotasks();
    },
    flushMicrotasks,
  };
}

const message = <T extends Omit<TabMessage, 'v'>>(body: T) => ({ v: TAB_PROTOCOL_VERSION, ...body });

describe('sync tab coordinator (S13.3)', () => {
  it('runs the tab visibility while it runs, as follower or leader (S4, L8)', async () => {
    const follower = harness({ withVisibility: true });
    follower.coordinator.start();
    follower.queue();
    assert.strictEqual(follower.coordinator.role(), 'follower');
    assert.deepStrictEqual(follower.log.filter((entry) => entry.startsWith('visibility')), ['visibility.start']);
    follower.coordinator.stop();
    assert.deepStrictEqual(follower.log.slice(-2), ['visibility.stop', 'writable:true']);

    const leader = harness({ withLock: false, withVisibility: true });
    leader.coordinator.start();
    await leader.flushMicrotasks();
    assert.strictEqual(leader.log[0], 'visibility.start', 'before the engine starts polling');
    leader.coordinator.stop();
    assert.deepStrictEqual(leader.log.slice(-3), ['engine.stop', 'visibility.stop', 'writable:true']);
  });

  it('accepts visibility messages only with a tab id and a boolean', () => {
    assert.ok(parseTabMessage(message({ type: 'visibility', tabId: 't', visible: false })));
    assert.strictEqual(parseTabMessage(message({ type: 'visibility', tabId: 't' })), null);
    assert.strictEqual(parseTabMessage(message({ type: 'visibility', visible: true })), null);
  });

  it('leads at once without any leader lock (current behaviour)', async () => {
    const tab = harness({ withLock: false });
    tab.coordinator.start();
    await tab.flushMicrotasks();
    assert.strictEqual(tab.coordinator.role(), 'leader');
    assert.deepStrictEqual(tab.log, ['writable:true', 'onLeader', 'engine.start', 'handoff.drain:0']);
    assert.strictEqual(tab.writable, true);
  });

  it('keeps the persisted stores read-only until the tab role is known (no pre-lock writes)', () => {
    const tab = harness();
    tab.coordinator.start();
    assert.strictEqual(tab.coordinator.role(), 'idle');
    assert.strictEqual(tab.writable, false);
    assert.deepStrictEqual(tab.log, ['writable:false']);
  });

  it('leads at once without BroadcastChannel, since followers could not hand over their edits', async () => {
    const tab = harness({ withChannel: false });
    tab.coordinator.start();
    await tab.flushMicrotasks();
    assert.strictEqual(tab.coordinator.role(), 'leader');
    assert.ok(tab.log.includes('engine.start'));
  });

  it('starts the engine only once the lock is held, after the persisted state is reloaded', async () => {
    const tab = harness();
    tab.coordinator.start();
    assert.strictEqual(tab.coordinator.role(), 'idle');
    await tab.acquire();
    assert.strictEqual(tab.coordinator.role(), 'leader');
    assert.deepStrictEqual(tab.log, [
      'writable:false',
      'club.rehydrate',
      'sync.rehydrate',
      'writable:true',
      'onLeader',
      'engine.start',
      'handoff.drain:0',
    ]);
  });

  it('a leader that loses its lease steps down to follower: engine stopped, read-only, edits forwarded', async () => {
    const tab = harness();
    tab.coordinator.start();
    await tab.acquire();
    tab.lose();
    assert.strictEqual(tab.coordinator.role(), 'follower');
    assert.ok(tab.log.includes('engine.stop'));
    assert.strictEqual(tab.writable, false);

    tab.posted.length = 0;
    const edited = { ...tab.data.players[0], dorsal: 31 };
    tab.setData({ ...tab.data, players: [edited] });
    assert.deepStrictEqual(tab.posted.map((posted) => posted.type), ['club-diff']);

    await tab.acquire();
    assert.strictEqual(tab.coordinator.role(), 'leader', 'it can lead again later');
  });

  it('persists unacknowledged follower edits for the next leader and forgets them once acknowledged', async () => {
    const tab = harness();
    tab.coordinator.start();
    tab.queue();
    const edited = { ...tab.data.players[0], dorsal: 21 };
    tab.setData({ ...tab.data, players: [edited] });
    assert.deepStrictEqual(tab.handoffSaves.at(-1)?.map((saved) => saved.id), ['msg-1']);
    await tab.receive(message({ type: 'ack', id: 'msg-1' }));
    assert.deepStrictEqual(tab.handoffSaves.at(-1), []);
  });

  it('a new leader drains the edits closed follower tabs left in the handoff (real sync engine)', async () => {
    const tab = harness({ realEngine: true });
    tab.coordinator.start();
    const fromClosedTab = makePlayer({ id: 'p1', dorsal: 88 });
    tab.leaveInHandoff([
      { id: 'closed-1', diff: { records: [{ kind: 'player', id: 'p1', data: fromClosedTab, deleted: false }], events: [] } },
    ]);
    await tab.storageEvent('none', tab.data);
    await tab.acquire();

    const entry = tab.store.outbox.records['player:p1'];
    assert.ok(entry, 'the closed tab edit is in the outbox of the new leader');
    assert.strictEqual(entry.kind === 'player' && entry.data.dorsal, 88);
    assert.deepStrictEqual(tab.data.players, [fromClosedTab]);
  });

  it('a follower does not run the engine nor write the persisted stores', () => {
    const tab = harness();
    tab.coordinator.start();
    tab.queue();
    assert.strictEqual(tab.coordinator.role(), 'follower');
    assert.strictEqual(tab.writable, false);
    assert.ok(!tab.log.includes('engine.start'));
  });

  it('only the leader polls the server: a follower never pulls, a leader that steps down stops (S4)', async () => {
    const pulls: (string | null)[] = [];
    const timers: { ms: number; cleared: boolean }[] = [];
    const pendingPolls = () => timers.filter((timer) => timer.ms === SYNC_POLL_INTERVAL_MS && !timer.cleared).length;
    const tab = harness({
      realEngine: true,
      engineDeps: {
        api: {
          pull: async (since) => {
            pulls.push(since);
            return { ok: true, value: { records: [], events: [], cursor: since ?? '0', hasMore: false, epoch: 'epoch-1' } };
          },
          push: async () => ({ ok: false, error: 'NETWORK' }),
        },
        connectivity: { isOnline: () => true, subscribe: () => () => undefined },
        timers: {
          setTimeout: (_callback, ms) => {
            const timer = { ms, cleared: false };
            timers.push(timer);
            return timer;
          },
          clearTimeout: (handle) => {
            (handle as { cleared: boolean }).cleared = true;
          },
        },
      },
    });
    tab.coordinator.start();
    tab.queue();
    await tab.flushMicrotasks();
    assert.strictEqual(tab.coordinator.role(), 'follower');
    assert.deepStrictEqual(pulls, []);
    assert.strictEqual(pendingPolls(), 0);

    await tab.acquire();
    await tab.flushMicrotasks();
    assert.strictEqual(tab.coordinator.role(), 'leader');
    assert.deepStrictEqual(pulls, ['5']);
    assert.strictEqual(pendingPolls(), 1);

    tab.lose();
    assert.strictEqual(tab.coordinator.role(), 'follower');
    assert.strictEqual(pendingPolls(), 0, 'the poll stops with the engine');
  });

  it('a follower sends its local edits to the leader as a club diff', () => {
    const tab = harness();
    tab.coordinator.start();
    tab.queue();
    const edited = { ...tab.data.players[0], dorsal: 99 };
    tab.setData({ ...tab.data, players: [edited] });
    assert.deepStrictEqual(tab.posted, [
      message({
        type: 'club-diff',
        id: 'msg-1',
        diff: { records: [{ kind: 'player', id: 'p1', data: edited, deleted: false }], events: [] },
      }),
    ]);
  });

  it('a follower reloads the persisted stores on storage events without echoing them as edits', async () => {
    const tab = harness();
    tab.coordinator.start();
    tab.queue();
    const fromLeader = { ...tab.data, players: [makePlayer({ id: 'p1', dorsal: 42 })] };
    await tab.storageEvent(KEYS.club, fromLeader);
    await tab.storageEvent(KEYS.sync);
    await tab.storageEvent('unrelated-key');
    assert.deepStrictEqual(tab.data.players, fromLeader.players);
    assert.deepStrictEqual(tab.log.filter((entry) => entry.endsWith('rehydrate')), ['club.rehydrate', 'sync.rehydrate']);
    assert.deepStrictEqual(tab.posted, []);

    const edited = { ...fromLeader.players[0], dorsal: 7 };
    tab.setData({ ...tab.data, players: [edited] });
    assert.strictEqual(tab.posted.length, 1, 'later edits diff against the reloaded state');
  });

  it('the leader applies a follower diff to its store (so its engine enqueues it) and acknowledges it', async () => {
    const tab = harness();
    tab.coordinator.start();
    await tab.acquire();
    const edited = makePlayer({ id: 'p1', dorsal: 77 });
    await tab.receive(
      message({ type: 'club-diff', id: 'msg-9', diff: { records: [{ kind: 'player', id: 'p1', data: edited, deleted: false }], events: [] } })
    );
    assert.deepStrictEqual(tab.data.players, [edited]);
    assert.deepStrictEqual(tab.posted.at(-1), message({ type: 'ack', id: 'msg-9' }));
    assert.deepStrictEqual(tab.handoffForgotten, ['msg-9'], 'the sender may close before the ack: its handoff copy goes now');
  });

  it('ignores messages from another protocol version or with an unknown shape', async () => {
    const tab = harness();
    tab.coordinator.start();
    await tab.acquire();
    const before = tab.data;
    await tab.receive({ v: TAB_PROTOCOL_VERSION + 1, type: 'club-diff', id: 'x', diff: { records: [], events: [] } });
    await tab.receive({ type: 'sync-now' });
    await tab.receive('garbage');
    assert.strictEqual(tab.data, before);
    assert.ok(!tab.log.includes('engine.syncNow'));
  });

  it('the leader shares its sync status; followers show it', async () => {
    const leader = harness();
    leader.coordinator.start();
    await leader.acquire();
    leader.setStore({ status: 'offline' });
    leader.setStore({ cursor: '6' });
    assert.deepStrictEqual(
      leader.posted.filter((posted) => posted.type === 'status'),
      [message({ type: 'status', status: 'idle', lastError: null }), message({ type: 'status', status: 'offline', lastError: null })]
    );

    const follower = harness();
    follower.coordinator.start();
    follower.queue();
    await follower.receive(message({ type: 'status', status: 'error', lastError: 'Sin permiso' }));
    assert.strictEqual(follower.store.status, 'error');
    assert.strictEqual(follower.store.lastError, 'Sin permiso');
  });

  it('a follower asks the leader to sync now; the leader runs it', async () => {
    const follower = harness();
    follower.coordinator.start();
    follower.queue();
    await follower.coordinator.requestSyncNow();
    assert.deepStrictEqual(follower.posted, [message({ type: 'sync-now' })]);
    assert.ok(!follower.log.includes('engine.syncNow'));

    const leader = harness();
    leader.coordinator.start();
    await leader.acquire();
    await leader.receive(message({ type: 'sync-now' }));
    assert.ok(leader.log.includes('engine.syncNow'));
  });

  it('a follower cannot flush: it reports what is pending in the shared outbox', async () => {
    const tab = harness();
    tab.coordinator.start();
    tab.queue();
    const { outbox } = enqueueChanges(
      { outbox: createEmptyOutbox(), versions: {} },
      { records: [{ kind: 'player', id: 'p1', data: makePlayer(), deleted: false }], events: [] },
      Date.parse('2026-10-30T18:00:00.000Z')
    );
    tab.setStore({ outbox });
    assert.strictEqual(await tab.coordinator.flush(), 1);
    assert.ok(!tab.log.includes('engine.flush'));
  });

  it('takes over when the leader closes and re-applies edits the old leader never acknowledged', async () => {
    const tab = harness();
    tab.coordinator.start();
    tab.queue();
    const acked = { ...tab.data.players[0], dorsal: 10 };
    tab.setData({ ...tab.data, players: [acked] });
    await tab.receive(message({ type: 'ack', id: 'msg-1' }));
    const lost = { ...acked, dorsal: 11 };
    tab.setData({ ...tab.data, players: [lost] });
    const persistedByOldLeader = { ...tab.data, players: [acked] };

    await tab.storageEvent('none');
    // The old leader persisted the acknowledged edit only; then its tab closed.
    await tab.storageEvent(KEYS.club, persistedByOldLeader);
    assert.deepStrictEqual(tab.data.players, [acked]);
    await tab.acquire();

    assert.strictEqual(tab.coordinator.role(), 'leader');
    assert.strictEqual(tab.writable, true);
    assert.deepStrictEqual(tab.data.players, [lost], 'the unacknowledged edit is applied after the engine started');
    const startAt = tab.log.indexOf('engine.start');
    assert.ok(startAt > tab.log.lastIndexOf('club.rehydrate'));
    assert.deepStrictEqual(tab.log.slice(startAt + 1).filter((entry) => entry.startsWith('engine.')), ['engine.enqueue:player:p1'], 'only the unacknowledged edit is enqueued');
    assert.deepStrictEqual(tab.posted.at(-1), message({ type: 'leader' }));
  });

  it('a follower edit is enqueued even if the leader closed before applying it (real sync engine)', async () => {
    const tab = harness({ realEngine: true });
    tab.coordinator.start();
    tab.queue();
    const persistedByOldLeader = tab.data;
    const edited = { ...tab.data.players[0], dorsal: 55 };
    tab.setData({ ...tab.data, players: [edited] });
    assert.strictEqual(tab.posted.length, 1, 'the diff went to the leader, which closed without acknowledging it');

    await tab.storageEvent(KEYS.club, persistedByOldLeader);
    await tab.acquire();

    const entry = tab.store.outbox.records['player:p1'];
    assert.ok(entry, 'the edit is in the outbox of the new leader');
    assert.strictEqual(entry.kind === 'player' && entry.data.dorsal, 55);
    assert.deepStrictEqual(tab.data.players, [edited]);
  });

  it('an edit made before the lock is decided is enqueued when this tab becomes the leader', async () => {
    const tab = harness({ realEngine: true });
    tab.coordinator.start();
    const edited = { ...tab.data.players[0], dorsal: 66 };
    tab.setData({ ...tab.data, players: [edited] });
    // No other tab: the lock arrives; the reload returns what this tab persisted (the edit).
    await tab.storageEvent('none', tab.data);
    await tab.acquire();

    const entry = tab.store.outbox.records['player:p1'];
    assert.ok(entry);
    assert.strictEqual(entry.kind === 'player' && entry.data.dorsal, 66);
  });

  it('an edit made before the lock is decided goes to the leader once this tab turns out to be a follower', () => {
    const tab = harness();
    tab.coordinator.start();
    const edited = { ...tab.data.players[0], dorsal: 67 };
    tab.setData({ ...tab.data, players: [edited] });
    assert.strictEqual(tab.posted.length, 0, 'nobody to send it to yet');
    tab.queue();
    assert.deepStrictEqual(tab.posted.map((posted) => posted.type), ['club-diff']);
  });

  it('a follower re-sends unacknowledged edits when a new leader announces itself (edit made while no tab led)', async () => {
    const tab = harness();
    tab.coordinator.start();
    tab.queue();
    tab.setData({ ...tab.data, players: [{ ...tab.data.players[0], dorsal: 12 }] });
    tab.setData({ ...tab.data, players: [{ ...tab.data.players[0], dorsal: 13 }] });
    await tab.receive(message({ type: 'ack', id: 'msg-1' }));
    tab.posted.length = 0;

    await tab.receive(message({ type: 'leader' }));
    assert.deepStrictEqual(tab.posted.map((posted) => posted.type === 'club-diff' && posted.id), ['msg-2']);
  });

  it('hands a follower edit over through the localStorage lease when the leader tab dies (no Web Locks)', async () => {
    let now = Date.parse('2026-10-30T18:00:00.000Z');
    const timers = new Map<number, { at: number; callback: () => void }>();
    let nextTimer = 1;
    const advance = async (ms: number) => {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort(([, a], [, b]) => a.at - b.at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = Math.max(now, due[1].at);
        due[1].callback();
        await new Promise((resolve) => setImmediate(resolve));
      }
      now = end;
    };
    const items = new Map<string, string>();
    const storage: KeyValueStoragePort = {
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => items.set(key, value),
      removeItem: (key) => items.delete(key),
      keys: () => [...items.keys()],
    };
    // Another tab leads: it holds a valid lease, then dies without releasing it.
    items.set(SYNC_LEADER_LEASE_KEY, JSON.stringify({ tabId: 'dead-tab', expiresAt: now + LEASE_TTL_MS }));
    const lock = createLeaseLeaderLock({
      storage,
      storageEvents: { subscribe: () => () => undefined },
      tabId: 'this-tab',
      now: () => now,
      timers: {
        setTimeout: (callback, ms) => {
          const id = nextTimer++;
          timers.set(id, { at: now + ms, callback });
          return id;
        },
        clearTimeout: (handle) => timers.delete(handle as number),
      },
    });
    const handoff = createEditHandoff({ storage, tabId: 'this-tab', owner: () => 'user-1', now: () => now });
    const tab = harness({ realEngine: true, lock, handoff });
    tab.coordinator.start();
    assert.strictEqual(tab.coordinator.role(), 'follower');

    const edited = { ...tab.data.players[0], dorsal: 44 };
    tab.setData({ ...tab.data, players: [edited] });
    assert.deepStrictEqual(tab.posted.map((posted) => posted.type), ['club-diff'], 'sent to the (dead) leader');
    assert.ok(items.has('hoop-sync-handoff:this-tab'), 'kept for the next leader');

    await advance(LEASE_TTL_MS + LEASE_RENEW_MS + LEASE_SETTLE_MS);
    assert.strictEqual(tab.coordinator.role(), 'leader');
    const entry = tab.store.outbox.records['player:p1'];
    assert.strictEqual(entry?.kind === 'player' && entry.data.dorsal, 44);
    assert.ok(!items.has('hoop-sync-handoff:this-tab'), 'drained once enqueued');
  });

  it('stop releases the lock, stops the engine and re-enables persistence', async () => {
    const tab = harness();
    tab.coordinator.start();
    await tab.acquire();
    tab.coordinator.stop();
    assert.strictEqual(tab.coordinator.role(), 'idle');
    assert.strictEqual(tab.lockReleased, 1);
    assert.ok(tab.log.includes('engine.stop'));
    assert.strictEqual(tab.writable, true);

    const follower = harness();
    follower.coordinator.start();
    follower.queue();
    follower.coordinator.stop();
    assert.strictEqual(follower.writable, true);
    follower.setData({ ...follower.data, players: [] });
    assert.deepStrictEqual(follower.posted, [], 'a stopped tab no longer forwards edits');
  });
});
