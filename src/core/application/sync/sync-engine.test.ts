import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createSyncEngine, SYNC_ERROR_MESSAGES, SYNC_POLL_INTERVAL_MS, type SyncEngineDeps } from './sync-engine';
import { createEmptyOutbox } from './outbox';
import { toMatchRecord } from './sync-records';
import type { SyncableClubData } from './record-kinds';
import type { ApiResult, PullPage, PushPayload, PushResult, SyncStoreData } from './sync-types';
import { makeClubData, makeDivision, makeMatch, makePlayer, makeTeam } from '@/core/testing/fixtures';

const NOW = Date.parse('2026-10-30T18:00:00.000Z');
const TEST_EPOCH = 'epoch-1';

type Responder<T> = ApiResult<T> | (() => ApiResult<T>);

function harness(initial: Partial<SyncStoreData> = {}) {
  let data: SyncableClubData = makeClubData({
    divisions: [makeDivision({ id: 'div-local-seed' })],
    teams: [makeTeam()],
    players: [makePlayer({ id: 'p1' })],
  });
  const clubListeners = new Set<() => void>();
  let store: SyncStoreData = {
    owner: null,
    cursor: null,
    versions: {},
    outbox: createEmptyOutbox(),
    lastSyncedAt: null,
    status: 'idle',
    lastError: null,
    epoch: TEST_EPOCH,
    ...initial,
  };
  const pulls: (string | null)[] = [];
  const pushes: PushPayload[] = [];
  const pushEpochs: string[] = [];
  const pullQueue: Responder<PullPage>[] = [];
  const pushQueue: Responder<PushResult>[] = [];
  const timers: { fn: () => void; ms: number; cleared: boolean }[] = [];
  const connectivityListeners = new Set<(online: boolean) => void>();
  const visibilityListeners = new Set<(visible: boolean) => void>();
  /** Every API call in order: `pull:<since>` or `push`. */
  const calls: string[] = [];
  let online = true;
  let visible = true;
  let unauthorized = 0;

  const respond = <T>(queue: Responder<T>[], fallback: ApiResult<T>): ApiResult<T> => {
    const next = queue.shift() ?? fallback;
    return typeof next === 'function' ? next() : next;
  };

  const deps: SyncEngineDeps = {
    api: {
      pull: async (since) => {
        pulls.push(since);
        calls.push(`pull:${since}`);
        return respond(pullQueue, { ok: true, value: { records: [], events: [], cursor: since ?? '0', hasMore: false, epoch: TEST_EPOCH } });
      },
      push: async (payload, epoch) => {
        pushes.push(payload);
        calls.push('push');
        pushEpochs.push(epoch);
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
    visibility: {
      isVisible: () => visible,
      subscribe: (listener) => {
        visibilityListeners.add(listener);
        return () => visibilityListeners.delete(listener);
      },
    },
    onUnauthorized: () => {
      unauthorized += 1;
    },
    now: () => NOW,
    timers: {
      // The handle is the timer itself, so clearing never depends on its place in the list.
      setTimeout: (fn, ms) => {
        const timer = { fn, ms, cleared: false };
        timers.push(timer);
        return timer;
      },
      clearTimeout: (handle) => {
        (handle as { cleared: boolean }).cleared = true;
      },
    },
  };

  const engine = createSyncEngine(deps);
  const isPoll = (timer: { ms: number }) => timer.ms === SYNC_POLL_INTERVAL_MS;
  return {
    engine,
    calls,
    pulls,
    pushes,
    pushEpochs,
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
    setVisible(value: boolean) {
      visible = value;
      visibilityListeners.forEach((listener) => listener(value));
    },
    /** Poll timers still waiting. */
    pendingPolls() {
      return timers.filter((timer) => isPoll(timer) && !timer.cleared).length;
    },
    /** Runs the debounce and retry timers due so far; polls only fire through `runPolls`. */
    async runPendingTimers() {
      const due = timers.filter((timer) => !isPoll(timer));
      timers.splice(0, timers.length, ...timers.filter(isPoll));
      for (const timer of due) if (!timer.cleared) timer.fn();
      await engine.whenIdle();
    },
    /** One poll interval elapses. */
    async runPolls() {
      const due = timers.filter(isPoll);
      timers.splice(0, timers.length, ...timers.filter((timer) => !isPoll(timer)));
      for (const timer of due) if (!timer.cleared) timer.fn();
      await engine.whenIdle();
    },
  };
}

const snapshotPage = (cursor: string, hasMore = false, epoch = TEST_EPOCH): ApiResult<PullPage> => ({
  ok: true,
  value: {
    records: [
      { kind: 'division', id: 'div-server', data: makeDivision({ id: 'div-server' }), updatedAt: '2026-10-29T10:00:00.000Z', deleted: false },
      { kind: 'match', id: 'm-server', data: toMatchRecord(makeMatch({ id: 'm-server' })), updatedAt: '2026-10-29T10:00:00.000Z', deleted: false },
    ],
    events: [],
    cursor,
    hasMore,
    epoch,
  },
});

describe('sync engine: data epoch (S1, L5)', () => {
  const pendingPlayer = () => {
    const player = makePlayer({ id: 'p-pending', dorsal: 21 });
    return { records: [{ kind: 'player' as const, id: player.id, data: player, deleted: false }], events: [] };
  };

  it('adopts the epoch of the first snapshot and sends it with every push', async () => {
    const h = harness({ epoch: null });
    h.pullQueue.push(snapshotPage('40', false, 'epoch-new'));
    h.engine.start();
    await h.engine.whenIdle();
    assert.strictEqual(h.store.epoch, 'epoch-new');

    h.edit({ divisions: [makeDivision({ id: 'div-server', name: 'Renamed' })] });
    await h.runPendingTimers();
    assert.strictEqual(h.pushes.length, 1);
    assert.deepStrictEqual(h.pushEpochs, ['epoch-new']);
    h.engine.stop();
  });

  it('never pushes without an epoch: pending changes wait for a snapshot first', async () => {
    const h = harness({ cursor: '10', epoch: null });
    h.engine.enqueue(pendingPlayer());
    h.pullQueue.push(snapshotPage('40'));
    h.engine.start();
    await h.engine.whenIdle();

    assert.deepStrictEqual(h.pulls, [null, '40'], 'an unknown epoch restarts from a snapshot, not from the cursor');
    assert.deepStrictEqual(h.pushes.map((p) => p.records.map((r) => r.id)), [['p-pending']]);
    assert.deepStrictEqual(h.pushEpochs, [TEST_EPOCH]);
    h.engine.stop();
  });

  it('drops the outbox and local data when a pull reveals a new epoch, then loads the snapshot', async () => {
    const h = harness({ cursor: '10' });
    h.engine.start();
    await h.engine.whenIdle();
    h.edit({ players: [{ ...h.data.players[0], dorsal: 33 }] });
    assert.deepStrictEqual(Object.keys(h.store.outbox.records), ['player:p1']);

    h.pullQueue.push(
      { ok: true, value: { records: [], events: [], cursor: '50', hasMore: false, epoch: 'epoch-2' } },
      snapshotPage('60', false, 'epoch-2')
    );
    await h.runPolls();

    assert.deepStrictEqual(h.pulls.slice(-2), ['10', null]);
    assert.deepStrictEqual(h.data.divisions.map((d) => d.id), ['div-server']);
    assert.deepStrictEqual(h.data.players, [], 'local data of the old epoch is gone');
    assert.deepStrictEqual(h.data.teams, []);
    assert.deepStrictEqual(h.store.outbox.records, {});
    assert.deepStrictEqual(h.store.outbox.events, {});
    assert.strictEqual(h.store.epoch, 'epoch-2');
    assert.strictEqual(h.store.cursor, '60');
    assert.strictEqual(h.store.versions['division:div-server'], '2026-10-29T10:00:00.000Z');
    assert.ok(!('player:p1' in h.store.versions), 'versions of the old epoch are gone');
    assert.strictEqual(h.store.status, 'error');
    assert.strictEqual(h.store.lastError, SYNC_ERROR_MESSAGES.dataReset(1));

    await h.runPendingTimers();
    assert.deepStrictEqual(h.pushes, [], 'the dropped change is never pushed');
    h.engine.stop();
  });

  it('drops the outbox when the server refuses a push for another epoch, then loads the snapshot', async () => {
    const h = harness({ cursor: '10' });
    h.engine.start();
    await h.engine.whenIdle();
    h.pushQueue.push({ ok: false, error: 'EPOCH_MISMATCH', status: 409, message: 'Datos reemplazados' });
    h.pullQueue.push(snapshotPage('70', false, 'epoch-2'));
    h.edit({ players: [{ ...h.data.players[0], dorsal: 34 }] });
    await h.runPendingTimers();

    assert.strictEqual(h.pushes.length, 1);
    assert.deepStrictEqual(h.pulls.at(-1), null);
    assert.deepStrictEqual(h.store.outbox.records, {});
    assert.strictEqual(h.store.epoch, 'epoch-2');
    assert.strictEqual(h.store.cursor, '70');
    assert.deepStrictEqual(h.data.divisions.map((d) => d.id), ['div-server']);
    assert.deepStrictEqual(h.data.players, []);
    assert.strictEqual(h.store.lastError, SYNC_ERROR_MESSAGES.dataReset(1));
    assert.strictEqual(h.unauthorized, 0);

    await h.runPendingTimers();
    assert.strictEqual(h.pushes.length, 1, 'nothing is pushed again');
    h.engine.stop();
  });

  it('restarts from a snapshot when the epoch changes between pages, without a message when nothing was pending', async () => {
    const h = harness({ cursor: '5' });
    h.pullQueue.push(
      { ok: true, value: { records: [], events: [], cursor: '1005', hasMore: true, epoch: TEST_EPOCH } },
      { ok: true, value: { records: [], events: [], cursor: '1200', hasMore: false, epoch: 'epoch-2' } },
      snapshotPage('1300', false, 'epoch-2')
    );
    h.engine.start();
    await h.engine.whenIdle();
    assert.deepStrictEqual(h.pulls, ['5', '1005', null]);
    assert.strictEqual(h.store.epoch, 'epoch-2');
    assert.strictEqual(h.store.cursor, '1300');
    assert.strictEqual(h.store.status, 'idle');
    assert.strictEqual(h.store.lastError, null);
    h.engine.stop();
  });

  it('keeps the outbox when the pulled epoch is the known one', async () => {
    const h = harness({ cursor: '10' });
    h.engine.start();
    await h.engine.whenIdle();
    h.setOnline(false);
    h.edit({ players: [{ ...h.data.players[0], dorsal: 35 }] });
    h.setOnline(true);
    await h.engine.whenIdle();
    assert.deepStrictEqual(h.pushEpochs, [TEST_EPOCH]);
    assert.strictEqual(h.store.epoch, TEST_EPOCH);
    h.engine.stop();
  });
});

describe('sync engine: changes from another tab (S13.3)', () => {
  it('enqueues a diff the club store already holds and flushes it like a local edit', async () => {
    const h = harness({ cursor: '1' });
    h.engine.start();
    await h.engine.whenIdle();
    const player = makePlayer({ id: 'p9' });
    h.engine.enqueue({ records: [{ kind: 'player', id: 'p9', data: player, deleted: false }], events: [] });
    assert.strictEqual(h.store.outbox.records['player:p9']?.data, player);
    assert.strictEqual(h.store.versions['player:p9'], '2026-10-30T18:00:00.000Z');

    await h.runPendingTimers();
    assert.deepStrictEqual(h.pushes.at(-1)?.records.map((record) => record.id), ['p9']);
    h.engine.stop();
  });
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
      { ok: true, value: { records: [], events: [], cursor: '1005', hasMore: true, epoch: TEST_EPOCH } },
      { ok: true, value: { records: [], events: [], cursor: '1200', hasMore: false, epoch: TEST_EPOCH } }
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

  it('does a full resync when a push answers a server cursor behind the local one', async () => {
    const h = harness({ cursor: '1200', versions: { 'division:div-local-seed': '2026-10-01T00:00:00.000Z' } });
    h.engine.start();
    await h.engine.whenIdle();

    h.edit({ players: [{ ...h.data.players[0], dorsal: 5 }] });
    h.pushQueue.push({ ok: true, value: { accepted: ['p1'], rejected: [], cursor: '25' } });
    h.pullQueue.push(snapshotPage('30'));
    await h.runPendingTimers();

    assert.deepStrictEqual(h.calls, ['pull:1200', 'push', 'pull:null']);
    assert.strictEqual(h.store.cursor, '30');
    assert.deepStrictEqual(h.data.divisions.map((d) => d.id), ['div-server']);
    assert.strictEqual(h.store.versions['division:div-local-seed'], undefined);
    h.engine.stop();
  });

  it('keeps local edits made before the first successful sync', async () => {
    const h = harness();
    h.pullQueue.push({ ok: false, error: 'NETWORK' });
    h.engine.start();
    await h.engine.whenIdle();
    assert.strictEqual(h.store.status, 'offline');

    const offlinePlayer = makePlayer({ id: 'p-offline' });
    h.edit({ players: [...h.data.players, offlinePlayer] });
    assert.deepStrictEqual(Object.keys(h.store.outbox.records), ['player:p-offline'], 'pending while offline');
    assert.strictEqual(h.store.status, 'offline');

    h.pullQueue.push(snapshotPage('40'));
    h.setOnline(true);
    await h.engine.whenIdle();

    assert.deepStrictEqual(h.calls, ['pull:null', 'pull:null', 'push', 'pull:40']);
    assert.deepStrictEqual(h.data.players.map((p) => p.id), ['p-offline'], 'the snapshot replaces the seed, the edit is re-applied');
    assert.deepStrictEqual(h.data.divisions.map((d) => d.id), ['div-server']);
    assert.strictEqual(h.pushes.length, 1);
    assert.deepStrictEqual(h.pushes[0].records.map((r) => [r.kind, r.id, r.deleted]), [['player', 'p-offline', false]]);
    assert.deepStrictEqual(h.store.outbox.records, {});
    assert.strictEqual(h.store.cursor, '40');
    assert.strictEqual(h.store.versions['player:p-offline'], '2026-10-30T18:00:00.000Z');
    h.engine.stop();
  });

  it('does not drop a pending edit on a full resync', async () => {
    const h = harness({ cursor: '1200' });
    h.engine.start();
    await h.engine.whenIdle();

    h.edit({ players: [{ ...h.data.players[0], dorsal: 76 }] });
    // An edit made while the push is in flight stays pending; the answer reveals a server reset.
    h.pushQueue.push(() => {
      h.edit({ players: [{ ...h.data.players[0], dorsal: 77 }] });
      return { ok: true, value: { accepted: ['p1'], rejected: [], cursor: '25' } };
    });
    h.pullQueue.push(snapshotPage('30'));
    await h.runPendingTimers();

    assert.deepStrictEqual(h.calls.slice(0, 3), ['pull:1200', 'push', 'pull:null']);
    assert.deepStrictEqual(h.data.divisions.map((d) => d.id), ['div-server']);
    assert.strictEqual(h.data.players.find((p) => p.id === 'p1')?.dorsal, 77);
    const pushed = h.pushes.flatMap((push) => push.records);
    assert.deepStrictEqual(pushed.map((r) => [r.kind, r.id]), [['player', 'p1'], ['player', 'p1']]);
    assert.strictEqual(pushed[1].kind === 'player' ? pushed[1].data.dorsal : -1, 77, 'the pending edit is pushed after the snapshot');
    assert.deepStrictEqual(h.store.outbox.records, {});

    await h.runPendingTimers(); // the pending debounce finds nothing left to push
    assert.strictEqual(h.pushes.length, 2);
    h.engine.stop();
  });

  for (const cursor of [null, '10']) {
    it(`applies data pulled mid-edit without echoing it and keeps the edit (cursor ${cursor})`, async () => {
      const h = harness({ cursor });
      h.pullQueue.push(() => {
        h.edit({ players: h.data.players.map((p) => (p.id === 'p1' ? { ...p, dorsal: 55 } : p)) });
        return {
          ok: true,
          value: {
            records: [
              { kind: 'division', id: 'div-x', data: makeDivision({ id: 'div-x' }), updatedAt: '2026-10-29T10:00:00.000Z', deleted: false },
            ],
            events: [],
            cursor: '50',
            hasMore: false,
            epoch: TEST_EPOCH,
          },
        };
      });
      h.engine.start();
      await h.engine.whenIdle();

      assert.deepStrictEqual(h.pulls.slice(0, 1), [cursor]);
      assert.ok(h.data.divisions.some((d) => d.id === 'div-x'));
      assert.strictEqual(h.data.players.find((p) => p.id === 'p1')?.dorsal, 55);

      await h.runPendingTimers();
      assert.strictEqual(h.data.players.find((p) => p.id === 'p1')?.dorsal, 55);
      assert.deepStrictEqual(h.store.outbox.records, {});
      const pushed = h.pushes.flatMap((push) => push.records.map((r) => `${r.kind}:${r.id}`));
      assert.deepStrictEqual(pushed, ['player:p1'], 'pulled data is never pushed back');
      h.engine.stop();
    });
  }

  it('stops listening to the club store after stop()', async () => {
    const h = harness({ cursor: '10' });
    h.engine.start();
    await h.engine.whenIdle();
    h.engine.stop();
    h.edit({ players: [] });
    assert.deepStrictEqual(h.store.outbox, createEmptyOutbox());
  });
});

describe('sync engine: polling (S4)', () => {
  it('pulls on start and then every SYNC_POLL_INTERVAL_MS while the page is visible', async () => {
    const h = harness({ cursor: '10' });
    h.engine.start();
    await h.engine.whenIdle();
    assert.deepStrictEqual(h.pulls, ['10']);
    assert.strictEqual(SYNC_POLL_INTERVAL_MS, 10_000);
    assert.strictEqual(h.pendingPolls(), 1);

    await h.runPolls();
    assert.deepStrictEqual(h.pulls, ['10', '10']);
    assert.strictEqual(h.pendingPolls(), 1, 'the next poll is scheduled after each pull');

    await h.runPolls();
    assert.deepStrictEqual(h.pulls, ['10', '10', '10']);
    assert.deepStrictEqual(h.pushes, []);
    assert.strictEqual(h.store.status, 'idle');
    h.engine.stop();
  });

  it('pauses while the page is hidden and pulls at once when it is visible again', async () => {
    const h = harness({ cursor: '10' });
    h.engine.start();
    await h.engine.whenIdle();

    h.setVisible(false);
    assert.strictEqual(h.pendingPolls(), 0);
    await h.runPolls();
    assert.deepStrictEqual(h.pulls, ['10'], 'no poll while hidden');

    h.setVisible(true);
    await h.engine.whenIdle();
    assert.deepStrictEqual(h.pulls, ['10', '10'], 'pulled without waiting for an interval');
    assert.strictEqual(h.pendingPolls(), 1, 'polling resumes');
    h.engine.stop();
  });

  it('started hidden: pulls once and schedules no poll until the page is shown', async () => {
    const h = harness({ cursor: '10' });
    h.setVisible(false);
    h.engine.start();
    await h.engine.whenIdle();
    assert.deepStrictEqual(h.pulls, ['10']);
    assert.strictEqual(h.pendingPolls(), 0);

    h.setVisible(true);
    await h.engine.whenIdle();
    assert.deepStrictEqual(h.pulls, ['10', '10']);
    h.engine.stop();
  });

  it('pulls at once when the connection returns', async () => {
    const h = harness({ cursor: '10' });
    h.engine.start();
    await h.engine.whenIdle();
    h.setOnline(false);
    assert.strictEqual(h.store.status, 'offline');

    h.setOnline(true);
    await h.engine.whenIdle();
    assert.deepStrictEqual(h.pulls, ['10', '10']);
    assert.strictEqual(h.store.status, 'idle');
    h.engine.stop();
  });

  it('pulls right after a successful push', async () => {
    const h = harness({ cursor: '10' });
    h.engine.start();
    await h.engine.whenIdle();

    h.edit({ players: [{ ...h.data.players[0], dorsal: 9 }] });
    await h.runPendingTimers();
    assert.deepStrictEqual(h.calls, ['pull:10', 'push', 'pull:10']);
    assert.deepStrictEqual(h.store.outbox.records, {});
    h.engine.stop();
  });

  it('keeps the exponential backoff on errors: no poll and no visible-page pull jump the retry', async () => {
    const h = harness({ cursor: '10' });
    h.pullQueue.push({ ok: false, error: 'HTTP', status: 500 });
    h.engine.start();
    await h.engine.whenIdle();
    assert.strictEqual(h.store.status, 'error');
    assert.strictEqual(h.pendingPolls(), 0);
    assert.strictEqual(h.timers.at(-1)?.ms, 1000);

    h.setVisible(false);
    h.setVisible(true);
    await h.engine.whenIdle();
    assert.deepStrictEqual(h.pulls, ['10'], 'the retry wait is respected');

    await h.runPendingTimers();
    assert.deepStrictEqual(h.pulls, ['10', '10']);
    assert.strictEqual(h.store.status, 'idle');
    assert.strictEqual(h.pendingPolls(), 1, 'polling resumes after the retry succeeds');
    h.engine.stop();
  });

  it('stops polling after stop()', async () => {
    const h = harness({ cursor: '10' });
    h.engine.start();
    await h.engine.whenIdle();
    h.engine.stop();
    assert.strictEqual(h.pendingPolls(), 0);
    h.setVisible(false);
    h.setVisible(true);
    await h.runPolls();
    assert.deepStrictEqual(h.pulls, ['10']);
  });
});
