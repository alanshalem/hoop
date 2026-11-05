import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AUTH_STORE_VERSION, migrateAuthState, useAuthStore } from './useAuthStore';

// Without localStorage (node) zustand skips `persist`, so the migration is tested directly.

const V1_USER = { id: 'user-admin-1', email: 'admin@camg.com.ar', name: 'Admin', role: 'ADMIN' };

describe('auth store migration', () => {
  it('is version 2 and keeps a current profile as stored', () => {
    assert.strictEqual(AUTH_STORE_VERSION, 2);
    const current = { user: { ...V1_USER, mustChangePassword: true } };
    assert.strictEqual(migrateAuthState(current, AUTH_STORE_VERSION), current);
  });

  it('keeps a v1 cached user without the flag, so the update logs nobody out', () => {
    assert.deepStrictEqual(migrateAuthState({ user: V1_USER }, 1), {
      user: { ...V1_USER, mustChangePassword: false },
    });
  });

  it('keeps a flag a v1 cached user already had', () => {
    assert.deepStrictEqual(migrateAuthState({ user: { ...V1_USER, mustChangePassword: true } }, 1), {
      user: { ...V1_USER, mustChangePassword: true },
    });
  });

  it('keeps a v1 session without a user logged out', () => {
    assert.deepStrictEqual(migrateAuthState({ user: null }, 1), { user: null });
  });

  it('logs out a malformed v1 profile or an unknown version', () => {
    for (const [persisted, version] of [
      [{ user: { ...V1_USER, role: 'OWNER' } }, 1],
      [{ user: { id: 'x' } }, 1],
      [{ user: 'admin' }, 1],
      [null, 1],
      [{ user: V1_USER }, 0],
      [{ user: V1_USER }, 7],
    ] as const) {
      assert.deepStrictEqual(migrateAuthState(persisted, version), { user: null }, JSON.stringify([persisted, version]));
    }
  });
});

describe('auth store actions', () => {
  it('sets and clears the cached user (PRESERVE)', () => {
    const user = { ...V1_USER, role: 'ADMIN' as const, mustChangePassword: true };
    useAuthStore.getState().setUser(user);
    assert.deepStrictEqual(useAuthStore.getState().user, user);
    useAuthStore.getState().clearUser();
    assert.strictEqual(useAuthStore.getState().user, null);
  });
});
