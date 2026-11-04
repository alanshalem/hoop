import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getDb, readPoolMax, type DatabaseConnection } from './client';

/** Regression tests of DATABASE_POOL_MAX (S4, T9 verify). `pg` connects lazily: no database is needed. */

const INVALID_POOL_SIZES = ['3 ', '1e3', '0x5', '00', '+3', 'NaN'];
const globalForDb = globalThis as typeof globalThis & { hoopDb?: DatabaseConnection };
/** Read through a function: TypeScript would keep the narrowing of `delete` across getDb() calls. */
const cached = () => globalForDb.hoopDb;

describe('DATABASE_POOL_MAX validation (S4, T9 verify)', () => {
  it('accepts only plain positive integers', () => {
    for (const value of INVALID_POOL_SIZES) {
      assert.throws(() => readPoolMax(value), /DATABASE_POOL_MAX must be a positive integer/, JSON.stringify(value));
    }
  });

  it('getDb keeps no pool when the size is invalid, and caches the pool once it is valid', async () => {
    const saved = {
      url: process.env.DATABASE_URL,
      max: process.env.DATABASE_POOL_MAX,
      db: globalForDb.hoopDb,
    };
    process.env.DATABASE_URL = 'postgres://user:secret@localhost:5432/none';
    delete globalForDb.hoopDb;
    try {
      for (const value of INVALID_POOL_SIZES) {
        process.env.DATABASE_POOL_MAX = value;
        assert.throws(() => getDb(), /DATABASE_POOL_MAX must be a positive integer/, JSON.stringify(value));
        assert.strictEqual(cached(), undefined, `nothing cached for ${JSON.stringify(value)}`);
      }

      process.env.DATABASE_POOL_MAX = '2';
      const db = getDb();
      assert.strictEqual(cached()?.pool.options.max, 2);
      assert.strictEqual(getDb(), db, 'the valid pool is reused');
      await cached()?.pool.end();
    } finally {
      for (const [key, value] of [
        ['DATABASE_URL', saved.url],
        ['DATABASE_POOL_MAX', saved.max],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      if (saved.db) globalForDb.hoopDb = saved.db;
      else delete globalForDb.hoopDb;
    }
  });
});
