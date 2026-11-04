import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createEmptyOutbox } from './outbox';
import { createSyncEngine, SYNC_POLL_INTERVAL_MS, type TimerPort, type VisibilityPort } from './sync-engine';
import { TAB_PROTOCOL_VERSION, type TabChannelPort, type TabMessage } from './tab-coordinator';
import { createTabsVisibility, VISIBILITY_HEARTBEAT_MS, VISIBILITY_TTL_MS } from './tab-visibility';
import type { SyncableClubData } from './record-kinds';
import type { SyncStoreData } from './sync-types';
import { makeClubData } from '@/core/testing/fixtures';

const settle = async () => {
  for (let round = 0; round < 5; round += 1) await new Promise((resolve) => setImmediate(resolve));
};

/** Fake timers on a fake clock: `advance` fires every timer due, in time order. */
function fakeClock() {
  let now = 0;
  const pending: { at: number; ms: number; fn: () => void; cleared: boolean }[] = [];
  const timers: TimerPort = {
    setTimeout: (fn, ms) => {
      const timer = { at: now + ms, ms, fn, cleared: false };
      pending.push(timer);
      return timer;
    },
    clearTimeout: (handle) => {
      (handle as { cleared: boolean }).cleared = true;
    },
  };
  return {
    timers,
    async advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const next = pending.filter((timer) => !timer.cleared && timer.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        next.cleared = true;
        now = next.at;
        next.fn();
        await settle();
      }
      now = target;
      await settle();
    },
    waiting: (ms: number) => pending.filter((timer) => !timer.cleared && timer.ms === ms).length,
    waitingAny: () => pending.filter((timer) => !timer.cleared).length,
  };
}

/** A BroadcastChannel stand-in: a message reaches every other channel of the bus. */
function fakeBus() {
  const channels: Set<(message: unknown) => void>[] = [];
  const all: unknown[] = [];
  return {
    all,
    channel(): TabChannelPort {
      const listeners = new Set<(message: unknown) => void>();
      channels.push(listeners);
      return {
        post: (message) => {
          all.push(message);
          for (const other of channels) if (other !== listeners) other.forEach((listener) => listener(message));
        },
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
    },
  };
}

function fakePage(initial: boolean) {
  let visible = initial;
  const listeners = new Set<(visible: boolean) => void>();
  const port: VisibilityPort = {
    isVisible: () => visible,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    port,
    listeners,
    set(value: boolean) {
      visible = value;
      listeners.forEach((listener) => listener(value));
    },
  };
}

/** A leader tab (engine + shared visibility) and a follower tab of the same browser. */
function browser({ leaderVisible, followerVisible }: { leaderVisible: boolean; followerVisible: boolean }) {
  const clock = fakeClock();
  const bus = fakeBus();
  const leaderPage = fakePage(leaderVisible);
  const followerPage = fakePage(followerVisible);
  const leaderTabs = createTabsVisibility({ local: leaderPage.port, channel: bus.channel(), tabId: 'tab-a', timers: clock.timers });
  const followerTabs = createTabsVisibility({ local: followerPage.port, channel: bus.channel(), tabId: 'tab-b', timers: clock.timers });

  let data: SyncableClubData = makeClubData();
  let store: SyncStoreData = {
    owner: null,
    cursor: '10',
    versions: {},
    outbox: createEmptyOutbox(),
    lastSyncedAt: null,
    status: 'idle',
    lastError: null,
    epoch: 'epoch-1',
  };
  const pulls: number[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const engine = createSyncEngine({
    api: {
      pull: async (since) => {
        pulls.push(pulls.length);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return { ok: true, value: { records: [], events: [], cursor: since ?? '0', hasMore: false, epoch: 'epoch-1' } };
      },
      push: async () => ({ ok: true, value: { accepted: [], rejected: [], cursor: '10' } }),
    },
    club: {
      getData: () => data,
      applyData: (next) => {
        data = next;
      },
      subscribe: () => () => undefined,
    },
    store: {
      getState: () => store,
      setState: (patch) => {
        store = { ...store, ...patch };
      },
    },
    connectivity: { isOnline: () => true, subscribe: () => () => undefined },
    visibility: leaderTabs,
    onUnauthorized: () => undefined,
    now: () => Date.parse('2026-11-04T12:00:00.000Z'),
    timers: clock.timers,
  });

  return {
    clock,
    bus,
    leaderPage,
    followerPage,
    leaderTabs,
    followerTabs,
    engine,
    pulls,
    get maxInFlight() {
      return maxInFlight;
    },
    /** The leader engine's poll timers still waiting. */
    polls: () => clock.waiting(SYNC_POLL_INTERVAL_MS),
    async start() {
      leaderTabs.start();
      followerTabs.start();
      engine.start();
      await settle();
    },
  };
}

describe('sync polling while any tab of the browser is visible (S4, L8)', () => {
  it('keeps polling every 10 s while the leader tab is hidden and a follower tab is visible', async () => {
    const b = browser({ leaderVisible: true, followerVisible: true });
    await b.start();
    assert.strictEqual(b.pulls.length, 1);

    b.leaderPage.set(false);
    await settle();
    assert.strictEqual(b.leaderTabs.isVisible(), true, 'the follower is on screen');
    assert.strictEqual(b.polls(), 1, 'the next poll stays scheduled');

    await b.clock.advance(SYNC_POLL_INTERVAL_MS);
    assert.strictEqual(b.pulls.length, 2);
    await b.clock.advance(SYNC_POLL_INTERVAL_MS);
    assert.strictEqual(b.pulls.length, 3);
    // Well past the visibility TTL: the follower's heartbeats keep it counted as visible.
    await b.clock.advance(3 * SYNC_POLL_INTERVAL_MS);
    assert.strictEqual(b.pulls.length, 6);
    assert.strictEqual(b.polls(), 1);
    assert.strictEqual(b.maxInFlight, 1);
    b.engine.stop();
  });

  it('stops polling once every tab is hidden', async () => {
    const b = browser({ leaderVisible: false, followerVisible: true });
    await b.start();
    await b.clock.advance(SYNC_POLL_INTERVAL_MS);
    assert.strictEqual(b.pulls.length, 2);

    b.followerPage.set(false);
    await settle();
    assert.strictEqual(b.leaderTabs.isVisible(), false);
    assert.strictEqual(b.polls(), 0, 'the hidden follower took the poll away');
    await b.clock.advance(6 * SYNC_POLL_INTERVAL_MS);
    assert.strictEqual(b.pulls.length, 2, 'no poll while every tab is hidden');
    b.engine.stop();
  });

  it('pulls at once when a follower tab becomes visible, then polls', async () => {
    const b = browser({ leaderVisible: false, followerVisible: false });
    await b.start();
    assert.strictEqual(b.pulls.length, 1, 'the pull on start');
    assert.strictEqual(b.polls(), 0, 'all hidden: no poll');

    b.followerPage.set(true);
    await settle();
    assert.strictEqual(b.pulls.length, 2, 'pulled without waiting for an interval');
    assert.strictEqual(b.polls(), 1);
    await b.clock.advance(SYNC_POLL_INTERVAL_MS);
    assert.strictEqual(b.pulls.length, 3);
    b.engine.stop();
  });

  it('counts a tab that stops announcing itself (closed or frozen) as hidden after the TTL', async () => {
    const b = browser({ leaderVisible: false, followerVisible: false });
    await b.start();
    const silentTab = b.bus.channel();
    silentTab.post({ v: TAB_PROTOCOL_VERSION, type: 'visibility', tabId: 'tab-c', visible: true });
    await settle();
    assert.strictEqual(b.pulls.length, 2);

    await b.clock.advance(SYNC_POLL_INTERVAL_MS);
    assert.strictEqual(b.pulls.length, 3);
    assert.ok(VISIBILITY_TTL_MS < 2 * SYNC_POLL_INTERVAL_MS);
    await b.clock.advance(VISIBILITY_TTL_MS - SYNC_POLL_INTERVAL_MS);
    assert.strictEqual(b.leaderTabs.isVisible(), false);
    assert.strictEqual(b.polls(), 0);
    await b.clock.advance(6 * SYNC_POLL_INTERVAL_MS);
    assert.strictEqual(b.pulls.length, 3);
    b.engine.stop();
  });

  it('tells a new leader at once which tabs are on screen', async () => {
    const clock = fakeClock();
    const bus = fakeBus();
    const follower = createTabsVisibility({ local: fakePage(true).port, channel: bus.channel(), tabId: 'tab-b', timers: clock.timers });
    follower.start();
    const leaderChannel = bus.channel();
    const leader = createTabsVisibility({ local: fakePage(false).port, channel: leaderChannel, tabId: 'tab-a', timers: clock.timers });
    leader.start();
    assert.strictEqual(leader.isVisible(), false, 'the follower announced itself before this tab listened');

    // The coordinator of the new leader announces it.
    leaderChannel.post({ v: TAB_PROTOCOL_VERSION, type: 'leader' });
    assert.strictEqual(leader.isVisible(), true);
    follower.stop();
    leader.stop();
  });

  it('ignores its own announcements and messages of another protocol version', async () => {
    const clock = fakeClock();
    const bus = fakeBus();
    const channel = bus.channel();
    const tabs = createTabsVisibility({ local: fakePage(false).port, channel, tabId: 'tab-a', timers: clock.timers });
    tabs.start();
    const other = bus.channel();
    other.post({ v: TAB_PROTOCOL_VERSION, type: 'visibility', tabId: 'tab-a', visible: true });
    other.post({ v: TAB_PROTOCOL_VERSION + 1, type: 'visibility', tabId: 'tab-x', visible: true });
    other.post({ v: TAB_PROTOCOL_VERSION, type: 'visibility', tabId: 'tab-y', visible: 'yes' } as unknown as TabMessage);
    assert.strictEqual(tabs.isVisible(), false);
    tabs.stop();
  });

  it('announces itself while visible and leaves no timer or listener after stop()', async () => {
    const clock = fakeClock();
    const bus = fakeBus();
    const page = fakePage(true);
    const watcherTabs = createTabsVisibility({ local: fakePage(false).port, channel: bus.channel(), tabId: 'tab-a', timers: clock.timers });
    watcherTabs.start();
    const tabs = createTabsVisibility({ local: page.port, channel: bus.channel(), tabId: 'tab-b', timers: clock.timers });
    tabs.start();
    assert.deepStrictEqual(bus.all.at(-1), { v: TAB_PROTOCOL_VERSION, type: 'visibility', tabId: 'tab-b', visible: true });
    await clock.advance(VISIBILITY_HEARTBEAT_MS);
    assert.strictEqual(bus.all.length, 2, 'one heartbeat per interval');
    assert.strictEqual(watcherTabs.isVisible(), true);

    tabs.stop();
    assert.deepStrictEqual(bus.all.at(-1), { v: TAB_PROTOCOL_VERSION, type: 'visibility', tabId: 'tab-b', visible: false });
    assert.strictEqual(watcherTabs.isVisible(), false, 'a stopped tab no longer counts');
    assert.strictEqual(page.listeners.size, 0);
    watcherTabs.stop();
    assert.strictEqual(clock.waitingAny(), 0);

    page.set(false);
    page.set(true);
    await clock.advance(10 * VISIBILITY_HEARTBEAT_MS);
    assert.strictEqual(bus.all.length, 3, 'nothing announced after stop()');
  });

  it('without a tab channel, follows this page only', async () => {
    const clock = fakeClock();
    const page = fakePage(true);
    const tabs = createTabsVisibility({ local: page.port, channel: null, tabId: 'tab-a', timers: clock.timers });
    const seen: boolean[] = [];
    tabs.subscribe((visible) => seen.push(visible));
    tabs.start();
    assert.strictEqual(tabs.isVisible(), true);
    page.set(false);
    page.set(true);
    assert.deepStrictEqual(seen, [false, true]);
    assert.strictEqual(clock.waitingAny(), 0, 'no heartbeat without other tabs to tell');
    tabs.stop();
  });
});
