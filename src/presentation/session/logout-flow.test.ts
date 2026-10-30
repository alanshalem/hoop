import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { ApiResult } from '@/core/application/sync/sync-types';
import type { ConfirmOptions, NotifyOptions } from '@/presentation/organisms/DialogHost/dialog-store';
import { OFFLINE_LOGOUT_NOTICE, runLogout, type LogoutDeps } from './logout-flow';

function fakeDeps(options: { pending?: number; afterFlush?: number; confirmed?: boolean; logout?: ApiResult<void> } = {}) {
  const calls: string[] = [];
  const notices: NotifyOptions[] = [];
  const confirms: ConfirmOptions[] = [];
  const deps: LogoutDeps = {
    pendingCount: () => options.pending ?? 0,
    flush: async () => {
      calls.push('flush');
      return options.afterFlush ?? 0;
    },
    confirm: async (request) => {
      confirms.push(request);
      return options.confirmed ?? true;
    },
    notify: async (request) => {
      calls.push('notify');
      notices.push(request);
    },
    revokeServerSession: async () => {
      calls.push('revoke');
      return options.logout ?? { ok: true, value: undefined };
    },
    clearLocalSession: () => {
      calls.push('clear');
    },
  };
  return { deps, calls, notices, confirms };
}

describe('runLogout (S10.8)', () => {
  it('revokes the server session and clears the local one without notices when online', async () => {
    const { deps, calls, notices } = fakeDeps();
    assert.strictEqual(await runLogout(deps), true);
    assert.deepStrictEqual(calls, ['revoke', 'clear']);
    assert.deepStrictEqual(notices, []);
  });

  it('still clears the local session offline and warns that the server session stays active', async () => {
    const { deps, calls, notices } = fakeDeps({ logout: { ok: false, error: 'NETWORK' } });
    assert.strictEqual(await runLogout(deps), true);
    assert.deepStrictEqual(calls, ['revoke', 'clear', 'notify']);
    assert.deepStrictEqual(notices, [OFFLINE_LOGOUT_NOTICE]);
    assert.strictEqual(OFFLINE_LOGOUT_NOTICE.tone, 'warning');
    assert.match(OFFLINE_LOGOUT_NOTICE.message, /30 días/);
  });

  it('does not warn when the server already rejected the session (401)', async () => {
    const { deps, calls, notices } = fakeDeps({ logout: { ok: false, error: 'UNAUTHORIZED', status: 401 } });
    assert.strictEqual(await runLogout(deps), true);
    assert.deepStrictEqual(calls, ['revoke', 'clear']);
    assert.deepStrictEqual(notices, []);
  });

  it('keeps the session when the user cancels with unsynced changes', async () => {
    const { deps, calls, confirms } = fakeDeps({ pending: 2, afterFlush: 2, confirmed: false });
    assert.strictEqual(await runLogout(deps), false);
    assert.deepStrictEqual(calls, ['flush']);
    assert.match(String(confirms[0].message), /2 cambios sin sincronizar/);
  });

  it('does not ask when the flush sent every pending change', async () => {
    const { deps, calls, confirms } = fakeDeps({ pending: 1, afterFlush: 0 });
    assert.strictEqual(await runLogout(deps), true);
    assert.deepStrictEqual(calls, ['flush', 'revoke', 'clear']);
    assert.deepStrictEqual(confirms, []);
  });
});
