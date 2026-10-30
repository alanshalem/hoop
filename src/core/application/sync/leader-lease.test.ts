import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createLeaseLeaderLock,
  LEASE_RENEW_MS,
  LEASE_SETTLE_MS,
  LEASE_TTL_MS,
  SYNC_LEADER_LEASE_KEY,
} from './leader-lease';
import type { KeyValueStoragePort, StorageEventsPort } from './tab-coordinator';

/**
 * A fake browser: one localStorage shared by every tab, `storage` events
 * delivered (asynchronously) to the other tabs only, and one clock with timers.
 */
function fakeBrowser() {
  let now = Date.parse('2026-10-30T18:00:00.000Z');
  let nextTimer = 1;
  const timers = new Map<number, { at: number; tab: string; callback: () => void }>();
  const items = new Map<string, string>();
  const listeners = new Map<string, Set<(key: string) => void>>();
  /** Tabs whose timers do not run (crashed or throttled). */
  const frozen = new Set<string>();

  const schedule = (tab: string, callback: () => void, ms: number) => {
    const id = nextTimer++;
    timers.set(id, { at: now + ms, tab, callback });
    return id;
  };

  const notifyOthers = (writer: string, key: string) => {
    for (const [tab, set] of listeners) {
      if (tab === writer) continue;
      schedule(tab, () => set.forEach((listener) => listener(key)), 0);
    }
  };

  function advance(ms: number): void {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= end && !frozen.has(timer.tab))
        .sort(([a, x], [b, y]) => x.at - y.at || a - b)[0];
      if (!due) break;
      const [id, timer] = due;
      timers.delete(id);
      now = Math.max(now, timer.at);
      timer.callback();
    }
    now = end;
  }

  function tab(name: string, events: string[]) {
    const storage: KeyValueStoragePort = {
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => {
        items.set(key, value);
        notifyOthers(name, key);
      },
      removeItem: (key) => {
        items.delete(key);
        notifyOthers(name, key);
      },
      keys: () => [...items.keys()],
    };
    const storageEvents: StorageEventsPort = {
      subscribe: (listener) => {
        const set = listeners.get(name) ?? new Set();
        set.add(listener);
        listeners.set(name, set);
        return () => set.delete(listener);
      },
    };
    const pageHideListeners = new Set<() => void>();
    const lock = createLeaseLeaderLock({
      storage,
      storageEvents,
      tabId: name,
      now: () => now,
      timers: {
        setTimeout: (callback, ms) => schedule(name, callback, ms),
        clearTimeout: (handle) => timers.delete(handle as number),
      },
      pageHide: {
        subscribe: (listener) => {
          pageHideListeners.add(listener);
          return () => pageHideListeners.delete(listener);
        },
      },
    });
    let leading = false;
    const release = lock.request(
      () => {
        leading = true;
        events.push(`${name}:acquired`);
      },
      () => events.push(`${name}:queued`),
      () => {
        leading = false;
        events.push(`${name}:lost`);
      }
    );
    return {
      get leading() {
        return leading;
      },
      release: () => {
        leading = false;
        release();
      },
      pageHide: () => pageHideListeners.forEach((listener) => listener()),
    };
  }

  return {
    tab,
    advance,
    /** Writes the lease key as another app version might. */
    writeRawLease: (value: string) => items.set(SYNC_LEADER_LEASE_KEY, value),
    freeze: (name: string) => frozen.add(name),
    thaw: (name: string) => frozen.delete(name),
    lease: () => {
      const raw = items.get(SYNC_LEADER_LEASE_KEY);
      return raw ? (JSON.parse(raw) as { tabId: string; expiresAt: number }) : null;
    },
    get now() {
      return now;
    },
  };
}

/** Advances in small steps, checking that at most one tab leads at every step. */
function advanceChecking(browser: ReturnType<typeof fakeBrowser>, tabs: { leading: boolean }[], ms: number, step = 100) {
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    browser.advance(step);
    assert.ok(tabs.filter((tab) => tab.leading).length <= 1, `two leaders at +${elapsed + step} ms`);
  }
}

describe('localStorage lease leader election (S13.3 without Web Locks)', () => {
  it('a single tab claims the lease, leads after the settle delay and renews it', () => {
    const browser = fakeBrowser();
    const events: string[] = [];
    const a = browser.tab('A', events);
    assert.deepStrictEqual(events, [], 'nothing is decided before the claim settles');
    browser.advance(LEASE_SETTLE_MS);
    assert.deepStrictEqual(events, ['A:acquired']);
    assert.strictEqual(a.leading, true);
    assert.deepStrictEqual(browser.lease(), { tabId: 'A', expiresAt: browser.now - LEASE_SETTLE_MS + LEASE_TTL_MS });

    browser.advance(LEASE_RENEW_MS);
    assert.strictEqual(browser.lease()?.expiresAt, browser.now + LEASE_TTL_MS, 'renewed every LEASE_RENEW_MS');
    browser.advance(60_000);
    assert.deepStrictEqual(events, ['A:acquired'], 'one acquisition, never lost while renewing');
  });

  it('a second tab is queued at once and never leads while the lease is valid', () => {
    const browser = fakeBrowser();
    const events: string[] = [];
    const a = browser.tab('A', events);
    browser.advance(LEASE_SETTLE_MS);
    const b = browser.tab('B', events);
    assert.deepStrictEqual(events, ['A:acquired', 'B:queued']);
    advanceChecking(browser, [a, b], 120_000);
    assert.strictEqual(a.leading, true);
    assert.strictEqual(b.leading, false);
    assert.deepStrictEqual(events, ['A:acquired', 'B:queued']);
  });

  it('takes over only after the lease expires when the leader tab dies without releasing', () => {
    const browser = fakeBrowser();
    const events: string[] = [];
    const a = browser.tab('A', events);
    browser.advance(LEASE_SETTLE_MS);
    const b = browser.tab('B', events);
    browser.advance(1_000);
    browser.freeze('A'); // crashed: no renewal, no release
    const expiresAt = browser.lease()?.expiresAt ?? 0;

    advanceChecking(browser, [b], expiresAt - browser.now);
    assert.strictEqual(b.leading, false, 'not before the lease expires');
    browser.advance(LEASE_RENEW_MS + LEASE_SETTLE_MS);
    assert.strictEqual(b.leading, true);
    assert.strictEqual(browser.lease()?.tabId, 'B');
    assert.strictEqual(a.leading, true, 'A never ran again (dead tab)');
  });

  it('takes over at once when the leader releases the lease (logout or tab closing)', () => {
    const browser = fakeBrowser();
    const events: string[] = [];
    const a = browser.tab('A', events);
    browser.advance(LEASE_SETTLE_MS);
    const b = browser.tab('B', events);
    browser.advance(500);
    a.release();
    assert.strictEqual(browser.lease(), null);
    browser.advance(LEASE_SETTLE_MS);
    assert.strictEqual(b.leading, true, 'the storage event starts the claim without waiting for the poll');
  });

  it('drops the lease on pagehide so a follower takes over at once', () => {
    const browser = fakeBrowser();
    const events: string[] = [];
    const a = browser.tab('A', events);
    browser.advance(LEASE_SETTLE_MS);
    const b = browser.tab('B', events);
    browser.advance(500);
    a.pageHide();
    browser.freeze('A');
    browser.advance(LEASE_SETTLE_MS);
    assert.strictEqual(b.leading, true);
  });

  it('a throttled leader whose lease expired steps down at its next tick (onLost)', () => {
    const browser = fakeBrowser();
    const events: string[] = [];
    const a = browser.tab('A', events);
    browser.advance(LEASE_SETTLE_MS);
    const b = browser.tab('B', events);
    browser.freeze('A');
    browser.advance(LEASE_TTL_MS + LEASE_RENEW_MS + LEASE_SETTLE_MS);
    assert.strictEqual(b.leading, true);
    browser.thaw('A');
    browser.advance(1);
    assert.strictEqual(a.leading, false);
    assert.deepStrictEqual(events, ['A:acquired', 'B:queued', 'B:acquired', 'A:lost']);
    advanceChecking(browser, [a, b], 30_000);
    assert.strictEqual(b.leading, true);
  });

  it('two tabs opened together end with exactly one leader', () => {
    const browser = fakeBrowser();
    const events: string[] = [];
    const a = browser.tab('A', events);
    const b = browser.tab('B', events);
    advanceChecking(browser, [a, b], 10_000);
    assert.strictEqual([a, b].filter((tab) => tab.leading).length, 1);
  });

  it('ignores a malformed lease value and claims over it', () => {
    const browser = fakeBrowser();
    const events: string[] = [];
    browser.writeRawLease('{"tabId":42}');
    const a = browser.tab('A', events);
    browser.advance(LEASE_SETTLE_MS);
    assert.strictEqual(a.leading, true);
  });
});
