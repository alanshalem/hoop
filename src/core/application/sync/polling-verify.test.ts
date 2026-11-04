import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createInitialSyncData, migrateSyncStore, SYNC_STORE_VERSION } from '@/core/application/stores/useSyncStore';
import { createEmptyOutbox, enqueueChanges } from './outbox';
import {
  createSyncEngine,
  FLUSH_DEBOUNCE_MS,
  RETRY_BASE_MS,
  SYNC_POLL_INTERVAL_MS,
  type SyncEngineDeps,
} from './sync-engine';
import { toMatchRecord } from './sync-records';
import type { SyncableClubData } from './record-kinds';
import type { ApiResult, PullPage, PushResult, SyncRecord, SyncStoreData } from './sync-types';
import { makeDivision, makeEvent, makeMatch, makePlayer, makeTeam, makeClubData } from '@/core/testing/fixtures';

/**
 * Regression tests of the polling engine (S4, T9 verify): no overlapping runs,
 * visibility and backoff, stop() mid-run, pull-after-push echoes, and the sync
 * store migration that strips removed match fields.
 */

const NOW = Date.parse('2026-11-04T12:00:00.000Z');
const EPOCH = 'epoch-1';
const SERVER_AT = '2026-11-01T10:00:00.000Z';

type Responder<T> = () => ApiResult<T> | Promise<ApiResult<T>>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const settle = async () => {
  for (let round = 0; round < 5; round += 1) await new Promise((resolve) => setImmediate(resolve));
};

const emptyPage = (cursor = '10'): ApiResult<PullPage> => ({
  ok: true,
  value: { records: [], events: [], cursor, hasMore: false, epoch: EPOCH },
});

const SERVER_EVENT = makeEvent({ id: 'e1', matchId: 'm1', type: 'FG2_MADE', scoreAtEvent: { home: 2, away: 0 } });

/** Division, team, two players and a live match with one play, as the server has them. */
const snapshotPage = (): ApiResult<PullPage> => ({
  ok: true,
  value: {
    records: [
      { kind: 'division', id: 'div-test', data: makeDivision({ id: 'div-test' }), updatedAt: SERVER_AT, deleted: false },
      { kind: 'team', id: 'team-own', data: makeTeam(), updatedAt: SERVER_AT, deleted: false },
      { kind: 'player', id: 'p1', data: makePlayer({ id: 'p1' }), updatedAt: SERVER_AT, deleted: false },
      { kind: 'player', id: 'p2', data: makePlayer({ id: 'p2', dorsal: 11 }), updatedAt: SERVER_AT, deleted: false },
      { kind: 'match', id: 'm1', data: toMatchRecord(makeMatch({ id: 'm1' })), updatedAt: SERVER_AT, deleted: false },
    ],
    events: [{ id: 'e1', matchId: 'm1', data: SERVER_EVENT, deleted: false }],
    cursor: '10',
    hasMore: false,
    epoch: EPOCH,
  },
});

function harness(initial: Partial<SyncStoreData> = { cursor: '10' }) {
  let data: SyncableClubData = makeClubData({ players: [makePlayer({ id: 'p1' })] });
  let store: SyncStoreData = { ...createInitialSyncData(), epoch: EPOCH, ...initial };
  const clubListeners = new Set<() => void>();
  const connectivityListeners = new Set<(online: boolean) => void>();
  const visibilityListeners = new Set<(visible: boolean) => void>();
  const timers: { fn: () => void; ms: number; cleared: boolean }[] = [];
  const pullQueue: Responder<PullPage>[] = [];
  const pushQueue: Responder<PushResult>[] = [];
  const calls: string[] = [];
  const pushes: { records: SyncRecord[] }[] = [];
  let visible = true;
  let inFlight = 0;
  let maxInFlight = 0;

  const track = async <T>(call: string, respond: () => ApiResult<T> | Promise<ApiResult<T>>): Promise<ApiResult<T>> => {
    calls.push(call);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      return await respond();
    } finally {
      inFlight -= 1;
    }
  };

  const deps: SyncEngineDeps = {
    api: {
      pull: (since) => track(`pull:${since}`, pullQueue.shift() ?? (() => emptyPage(since ?? '10'))),
      push: (payload) => {
        pushes.push(payload);
        const accepted = [...payload.records.map((record) => record.id), ...payload.events.map((event) => event.id)];
        return track('push', pushQueue.shift() ?? (() => ({ ok: true, value: { accepted, rejected: [], cursor: '99' } })));
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
      isOnline: () => true,
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
    onUnauthorized: () => undefined,
    now: () => NOW,
    timers: {
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

  const active = (ms?: number) => timers.filter((timer) => !timer.cleared && (ms === undefined || timer.ms === ms));
  return {
    engine,
    calls,
    pushes,
    pullQueue,
    pushQueue,
    get data() {
      return data;
    },
    get store() {
      return store;
    },
    get maxInFlight() {
      return maxInFlight;
    },
    listenerCount: () => clubListeners.size + connectivityListeners.size + visibilityListeners.size,
    active,
    polls: () => active(SYNC_POLL_INTERVAL_MS).length,
    /** Fires every active timer of `ms` (a timer fires once). */
    async fire(ms: number) {
      for (const timer of active(ms)) {
        timer.cleared = true;
        timer.fn();
      }
      await settle();
    },
    edit(next: Partial<SyncableClubData>) {
      data = { ...data, ...next };
      clubListeners.forEach((listener) => listener());
    },
    setVisible(value: boolean) {
      visible = value;
      visibilityListeners.forEach((listener) => listener(value));
    },
    goOnline() {
      connectivityListeners.forEach((listener) => listener(true));
    },
    /** What a pull must leave untouched. */
    localState: () => JSON.stringify({ data, versions: store.versions, outbox: store.outbox }),
  };
}

describe('sync polling regressions (S4, T9 verify)', () => {
  it('never runs two requests at once: visibility, online, syncNow, a flush and a poll during a pull join the run', async () => {
    const h = harness();
    const held = deferred<ApiResult<PullPage>>();
    h.pullQueue.push(() => held.promise);
    h.engine.start();
    await settle();
    assert.deepStrictEqual(h.calls, ['pull:10']);
    assert.strictEqual(h.polls(), 0, 'no poll is scheduled during a run');

    h.setVisible(false);
    h.setVisible(true);
    h.goOnline();
    void h.engine.syncNow();
    h.edit({ players: [{ ...h.data.players[0], dorsal: 9 }] });
    await h.fire(FLUSH_DEBOUNCE_MS);
    await h.fire(SYNC_POLL_INTERVAL_MS);
    assert.deepStrictEqual(h.calls, ['pull:10'], 'everything waits for the pull in flight');

    held.resolve(emptyPage());
    await h.engine.whenIdle();
    assert.deepStrictEqual(h.calls, ['pull:10', 'push', 'pull:10'], 'the requests were merged into one more push and pull');
    assert.strictEqual(h.maxInFlight, 1);
    assert.strictEqual(h.polls(), 1);
    h.engine.stop();
  });

  it('hidden mid-run: schedules no poll; visible again: pulls at once with a single poll timer', async () => {
    const h = harness();
    const held = deferred<ApiResult<PullPage>>();
    h.pullQueue.push(() => held.promise);
    h.engine.start();
    await settle();

    h.setVisible(false);
    held.resolve(emptyPage());
    await h.engine.whenIdle();
    assert.strictEqual(h.polls(), 0, 'hidden when the run ended');

    h.setVisible(true);
    await h.engine.whenIdle();
    assert.deepStrictEqual(h.calls, ['pull:10', 'pull:10']);
    assert.strictEqual(h.polls(), 1);

    h.setVisible(true);
    await h.engine.whenIdle();
    assert.strictEqual(h.calls.length, 3);
    assert.strictEqual(h.polls(), 1, 'the earlier poll timer was replaced, not added to');
    h.engine.stop();
  });

  it('backs off 1 s, 2 s, 4 s on errors, with no poll and no visible-page pull during the wait', async () => {
    const h = harness();
    const failure = (): ApiResult<PullPage> => ({ ok: false, error: 'HTTP', status: 500 });
    h.pullQueue.push(failure, failure, failure);
    h.engine.start();
    await h.engine.whenIdle();

    for (const [attempt, delay] of [1000, 2000, 4000].entries()) {
      assert.strictEqual(h.store.status, 'error');
      assert.deepStrictEqual(
        h.active().map((timer) => timer.ms),
        [delay],
        `only the retry timer after failure ${attempt + 1}`
      );
      h.setVisible(false);
      h.setVisible(true);
      await settle();
      assert.strictEqual(h.calls.length, attempt + 1, 'the retry wait is respected');
      await h.fire(delay);
    }
    assert.strictEqual(RETRY_BASE_MS, 1000);
    assert.strictEqual(h.calls.length, 4);
    assert.strictEqual(h.store.status, 'idle');
    assert.deepStrictEqual(
      h.active().map((timer) => timer.ms),
      [SYNC_POLL_INTERVAL_MS],
      'polling resumes once a retry succeeds'
    );
    h.engine.stop();
  });

  it('stop() mid-run leaves no timer or listener, and a late response or timer callback does nothing', async () => {
    const h = harness();
    h.engine.start();
    await h.engine.whenIdle();
    const [poll] = h.active(SYNC_POLL_INTERVAL_MS);
    h.edit({ players: [{ ...h.data.players[0], dorsal: 9 }] });
    const [debounce] = h.active(FLUSH_DEBOUNCE_MS);
    assert.ok(poll && debounce);

    const held = deferred<ApiResult<PullPage>>();
    h.pullQueue.push(() => held.promise);
    poll.cleared = true;
    poll.fn();
    await settle();
    assert.deepStrictEqual(h.calls, ['pull:10', 'pull:10']);

    h.engine.stop();
    assert.strictEqual(h.active().length, 0);
    assert.strictEqual(h.listenerCount(), 0);
    const before = JSON.stringify({ data: h.data, store: h.store });

    held.resolve(snapshotPage());
    await settle();
    poll.fn();
    debounce.fn();
    await h.engine.whenIdle();
    assert.strictEqual(JSON.stringify({ data: h.data, store: h.store }), before, 'the late pull is discarded');
    assert.deepStrictEqual(h.calls, ['pull:10', 'pull:10'], 'late callbacks call nothing');
    assert.strictEqual(h.active().length, 0);
  });

  it('a pull that echoes the pushed records (match edit + player deletion) leaves data, versions and outbox byte-identical', async () => {
    const h = harness({ cursor: null });
    h.pullQueue.push(snapshotPage);
    h.engine.start();
    await h.engine.whenIdle();
    assert.deepStrictEqual(
      h.data.players.map((player) => player.id),
      ['p1', 'p2']
    );

    const [match] = h.data.matches;
    h.edit({
      matches: [{ ...match, venue: 'Estadio nuevo', homeTimeouts: { ...match.homeTimeouts, firstHalfRemaining: 1 } }],
      players: h.data.players.filter((player) => player.id !== 'p2'),
    });
    let beforePull = '';
    h.pullQueue.push(() => {
      beforePull = h.localState();
      const { records } = h.pushes.at(-1) ?? { records: [] };
      return { ok: true, value: { records, events: [], cursor: '12', hasMore: false, epoch: EPOCH } };
    });
    await h.fire(FLUSH_DEBOUNCE_MS);
    await h.engine.whenIdle();

    assert.deepStrictEqual(h.calls, ['pull:null', 'push', 'pull:10']);
    const pushed = h.pushes[0].records;
    assert.deepStrictEqual(pushed.map((record) => `${record.kind}:${record.id}:${record.deleted}`).sort(), [
      'match:m1:false',
      'player:p2:true',
    ]);
    assert.ok(beforePull !== '');
    assert.strictEqual(h.localState(), beforePull);
    assert.strictEqual(h.data.matches[0].venue, 'Estadio nuevo');
    assert.strictEqual(h.data.matches[0].homeScore, 2, 'the scoreboard still comes from the plays');
    assert.strictEqual(h.store.cursor, '12');
    h.engine.stop();
  });

  it('an edit made while its push is in flight survives the pull after it and is pushed next', async () => {
    const h = harness({ cursor: null });
    h.pullQueue.push(snapshotPage);
    h.engine.start();
    await h.engine.whenIdle();

    const p1 = () => h.data.players.find((player) => player.id === 'p1')!;
    h.edit({ players: h.data.players.map((player) => (player.id === 'p1' ? { ...player, dorsal: 9 } : player)) });
    const held = deferred<ApiResult<PushResult>>();
    h.pushQueue.push(() => held.promise);
    h.pullQueue.push(() => ({
      ok: true,
      value: { records: h.pushes[0].records, events: [], cursor: '11', hasMore: false, epoch: EPOCH },
    }));
    await h.fire(FLUSH_DEBOUNCE_MS);
    assert.deepStrictEqual(h.calls.slice(1), ['push']);

    h.edit({ players: h.data.players.map((player) => (player.id === 'p1' ? { ...player, dorsal: 10 } : player)) });
    held.resolve({ ok: true, value: { accepted: ['p1'], rejected: [], cursor: '11' } });
    await h.engine.whenIdle();
    assert.deepStrictEqual(h.calls.slice(1), ['push', 'pull:10'], 'the echo of the first push was pulled');
    assert.strictEqual(p1().dorsal, 10, 'the newer local edit is kept');
    const pending = h.store.outbox.records['player:p1'];
    assert.ok(pending && pending.kind === 'player' && pending.data.dorsal === 10, 'and still pending');

    await h.fire(FLUSH_DEBOUNCE_MS);
    await h.engine.whenIdle();
    assert.deepStrictEqual(h.calls.slice(1), ['push', 'pull:10', 'push', 'pull:11']);
    const second = h.pushes[1].records.find((record) => record.id === 'p1');
    assert.ok(second && second.kind === 'player' && second.data.dorsal === 10);
    assert.ok(second.updatedAt > h.pushes[0].records[0].updatedAt, 'stamped after the first push');
    assert.deepStrictEqual(h.store.outbox.records, {});
    h.engine.stop();
  });
});

describe('sync store migration v3 -> v4 with mixed entries (L6)', () => {
  it('keeps owner, cursor, epoch, lastSyncedAt and every other entry; strips only the removed match fields', () => {
    const at = (minute: number) => new Date(NOW + minute * 60_000).toISOString();
    const clean = enqueueChanges(
      { outbox: createEmptyOutbox(), versions: { 'division:div-test': at(-30), 'match:m2#status': at(-20) } },
      {
        records: [
          { kind: 'player', id: 'p1', data: makePlayer({ id: 'p1' }), deleted: false },
          { kind: 'match', id: 'm1', data: toMatchRecord(makeMatch({ id: 'm1' })), deleted: false, changedFields: ['venue'] },
          { kind: 'match', id: 'm2', data: toMatchRecord(makeMatch({ id: 'm2' })), deleted: true },
        ],
        events: [{ id: 'e1', matchId: 'm1', data: makeEvent({ id: 'e1', matchId: 'm1' }), deleted: false }],
      },
      NOW
    );
    const m1 = clean.outbox.records['match:m1'];
    const m2 = clean.outbox.records['match:m2'];
    assert.ok(m1.kind === 'match' && m1.fieldVersions && m2.kind === 'match');
    const persistedClean = {
      owner: { id: 'u1', name: 'Ana' },
      cursor: '1200',
      epoch: EPOCH,
      lastSyncedAt: at(-5),
      versions: clean.versions,
      outbox: clean.outbox,
    };
    const v3 = {
      ...persistedClean,
      versions: { ...clean.versions, 'match:m1#activeLineupOwn': at(-1), 'match:m2#activeLineupOwn': at(-2) },
      outbox: {
        ...clean.outbox,
        records: {
          ...clean.outbox.records,
          'match:m1': {
            ...m1,
            data: { ...m1.data, activeLineupOwn: ['p1'] },
            fieldVersions: { ...m1.fieldVersions, activeLineupOwn: at(-1) },
          },
          'match:m2': { ...m2, data: { ...m2.data, activeLineupOwn: ['p2'] } },
        },
      },
    };

    assert.strictEqual(SYNC_STORE_VERSION, 4);
    const migrated = migrateSyncStore(structuredClone(v3), 3);
    assert.deepStrictEqual(migrated, persistedClean);
    assert.strictEqual(migrated.versions['match:m2#status'], at(-20), 'a known per-field entry stays');
    assert.ok(migrated.outbox.events.e1, 'queued plays stay');
  });
});
