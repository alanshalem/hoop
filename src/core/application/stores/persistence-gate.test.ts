import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import { gatedLocalStorage, persistenceGate } from './persistence-gate';

describe('gatedLocalStorage (S13.3: only the leader tab writes)', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let items: Map<string, string>;

  beforeEach(() => {
    items = new Map([['hoop-club-storage', 'persisted']]);
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => items.set(key, value),
        removeItem: (key: string) => items.delete(key),
      },
    });
  });

  afterEach(() => {
    persistenceGate.setWritable(true);
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('writes through while writable', () => {
    const storage = gatedLocalStorage();
    storage.setItem('hoop-club-storage', 'next');
    assert.strictEqual(storage.getItem('hoop-club-storage'), 'next');
  });

  it('skips writes and removals while not writable, but still reads', () => {
    const storage = gatedLocalStorage();
    persistenceGate.setWritable(false);
    storage.setItem('hoop-club-storage', 'from a follower');
    storage.removeItem('hoop-club-storage');
    assert.strictEqual(storage.getItem('hoop-club-storage'), 'persisted');

    persistenceGate.setWritable(true);
    storage.setItem('hoop-club-storage', 'from the leader');
    assert.strictEqual(items.get('hoop-club-storage'), 'from the leader');
  });
});
