import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createSyncEngine, type SyncEngineDeps } from './sync-engine';
import { createEmptyOutbox } from './outbox';
import { toMatchRecord } from './sync-records';
import type {
  ApiResult,
  PullPage,
  PushPayload,
  PushResult,
  SyncableClubData,
  SyncStoreData,
} from './sync-types';
import { makeDivision, makeMatch, makePlayer, makeTeam } from '@/core/testing/fixtures';

const NOW = Date.parse('2026-10-30T18:00:00.000Z');

type Responder<T> = ApiResult<T> | (() => ApiResult<T>);

function harness(initial: Partial<SyncStoreData> = {}) {
  let data: SyncableClubData = {
    divisions: [makeDivision({ id: 'div-local-seed' })],
    teams: [makeTeam()],
    players: [makePlayer({ id: 'p1' })],
    matches: [],
  };
  const clubListeners = new Set<() => void>();
  let store: SyncStoreData = {
    cursor: null,
    versions: {},
    outbox: createEmptyOutbox(),
    lastSyncedAt: null,
    status: 'idle',
    lastError: null,
    ...initial,
  };
  const pulls: (string | null)[] = [];
  const pushes: PushPayload[] = [];
  const pullQueue: Responder<PullPage>[] = [];
  const pushQueue: Responder<PushResult>[] = [];
  const timers: { fn: () => void; ms: number; cleared: boolean }[] = [];
  const connectivityListeners = new Set<(online: boolean) => void>();
  let streamListener: ((cursor: string) => void) | null = null;
  let online = true;
  let unauthorized = 0;

  const respond = <T>(queue: Responder<T>[], fallback: ApiResult<T>): ApiResult<T> => {
    const next = queue.shift() ?? fallback;
    return typeof next === 'function' ? next() : next;
  };

  const deps: SyncEngineDeps = {
    api: {
      pull: async (since) => {
        pulls.push(since);
        return respond(pullQueue, { ok: true, value: { records: [], events: [], cursor: since ?? '0', hasMore: false } });
      },
      push: async (payload) => {
        pushes.push(payload);
        const ids = [...payload.records.map((r) => r.id), ...payload.events.map((e) => e.id)];
        return respond(pushQueue, { ok: true, value: { accepted: ids, rejected: [], cursor: '999' } });
      },
    },
    club: {
      getData: () => data,
      applyData: (next) => {
        data = next;
        clubListeners.forEach((listener) => listener());
      },
      subscribe: (listener) => {
        clubListeners.add(listener);
        return () => clubListeners.delete(listener);
      },
    },
    store: {
      getState: () => store,
      setState: (patch) => {
        store = { ...store, ...patch };
      },
    },
    connectivity: {
      isOnline: () => online,
      subscribe: (listener) => {
        connectivityListeners.add(listener);
        return () => connectivityListeners.delete(listener);
      },
    },
    openChangeStream: (listener) => {
      streamListener = listener;
      return () => {
        streamListener = null;
      };
    },
    onUnauthorized: () => {
      unauthorized += 1;
    },
    now: () => NOW,
    timers: {
      setTimeout: (fn, ms) => {
        timers.push({ fn, ms, cleared: false });
        return timers.length - 1;
      },
      clearTimeout: (handle) => {
        if (typeof handle === 'number' && timers[handle]) timers[handle].cleared = true;
      },
    },
  };

  const engine = createSyncEngine(deps);
  return {
    engine,
    pulls,
    pushes,
    pullQueue,
    pushQueue,
    timers,
    get data() {
      return data;
    },
    get store() {
      return store;
    },
    get unauthorized() {
      return unauthorized;
    },
    /** A local edit made by the app (goes through the club store, not the engine). */
    edit(next: Partial<SyncableClubData>) {
      data = { ...data, ...next };
      clubListeners.forEach((listener) => listener());
    },
    setOnline(value: boolean) {
      online = value;
      connectivityListeners.forEach((listener) => listener(value));
    },
    emitChanged(cursor: string) {
      streamListener?.(cursor);
    },
    async runPendingTimers() {
      for (const timer of timers.splice(0)) if (!timer.cleared) timer.fn();
      await engine.whenIdle();
    },
  };
}

const snapshotPage = (cursor: string, hasMore = false): ApiResult<PullPage> => ({
  ok: true,
  value: {
    records: [
      { kind: 'division', id: 'div-server', data: makeDivision({ id: 'div-server' }), updatedAt: '2026-10-29T10:00:00.000Z', deleted: false },
      { kind: 'match', id: 'm-server', data: toMatchRecord(makeMatch({ id: 'm-server' })), updatedAt: '2026-10-29T10:00:00.000Z', deleted: false },
    ],
    events: [],
    cursor,
    hasMore,
  },
});

describe('sync engine (S10.7)', () => {
  it('replaces local seed data with the server snapshot on the first sync, without pushing it', async () => {
    const h = harness();
    h.pullQueue.push(snapshotPage('40'));
    h.engine.start();
    await h.engine.whenIdle();

    assert.deepStrictEqual(h.pulls, [null]);
    assert.deepStrictEqual(h.pushes, []);
    assert.deepStrictEqual(h.data.divisions.map((d) => d.id), ['div-server']);
    assert.deepStrictEqual(h.data.players, []);
    assert.strictEqual(h.store.cursor, '40');
    assert.strictEqual(h.store.versions['division:div-server'], '2026-10-29T10:00:00.000Z');
    assert.deepStrictEqual(h.store.outbox, createEmptyOutbox(), 'applied pull data is never re-enqueued');
    assert.strictEqual(h.store.status, 'idle');
    assert.strictEqual(h.store.lastSyncedAt, '2026-10-30T18:00:00.000Z');
    h.engine.stop();
  });

  it('follows hasMore and stores the cursor of the last page', async () => {
    const h = harness({ cursor: '5' });
    h.pullQueue.push(
      { ok: true, value: { records: [], events: [], cursor: '1005', hasMore: true } },
      { ok: true, value: { records: [], events: [], cursor: '1200', hasMore: false } }
    );
    h.engine.start();
    await h.engine.whenIdle();
    assert.deepStrictEqual(h.pulls, ['5', '1005']);
    assert.strictEqual(h.store.cursor, '1200');
    h.engine.stop();
  });

  it('enqueues local changes with updatedAt and flushes them after the debounce', async () => {
    const h = harness({ cursor: '10' });
    h.engine.start();
    await h.engine.whenIdle();

    const edited = { ...h.data.players[0], dorsal: 33 };
    h.edit({ players: [edited] });
    assert.strictEqual(h.store.outbox.records['player:p1'].updatedAt, '2026-10-30T18:00:00.000Z');
    assert.strictEqual(h.store.versions['player:p1'], '2026-10-30T18:00:00.000Z');
    assert.strictEqual(h.pushes.length, 0, 'nothing is sent before the debounce');
    assert.strictEqual(h.timers.at(-1)?.ms, 500);

    await h.runPendingTimers();
    assert.strictEqual(h.pushes.length, 1);
    assert.deepStrictEqual(h.pushes[0].records.map((r) => [r.kind, r.id, r.deleted]), [['player', 'p1', false]]);
    assert.deepStrictEqual(h.store.outbox, { ...createEmptyOutbox(), nextRev: h.store.outbox.nextRev });
    assert.strictEqual(h.store.cursor, '10', 'push responses never advance the pull cursor');
    h.engine.stop();
  });

  it('keeps the outbox and hands over to login on 401', async () => {
    const h = harness({ cursor: '10' });
    h.engine.start();
    await h.engine.whenIdle();
    h.pushQueue.push({ ok: false, error: 'UNAUTHORIZED', status: 401 });
    h.edit({ players: [{ ...h.data.players[0], dorsal: 1 }] });
    await h.runPendingTimers();

    assert.strictEqual(h.unauthorized, 1);
    assert.deepStrictEqual(Object.keys(h.store.outbox.records), ['player:p1']);
    h.engine.stop();
  });

  it('stays offline without calling the server and syncs when the connection returns', async () => {
    const h = harness({ cursor: '10' });
    h.setOnline(false);
    h.engine.start();
    await h.engine.whenIdle();
    h.edit({ players: [{ ...h.data.players[0], dorsal: 2 }] });
    await h.runPendingTimers();

    assert.strictEqual(h.store.status, 'offline');
    assert.deepStrictEqual(h.pulls, []);
    assert.deepStrictEqual(h.pushes, []);

    h.setOnline(true);
    await h.engine.whenIdle();
    assert.strictEqual(h.pushes.length, 1);
    assert.deepStrictEqual(h.pulls, ['10']);
    assert.strictEqual(h.store.status, 'idle');
    h.engine.stop();
  });

  it('retries with exponential backoff capped at 60 s', async () => {
    const h = harness({ cursor: '10' });
    const failure: ApiResult<PushResult> = { ok: false, error: 'NETWORK' };
    h.engine.start();
    await h.engine.whenIdle();
    h.pushQueue.push(...Array.from({ length: 9 }, () => failure));
    h.edit({ players: [{ ...h.data.players[0], dorsal: 3 }] });

    const delays: number[] = [];
    await h.runPendingTimers(); // debounce
    for (let attempt = 0; attempt < 8; attempt += 1) {
      delays.push(h.timers.at(-1)?.ms ?? -1);
      await h.runPendingTimers();
    }
    assert.deepStrictEqual(delays, [1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000]);
    assert.strictEqual(h.store.status, 'offline');
    assert.deepStrictEqual(Object.keys(h.store.outbox.records), ['player:p1']);
    h.engine.stop();
  });

  it('surfaces server rejections as an error without retrying them', async () => {
    const h = harness({ cursor: '10' });
    h.engine.start();
    await h.engine.whenIdle();
    h.pushQueue.push({ ok: true, value: { accepted: [], rejected: [{ id: 'p1', reason: 'FORBIDDEN' }], cursor: '10' } });
    h.edit({ players: [{ ...h.data.players[0], dorsal: 4 }] });
    await h.runPendingTimers();

    assert.strictEqual(h.store.status, 'error');
    assert.match(h.store.lastError ?? '', /1 cambio/);
    assert.deepStrictEqual(h.store.outbox.records, {});
    h.engine.stop();
  });

  it('pulls on a change notification and does a full resync when the server cursor went back', async () => {
    const h = harness({ cursor: '1200', versions: { 'division:div-local-seed': '2026-10-01T00:00:00.000Z' } });
    h.engine.start();
    await h.engine.whenIdle();

    h.emitChanged('1300');
    await h.engine.whenIdle();
    assert.deepStrictEqual(h.pulls, ['1200', '1200']);

    h.pullQueue.push(snapshotPage('30'));
    h.emitChanged('25');
    await h.engine.whenIdle();
    assert.deepStrictEqual(h.pulls.at(-1), null);
    assert.strictEqual(h.store.cursor, '30');
    assert.deepStrictEqual(h.data.divisions.map((d) => d.id), ['div-server']);
    assert.strictEqual(h.store.versions['division:div-local-seed'], undefined);
    h.engine.stop();
  });

  it('stops listening to the club store after stop()', async () => {
    const h = harness({ cursor: '10' });
    h.engine.start();
    await h.engine.whenIdle();
    h.engine.stop();
    h.edit({ players: [] });
    assert.deepStrictEqual(h.store.outbox, createEmptyOutbox());
  });
});
