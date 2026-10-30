import { describe, it } from 'node:test';
import assert from 'node:assert';
import { describeSyncStatus, formatTimeAgo, pendingLabel } from './sync-status-view';

const NOW = Date.parse('2026-10-30T18:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('formatTimeAgo', () => {
  it('uses short relative Spanish copy', () => {
    assert.strictEqual(formatTimeAgo(ago(10_000), NOW), 'hace instantes');
    assert.strictEqual(formatTimeAgo(ago(5 * 60_000), NOW), 'hace 5 min');
    assert.strictEqual(formatTimeAgo(ago(3 * 3_600_000), NOW), 'hace 3 h');
    assert.strictEqual(formatTimeAgo('2026-10-27T10:00:00.000Z', NOW), 'el 27/10');
  });
});

describe('pendingLabel', () => {
  it('pluralizes the pending count', () => {
    assert.strictEqual(pendingLabel(0), 'sin cambios pendientes');
    assert.strictEqual(pendingLabel(1), '1 pendiente');
    assert.strictEqual(pendingLabel(4), '4 pendientes');
  });
});

describe('describeSyncStatus (S10.8)', () => {
  const base = { status: 'idle' as const, pending: 0, lastSyncedAt: ago(120_000), lastError: null };

  it('Sincronizado with the time of the last sync', () => {
    assert.deepStrictEqual(describeSyncStatus(base, NOW), {
      state: 'synced',
      label: 'Sincronizado',
      detail: 'hace 2 min',
    });
  });

  it('Sincronizando while syncing, with pending changes or before the first sync', () => {
    assert.strictEqual(describeSyncStatus({ ...base, status: 'syncing' }, NOW).label, 'Sincronizando');
    assert.deepStrictEqual(describeSyncStatus({ ...base, pending: 2 }, NOW), {
      state: 'syncing',
      label: 'Sincronizando',
      detail: '2 pendientes',
    });
    assert.strictEqual(describeSyncStatus({ ...base, lastSyncedAt: null }, NOW).state, 'syncing');
  });

  it('Sin conexión with the pending count', () => {
    assert.deepStrictEqual(describeSyncStatus({ ...base, status: 'offline', pending: 3 }, NOW), {
      state: 'offline',
      label: 'Sin conexión',
      detail: '3 pendientes',
    });
  });

  it('Error with the reason and a retry hint', () => {
    assert.deepStrictEqual(describeSyncStatus({ ...base, status: 'error', lastError: 'Falló el servidor.' }, NOW), {
      state: 'error',
      label: 'Error',
      detail: 'Falló el servidor. Toca para reintentar.',
    });
    assert.strictEqual(describeSyncStatus({ ...base, status: 'error' }, NOW).detail, 'Toca para reintentar.');
  });
});
