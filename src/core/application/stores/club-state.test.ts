import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  CLUB_STORE_VERSION,
  createInitialClubState,
  migrateClubState,
} from './club-state';

const NOW = new Date('2026-10-30T18:00:00.000Z');

describe('club store state', () => {
  it('starts from the seed with the live match and Primera selected', () => {
    const state = createInitialClubState(NOW);
    assert.strictEqual(state.activeMatchId, 'match-live-today');
    assert.strictEqual(state.activeDivisionId, 'div-primera');
    assert.strictEqual(state.currentUser.role, 'HEAD_COACH');
    assert.ok(state.users.length >= 5);
  });

  it('reseeds when the persisted version is older (S5.14)', () => {
    const legacy = { matches: [{ id: 'broken' }] };
    const migrated = migrateClubState(legacy, CLUB_STORE_VERSION - 1, NOW);
    assert.deepStrictEqual(migrated, createInitialClubState(NOW));
  });

  it('reseeds unversioned (version 0) storage', () => {
    const migrated = migrateClubState(undefined, 0, NOW);
    assert.ok(migrated.matches.some((m) => m.id === 'match-live-today'));
  });

  it('keeps persisted data of the current version', () => {
    const persisted = createInitialClubState(NOW);
    persisted.activeMatchId = 'match-past-1';
    assert.strictEqual(
      migrateClubState(persisted, CLUB_STORE_VERSION, NOW).activeMatchId,
      'match-past-1'
    );
  });
});
