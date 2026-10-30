import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { UserRole } from '@/core/domain/entities/club.types';
import {
  authorizeWrite,
  canWrite,
  requiredPermissions,
  type SyncEntityKind,
  type WriteOperation,
} from './authorize';

const ROLES: UserRole[] = ['ADMIN', 'HEAD_COACH', 'ASSISTANT_STATISTICIAN'];
const KINDS: SyncEntityKind[] = ['division', 'team', 'player', 'match', 'event'];
const OPERATIONS: WriteOperation[] = ['create', 'update', 'delete'];

/**
 * Expected matrix (S10.4), written out explicitly so the test does not
 * re-derive it from the implementation.
 */
const EXPECTED: Record<UserRole, Record<SyncEntityKind, Record<WriteOperation, boolean>>> = {
  ADMIN: {
    division: { create: true, update: true, delete: true },
    team: { create: true, update: true, delete: true },
    player: { create: true, update: true, delete: true },
    match: { create: true, update: true, delete: true },
    event: { create: true, update: true, delete: true },
  },
  HEAD_COACH: {
    division: { create: false, update: false, delete: false },
    team: { create: false, update: false, delete: false },
    player: { create: true, update: true, delete: true },
    match: { create: true, update: true, delete: true },
    event: { create: true, update: true, delete: true },
  },
  ASSISTANT_STATISTICIAN: {
    division: { create: false, update: false, delete: false },
    team: { create: false, update: false, delete: false },
    player: { create: false, update: false, delete: false },
    match: { create: false, update: true, delete: false },
    event: { create: true, update: true, delete: true },
  },
};

describe('server RBAC (authorize)', () => {
  it('maps every (kind, operation) to the permissions required by S10.4', () => {
    for (const operation of OPERATIONS) {
      assert.deepStrictEqual(requiredPermissions('division', operation), ['MANAGE_DIVISIONS']);
      assert.deepStrictEqual(requiredPermissions('team', operation), ['MANAGE_DIVISIONS']);
      assert.deepStrictEqual(requiredPermissions('player', operation), ['MANAGE_PLAYERS']);
      assert.deepStrictEqual(requiredPermissions('event', operation), ['RECORD_LIVE']);
    }
    assert.deepStrictEqual(requiredPermissions('match', 'create'), ['MANAGE_MATCHES']);
    assert.deepStrictEqual(requiredPermissions('match', 'delete'), ['MANAGE_MATCHES']);
    assert.deepStrictEqual(requiredPermissions('match', 'update'), [
      'MANAGE_MATCHES',
      'MANAGE_LINEUP',
      'RECORD_LIVE',
    ]);
  });

  it('allows or denies each role exactly as the matrix says', () => {
    for (const role of ROLES) {
      for (const kind of KINDS) {
        for (const operation of OPERATIONS) {
          assert.strictEqual(
            canWrite(role, kind, operation),
            EXPECTED[role][kind][operation],
            `${role} ${operation} ${kind}`
          );
        }
      }
    }
  });

  it('returns 401 without a user, 403 when forbidden and allowed otherwise', () => {
    assert.deepStrictEqual(authorizeWrite(null, 'event', 'create'), { allowed: false, status: 401 });
    assert.deepStrictEqual(authorizeWrite({ role: 'ASSISTANT_STATISTICIAN' }, 'player', 'update'), {
      allowed: false,
      status: 403,
    });
    assert.deepStrictEqual(authorizeWrite({ role: 'ASSISTANT_STATISTICIAN' }, 'match', 'update'), {
      allowed: true,
    });
    assert.deepStrictEqual(authorizeWrite({ role: 'ADMIN' }, 'division', 'delete'), { allowed: true });
  });
});
