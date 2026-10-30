import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createEditHandoff } from '@/core/application/sync/edit-handoff';
import { createEmptyOutbox } from '@/core/application/sync/outbox';
import { createSyncEngine } from '@/core/application/sync/sync-engine';
import { createSyncTabCoordinator, type KeyValueStoragePort, type TabMessage } from '@/core/application/sync/tab-coordinator';
import type { SyncableClubData, SyncStoreData } from '@/core/application/sync/sync-types';
import type { Match } from '@/core/domain/entities/match.types';
import { makeDivision, makeMatch, makePlayer, makeTeam } from '@/core/testing/fixtures';

// Regression tests from the independent verification of T14 (L25): several tabs of one
// browser sharing localStorage handoff keys, a BroadcastChannel bus and scripted locks.

const flush = () => new Promise((resolve) => setImmediate(resolve));

function browser(initial: SyncableClubData, owner = 'u1') {
  const items = new Map<string, string>();
  const storage: KeyValueStoragePort = {
    getItem: (k) => items.get(k) ?? null,
    setItem: (k, v) => void items.set(k, v),
    removeItem: (k) => void items.delete(k),
    keys: () => [...items.keys()],
  };
  let persistedClub = initial;
  const bus = new Map<string, (m: unknown) => void>();
  const dead = new Set<string>();
  let clock = Date.parse('2026-10-30T18:00:00.000Z');
  let ids = 0;
  function tab(name: string) {
    let data = persistedClub;
    let writable = false;
    const clubListeners = new Set<() => void>();
    const setData = (next: SyncableClubData) => {
      data = next;
      if (writable) persistedClub = next;
      clubListeners.forEach((l) => l());
    };
    let store: SyncStoreData = { owner, cursor: '1', versions: {}, outbox: createEmptyOutbox(), lastSyncedAt: null, status: 'idle', lastError: null };
    const storeListeners = new Set<() => void>();
    const club = {
      getData: () => data,
      applyData: setData,
      subscribe: (l: () => void) => {
        clubListeners.add(l);
        return () => clubListeners.delete(l);
      },
    };
    const syncPort = {
      getState: () => store,
      setState: (p: Partial<SyncStoreData>) => {
        store = { ...store, ...p };
        storeListeners.forEach((l) => l());
      },
    };
    const engine = createSyncEngine({
      api: { pull: async () => ({ ok: false, error: 'NETWORK' }), push: async () => ({ ok: false, error: 'NETWORK' }) },
      club,
      store: syncPort,
      connectivity: { isOnline: () => false, subscribe: () => () => undefined },
      onUnauthorized: () => undefined,
      now: () => clock,
      timers: { setTimeout: () => 0, clearTimeout: () => undefined },
    });
    let callbacks: { acquired: () => void; queued: () => void } | null = null;
    const coordinator = createSyncTabCoordinator({
      engine,
      club: {
        ...club,
        rehydrate: async () => {
          data = persistedClub;
          clubListeners.forEach((l) => l());
        },
      },
      syncStore: {
        ...syncPort,
        subscribe: (l) => {
          storeListeners.add(l);
          return () => storeListeners.delete(l);
        },
        rehydrate: async () => undefined,
      },
      lock: {
        request: (acquired, queued) => {
          callbacks = { acquired, queued };
          return () => undefined;
        },
      },
      handoff: createEditHandoff({ storage, tabId: name, owner: () => owner, now: () => clock }),
      channel: {
        post: (m: TabMessage) => {
          if (dead.has(name)) return;
          for (const [other, deliver] of bus) {
            if (other !== name && !dead.has(other)) {
              queueMicrotask(() => {
                if (!dead.has(other)) deliver(m);
              });
            }
          }
        },
        subscribe: (l) => {
          bus.set(name, l);
          return () => bus.delete(name);
        },
      },
      storageEvents: { subscribe: () => () => undefined },
      persistence: {
        setWritable: (v) => {
          writable = v;
        },
      },
      storageKeys: { club: 'club', sync: 'sync' },
      newId: () => `${name}-${++ids}`,
    });
    coordinator.start();
    return {
      coordinator,
      get data() {
        return data;
      },
      get store() {
        return store;
      },
      edit: (fn: (m: Match) => Match) => setData({ ...data, matches: data.matches.map(fn) }),
      acquire: async () => {
        callbacks?.acquired();
        await flush();
      },
      queue: () => callbacks?.queued(),
      /** The tab closes right now: no further messages in or out, no stop(). */
      kill: () => {
        dead.add(name);
        bus.delete(name);
      },
    };
  }
  return {
    tab,
    storage,
    items,
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

const club = (m: Match): SyncableClubData => ({ divisions: [makeDivision()], teams: [makeTeam()], players: [makePlayer({ id: 'p1' })], matches: [m] });
const live = makeMatch({ status: 'LIVE', currentQuarter: 'Q2', quarterTimeRemainingSeconds: 300, events: [] });
const gameState = (m: Pick<Match, 'status' | 'currentQuarter' | 'quarterTimeRemainingSeconds'>) => ({
  status: m.status,
  currentQuarter: m.currentQuarter,
  quarterTimeRemainingSeconds: m.quarterTimeRemainingSeconds,
});

describe('tab handoff regressions (S13.3)', () => {
  it('an edit made while no tab leads survives its tab closing and is drained once by the next leader', async () => {
    const b = browser(club(live));
    const l = b.tab('L');
    await l.acquire();
    const f = b.tab('F');
    f.queue();
    await flush();
    l.kill();
    b.tick(1000);
    f.edit((m) => ({ ...m, venue: 'Gimnasio Norte' }));
    await flush();
    f.kill();
    const n = b.tab('N');
    await n.acquire();
    assert.strictEqual(n.data.matches[0].venue, 'Gimnasio Norte');
    assert.ok(n.store.outbox.records['match:m-test'], 'enqueued');
    assert.deepStrictEqual(b.storage.keys().filter((k) => k.startsWith('hoop-sync-handoff:')), [], 'drained');
  });

  it("another user's handoff is discarded, never applied", async () => {
    const b = browser(club(live));
    b.items.set(
      'hoop-sync-handoff:X',
      JSON.stringify({
        v: 1,
        owner: 'u2',
        savedAt: 1,
        edits: [{ id: 'x', diff: { records: [{ kind: 'match', id: 'm-test', deleted: false, data: { ...live, venue: 'otro' }, changedFields: ['venue'] }], events: [] } }],
      })
    );
    const n = b.tab('N');
    await n.acquire();
    assert.notStrictEqual(n.data.matches[0].venue, 'otro');
    assert.strictEqual(b.items.has('hoop-sync-handoff:X'), false);
  });

  it('a follower console closing (clock saved on pagehide, ack never received) does not rewind the game later', async () => {
    const b = browser(club(live));
    const l = b.tab('L');
    await l.acquire();
    const f = b.tab('F');
    f.queue();
    await flush();
    b.tick(1000);
    f.edit((m) => ({ ...m, quarterTimeRemainingSeconds: 250 }));
    f.kill();
    await flush();
    assert.strictEqual(l.data.matches[0].quarterTimeRemainingSeconds, 250, 'the leader applied it');
    b.tick(60_000);
    l.edit((m) => ({ ...m, status: 'LIVE', currentQuarter: 'Q3', quarterTimeRemainingSeconds: 420 }));
    l.kill();
    b.tick(1000);
    const n = b.tab('N');
    await n.acquire();
    assert.deepStrictEqual(gameState(n.data.matches[0]), { status: 'LIVE', currentQuarter: 'Q3', quarterTimeRemainingSeconds: 420 }, 'local game state rewound');
    const entry = n.store.outbox.records['match:m-test'];
    if (entry && entry.kind === 'match' && !entry.deleted) {
      assert.deepStrictEqual(
        gameState(entry.data),
        { status: 'LIVE', currentQuarter: 'Q3', quarterTimeRemainingSeconds: 420 },
        'stale clock pushed with a fresh game-state version'
      );
    }
  });
});
