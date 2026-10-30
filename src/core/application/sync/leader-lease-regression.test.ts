import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createLeaseLeaderLock, SYNC_LEADER_LEASE_KEY } from '@/core/application/sync/leader-lease';
import type { KeyValueStoragePort } from '@/core/application/sync/tab-coordinator';

// Regression tests from the independent verification of T14 (L25): one clock, one shared
// localStorage, per-tab timer jitter/throttling, storage events delivered with a delay.

function world(seed: number, opts: { jitterMs?: number; eventDelayMs?: number } = {}) {
  let s = seed;
  const random = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let now = 1_800_000_000_000;
  let next = 1;
  const queue = new Map<number, { at: number; run: () => void }>();
  const items = new Map<string, string>();
  const listeners = new Map<string, Set<(k: string) => void>>();
  const throttle = new Map<string, number>();
  const push = (at: number, run: () => void) => {
    const id = next++;
    queue.set(id, { at, run });
    return id;
  };
  const tabs: { name: string; leading: boolean; release: () => void; hide: () => void }[] = [];

  function emit(writer: string, key: string) {
    for (const [name, set] of listeners) {
      if (name !== writer) push(now + Math.floor(random() * (opts.eventDelayMs ?? 0)), () => set.forEach((l) => l(key)));
    }
  }

  function tab(name: string) {
    const storage: KeyValueStoragePort = {
      getItem: (k) => items.get(k) ?? null,
      setItem: (k, v) => {
        items.set(k, v);
        emit(name, k);
      },
      removeItem: (k) => {
        items.delete(k);
        emit(name, k);
      },
      keys: () => [...items.keys()],
    };
    const hide = new Set<() => void>();
    const t = { name, leading: false, release: () => undefined as void, hide: () => hide.forEach((l) => l()) };
    const lock = createLeaseLeaderLock({
      storage,
      storageEvents: {
        subscribe: (l) => {
          const set = listeners.get(name) ?? new Set();
          set.add(l);
          listeners.set(name, set);
          return () => set.delete(l);
        },
      },
      tabId: name,
      now: () => now,
      timers: {
        setTimeout: (cb, ms) => push(now + ms + Math.floor(random() * (opts.jitterMs ?? 0)) + (throttle.get(name) ?? 0), cb),
        clearTimeout: (h) => queue.delete(h as number),
      },
      pageHide: {
        subscribe: (l) => {
          hide.add(l);
          return () => hide.delete(l);
        },
      },
    });
    const rel = lock.request(
      () => {
        t.leading = true;
      },
      () => undefined,
      () => {
        t.leading = false;
      }
    );
    t.release = () => {
      t.leading = false;
      rel();
    };
    tabs.push(t);
    return t;
  }

  function advance(ms: number, check = true) {
    const end = now + ms;
    for (;;) {
      const due = [...queue.entries()].filter(([, q]) => q.at <= end).sort(([a, x], [b, y]) => x.at - y.at || a - b)[0];
      if (!due) break;
      queue.delete(due[0]);
      now = Math.max(now, due[1].at);
      due[1].run();
      if (check) {
        const leaders = tabs.filter((t) => t.leading);
        assert.ok(leaders.length <= 1, `two leaders at ${now}: ${leaders.map((t) => t.name)}`);
      }
    }
    now = end;
  }

  return {
    tab,
    advance,
    tabs,
    throttle,
    lease: () => JSON.parse(items.get(SYNC_LEADER_LEASE_KEY) ?? 'null') as { tabId: string } | null,
  };
}

describe('leader lease regressions (S13.3)', () => {
  it('jittered timers and delayed storage events: never two leaders, always one eventually (20 seeds, 4 tabs, churn)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const w = world(seed, { jitterMs: 2500, eventDelayMs: 50 });
      w.tab('A');
      w.tab('B');
      w.advance(37);
      w.tab('C');
      w.tab('D');
      w.advance(30_000);
      assert.strictEqual(w.tabs.filter((t) => t.leading).length, 1, `seed ${seed}: one leader`);
      const leader = w.tabs.find((t) => t.leading)!;
      leader.hide();
      leader.release();
      w.advance(30_000);
      assert.strictEqual(w.tabs.filter((t) => t.leading).length, 1, `seed ${seed}: takeover after release`);
    }
  });

  it('a leader whose timers are throttled (events still delivered) steps down once another tab holds a valid lease', () => {
    const w = world(7);
    const a = w.tab('A');
    w.advance(1_000);
    assert.strictEqual(a.leading, true);
    const b = w.tab('B');
    w.advance(500);
    w.throttle.set('A', 60_000); // background tab: chained timers run about once a minute
    w.advance(2_100);
    let overlapMs = 0;
    for (let i = 0; i < 700; i++) {
      w.advance(100, false);
      if (a.leading && b.leading) overlapMs += 100;
    }
    assert.strictEqual(w.lease()?.tabId, 'B');
    assert.strictEqual(overlapMs, 0, `A and B both led for ${overlapMs} ms while B held a valid lease`);
  });
});
