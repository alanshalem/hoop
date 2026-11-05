import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AUTH_MESSAGES } from '../auth/messages';
import { userManagementRefusal } from './authorize';
import { USER_MESSAGES } from './messages';

const USER = { id: 'u-1', email: 'a@camg.com.ar', name: 'Ana', mustChangePassword: false };

async function assertError(response: Response | null, status: number, error: string): Promise<void> {
  assert.ok(response);
  assert.strictEqual(response.status, status);
  assert.strictEqual(response.headers.get('cache-control'), 'no-store');
  assert.deepStrictEqual(await response.json(), { error });
}

describe('user management guard (S1)', () => {
  it('answers 401 without a session', async () => {
    await assertError(userManagementRefusal(null), 401, AUTH_MESSAGES.unauthenticated);
  });

  it('answers 403 for roles without MANAGE_USERS', async () => {
    for (const role of ['HEAD_COACH', 'ASSISTANT_STATISTICIAN'] as const) {
      await assertError(userManagementRefusal({ ...USER, role }), 403, USER_MESSAGES.forbidden);
    }
  });

  it('lets an admin through', () => {
    assert.strictEqual(userManagementRefusal({ ...USER, role: 'ADMIN' }), null);
  });
});
