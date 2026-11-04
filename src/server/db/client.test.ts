import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createDatabase, DEFAULT_POOL_MAX, POOL_IDLE_TIMEOUT_MS, readPoolMax } from './client';

/** Pool settings only: `pg` connects lazily, so no database is needed. */
describe('database pool (S4: serverless + Supabase pooler)', () => {
  it('reads DATABASE_POOL_MAX, defaulting to a small pool', () => {
    assert.strictEqual(DEFAULT_POOL_MAX, 3);
    assert.strictEqual(readPoolMax(undefined), 3);
    assert.strictEqual(readPoolMax(''), 3);
    assert.strictEqual(readPoolMax('1'), 1);
    assert.strictEqual(readPoolMax('10'), 10);
  });

  it('refuses a DATABASE_POOL_MAX that is not a positive integer', () => {
    for (const value of ['0', '-2', '2.5', 'abc', ' 4']) {
      assert.throws(() => readPoolMax(value), /DATABASE_POOL_MAX must be a positive integer/, value);
    }
  });

  it('creates a small pool that closes idle connections', async () => {
    const small = createDatabase('postgres://user:secret@localhost:5432/none');
    assert.strictEqual(small.pool.options.max, DEFAULT_POOL_MAX);
    assert.strictEqual(small.pool.options.idleTimeoutMillis, POOL_IDLE_TIMEOUT_MS);
    assert.ok(small.pool.listenerCount('error') > 0, 'an idle connection the pooler drops never crashes the process');
    await small.pool.end();

    const sized = createDatabase('postgres://user:secret@localhost:5432/none', { max: 7 });
    assert.strictEqual(sized.pool.options.max, 7);
    await sized.pool.end();
  });
});
