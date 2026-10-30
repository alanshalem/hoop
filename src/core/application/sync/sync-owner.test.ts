import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createEmptyOutbox, enqueueChanges } from './outbox';
import { resolveSyncOwnership } from './sync-owner';
import type { SyncOwner, SyncPersistedData } from './sync-types';
import { makePlayer } from '@/core/testing/fixtures';

const NOW = Date.parse('2026-10-30T18:00:00.000Z');
const ANA: SyncOwner = { id: 'u-ana', name: 'Ana Pérez' };
const LUIS: SyncOwner = { id: 'u-luis', name: 'Luis Gómez' };

function persisted(owner: SyncOwner | null, pendingPlayers: string[]): SyncPersistedData {
  const { outbox, versions } = enqueueChanges(
    { outbox: createEmptyOutbox(), versions: { 'player:old': '2026-10-01T00:00:00.000Z' } },
    { records: pendingPlayers.map((id) => ({ kind: 'player', id, data: makePlayer({ id }), deleted: false })), events: [] },
    NOW
  );
  return { owner, cursor: '120', versions, outbox, lastSyncedAt: '2026-10-30T17:00:00.000Z' };
}

describe('resolveSyncOwnership (shared device)', () => {
  it('claims unowned sync data for the user and keeps its outbox', () => {
    const decision = resolveSyncOwnership(persisted(null, ['p1']), ANA);
    assert.deepStrictEqual(decision, { action: 'keep', patch: { owner: ANA } });
  });

  it('keeps and later flushes the outbox when the same user logs in again (after a 401)', () => {
    const renamed = { ...ANA, name: 'Ana P.' };
    const decision = resolveSyncOwnership(persisted(ANA, ['p1', 'p2']), renamed);
    assert.deepStrictEqual(decision, { action: 'keep', patch: { owner: renamed } });
  });

  it('discards the previous user outbox and forces a full resync when a different user logs in', () => {
    const decision = resolveSyncOwnership(persisted(ANA, ['p1', 'p2']), LUIS);
    assert.deepStrictEqual(decision, {
      action: 'discard',
      previousOwner: ANA,
      discardedCount: 2,
      patch: { owner: LUIS, cursor: null, versions: {}, outbox: createEmptyOutbox() },
    });
  });

  it('also resets the baseline for a different user with nothing pending', () => {
    const decision = resolveSyncOwnership(persisted(ANA, []), LUIS);
    assert.strictEqual(decision.action, 'discard');
    assert.strictEqual(decision.action === 'discard' ? decision.discardedCount : -1, 0);
  });
});
