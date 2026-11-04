import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createEmptyOutbox, enqueueChanges } from '@/core/application/sync/outbox';
import { toMatchRecord } from '@/core/application/sync/sync-records';
import { makeMatch, makePlayer } from '@/core/testing/fixtures';
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
    assert.strictEqual(SYNC_STORE_VERSION, 4);
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

describe('sync store persistence: match fields removed from the model (L6)', () => {
  it('migrates version 3 storage keeping its data but dropping unknown match fields from the outbox and versions', () => {
    const { outbox, versions } = enqueueChanges(
      { outbox: createEmptyOutbox(), versions: {} },
      { records: [{ kind: 'match', id: 'm-old', data: toMatchRecord(makeMatch({ id: 'm-old' })), deleted: false }], events: [] },
      NOW
    );
    const queued = outbox.records['match:m-old'];
    assert.ok(queued.kind === 'match' && queued.fieldVersions);
    const v3 = {
      ...persistedWithPending(),
      epoch: 'epoch-1',
      versions: { ...versions, 'match:m-old#activeLineupOwn': '2026-10-30T17:00:00.000Z' },
      outbox: {
        ...outbox,
        records: {
          ...outbox.records,
          'match:m-old': {
            ...queued,
            data: { ...queued.data, activeLineupOwn: ['p1'] },
            fieldVersions: { ...queued.fieldVersions, activeLineupOwn: '2026-10-30T17:00:00.000Z' },
          },
        },
      },
    };

    const migrated = migrateSyncStore(v3, 3);
    assert.deepStrictEqual(migrated, { ...v3, versions, outbox });
  });
});
