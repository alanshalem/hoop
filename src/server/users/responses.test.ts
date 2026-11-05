import { describe, it } from 'node:test';
import assert from 'node:assert';
import { USER_MESSAGES } from './messages';
import { userAdminErrorResponse } from './responses';

describe('user administration refusals (S6)', () => {
  it('answers each refusal with its status, Spanish message and typed reason', async () => {
    const expected = [
      ['EMAIL_TAKEN', 409, USER_MESSAGES.emailTaken],
      ['USER_NOT_FOUND', 404, USER_MESSAGES.userNotFound],
      ['SELF_DEACTIVATION', 409, USER_MESSAGES.selfDeactivation],
      ['SELF_ROLE_CHANGE', 409, USER_MESSAGES.selfRoleChange],
      ['LAST_ADMIN', 409, USER_MESSAGES.lastAdmin],
    ] as const;
    for (const [reason, status, error] of expected) {
      const response = userAdminErrorResponse(reason);
      assert.strictEqual(response.status, status, reason);
      assert.strictEqual(response.headers.get('cache-control'), 'no-store');
      assert.deepStrictEqual(await response.json(), { error, reason });
    }
  });
});
