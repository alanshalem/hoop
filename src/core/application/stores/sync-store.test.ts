import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createEmptyOutbox, enqueueChanges } from '@/core/application/sync/outbox';
import { makePlayer } from '@/core/testing/fixtures';
import { createInitialSyncData, migrateSyncStore, SYNC_STORE_VERSION } from './useSyncStore';

const NOW = Date.parse('2026-10-30T18:00:00.000Z');

function persistedWithPending() {
  const { outbox, versions } = enqueueChanges(
    { outbox: createEmptyOutbox(), versions: {} },
    { records: [{ kind: 'player', id: 'p-old', data: makePlayer({ id: 'p-old' }), deleted: false }], events: [] },
    NOW
  );
  return {
    owner: { id: 'u-old', name: 'Old Owner' },
    cursor: '1200',
    versions,
    outbox,
    lastSyncedAt: '2026-10-30T17:00:00.000Z',
  };
}

describe('sync store persistence (S1, L5)', () => {
  it('drops owner, cursor, versions and outbox of every older version, so old changes are never pushed', () => {
    assert.strictEqual(SYNC_STORE_VERSION, 3);
    const { owner, cursor, versions, outbox, lastSyncedAt, epoch } = createInitialSyncData();
    const fresh = { owner, cursor, versions, outbox, lastSyncedAt, epoch };
    for (const version of [0, 1, 2]) {
      assert.deepStrictEqual(migrateSyncStore(persistedWithPending(), version), fresh, `version ${version}`);
    }
    assert.strictEqual(fresh.epoch, null);
  });

  it('keeps storage of the current version', () => {
    const current = { ...persistedWithPending(), epoch: 'epoch-1' };
    assert.strictEqual(migrateSyncStore(current, SYNC_STORE_VERSION), current);
  });
});
