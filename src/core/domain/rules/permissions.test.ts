import { describe, it } from 'node:test';
import assert from 'node:assert';
import { can } from './permissions';

describe('user management permission (S1)', () => {
  it('grants MANAGE_USERS to ADMIN only', () => {
    assert.strictEqual(can('ADMIN', 'MANAGE_USERS'), true);
    assert.strictEqual(can('HEAD_COACH', 'MANAGE_USERS'), false);
    assert.strictEqual(can('ASSISTANT_STATISTICIAN', 'MANAGE_USERS'), false);
  });

  it('keeps the permissions each role already had', () => {
    assert.strictEqual(can('ADMIN', 'MANAGE_DIVISIONS'), true);
    assert.strictEqual(can('HEAD_COACH', 'MANAGE_CHART_CATALOG'), true);
    assert.strictEqual(can('HEAD_COACH', 'MANAGE_DIVISIONS'), false);
    assert.strictEqual(can('ASSISTANT_STATISTICIAN', 'RECORD_LIVE'), true);
    assert.strictEqual(can('ASSISTANT_STATISTICIAN', 'MANAGE_MATCHES'), false);
  });
});
