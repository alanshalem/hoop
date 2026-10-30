import { describe, it } from 'node:test';
import assert from 'node:assert';
import { makePlayer } from '@/core/testing/fixtures';
import { createEditHandoff, HANDOFF_KEY_PREFIX, type HandoffEdit } from './edit-handoff';
import type { KeyValueStoragePort } from './tab-coordinator';

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  const storage: KeyValueStoragePort = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
    removeItem: (key) => items.delete(key),
    keys: () => [...items.keys()],
  };
  return { storage, items };
}

const edit = (id: string, dorsal: number): HandoffEdit => ({
  id,
  diff: { records: [{ kind: 'player', id: 'p1', data: makePlayer({ dorsal }), deleted: false }], events: [] },
});

describe('edit handoff between tabs (S13.3, T14)', () => {
  it('persists the unacknowledged edits of a tab under its own key; an empty list removes the key', () => {
    const { storage, items } = memoryStorage();
    let now = 1_000;
    const handoff = createEditHandoff({ storage, tabId: 'tab-a', owner: () => 'user-1', now: () => now });
    handoff.save([edit('e1', 5)]);
    const saved = JSON.parse(items.get(`${HANDOFF_KEY_PREFIX}tab-a`) ?? 'null') as { owner: string; savedAt: number; edits: HandoffEdit[] };
    assert.strictEqual(saved.owner, 'user-1');
    assert.strictEqual(saved.savedAt, 1_000);
    assert.deepStrictEqual(saved.edits, [edit('e1', 5)]);

    now = 2_000;
    handoff.save([]);
    assert.ok(!items.has(`${HANDOFF_KEY_PREFIX}tab-a`));
  });

  it('drains the edits every tab of the same user left (oldest first) and removes them', () => {
    const { storage, items } = memoryStorage();
    let now = 1_000;
    const closedTab = createEditHandoff({ storage, tabId: 'tab-closed', owner: () => 'user-1', now: () => now });
    const leader = createEditHandoff({ storage, tabId: 'tab-leader', owner: () => 'user-1', now: () => now });
    now = 3_000;
    closedTab.save([edit('late', 9)]);
    now = 2_000;
    createEditHandoff({ storage, tabId: 'tab-other', owner: () => 'user-1', now: () => now }).save([edit('early', 7)]);

    assert.deepStrictEqual(leader.drain(), [edit('early', 7), edit('late', 9)]);
    assert.deepStrictEqual([...items.keys()], [], 'drained keys are removed');
    assert.deepStrictEqual(leader.drain(), [], 'draining twice gives nothing');
  });

  it("discards another user's edits instead of handing them over", () => {
    const { storage, items } = memoryStorage();
    createEditHandoff({ storage, tabId: 'tab-x', owner: () => 'user-2', now: () => 1 }).save([edit('foreign', 1)]);
    const leader = createEditHandoff({ storage, tabId: 'tab-leader', owner: () => 'user-1', now: () => 2 });
    assert.deepStrictEqual(leader.drain(), []);
    assert.strictEqual(items.size, 0);
  });

  it('leaves values it does not understand (another app version) and unrelated keys alone', () => {
    const { storage, items } = memoryStorage({
      [`${HANDOFF_KEY_PREFIX}tab-old`]: '{"v":999,"edits":[]}',
      [`${HANDOFF_KEY_PREFIX}tab-bad`]: 'not json',
      'hoop-club-storage': '{}',
    });
    const leader = createEditHandoff({ storage, tabId: 'tab-leader', owner: () => 'user-1', now: () => 1 });
    assert.deepStrictEqual(leader.drain(), []);
    assert.deepStrictEqual([...items.keys()].sort(), ['hoop-club-storage', `${HANDOFF_KEY_PREFIX}tab-bad`, `${HANDOFF_KEY_PREFIX}tab-old`]);
  });
});
