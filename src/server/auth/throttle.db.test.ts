import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import type { DatabaseConnection } from '../db/client';
import { authThrottles } from '../db/schema';
import { overlapping } from '../testing/overlap';
import { openTestDatabase } from '../testing/test-database';
import { THROTTLE_WINDOW_MS, clearThrottle, isThrottled, recordFailure } from './throttle';

const MINUTE = 60_000;
const LIMIT = 5;

describe('auth throttle (database, S3)', () => {
  let connection: DatabaseConnection;
  const keys: string[] = [];

  /** A key no other test uses. */
  function newKey(): string {
    const key = `test-throttle:${randomUUID()}`;
    keys.push(key);
    return key;
  }

  async function storedKeys(candidates: string[]): Promise<string[]> {
    const rows = await connection.db
      .select({ key: authThrottles.key })
      .from(authThrottles)
      .where(inArray(authThrottles.key, candidates));
    return rows.map((row) => row.key).sort();
  }

  before(async () => {
    connection = await openTestDatabase();
  });

  after(async () => {
    if (keys.length > 0) await connection.db.delete(authThrottles).where(inArray(authThrottles.key, keys));
    await connection.pool.end();
  });

  it('blocks a key for 15 minutes when its failures reach the limit', async () => {
    const key = newKey();
    const start = new Date();
    for (let failure = 1; failure < LIMIT; failure++) {
      const state = await recordFailure(connection.db, key, LIMIT, new Date(start.getTime() + failure * MINUTE));
      assert.deepStrictEqual(state, { failures: failure, blockedUntil: null });
    }
    assert.strictEqual(await isThrottled(connection.db, [key], new Date(start.getTime() + 4 * MINUTE)), false);

    const fifth = new Date(start.getTime() + 5 * MINUTE);
    const blocked = await recordFailure(connection.db, key, LIMIT, fifth);
    assert.deepStrictEqual(blocked, { failures: LIMIT, blockedUntil: new Date(fifth.getTime() + THROTTLE_WINDOW_MS) });

    assert.strictEqual(await isThrottled(connection.db, [key], fifth), true);
    assert.strictEqual(await isThrottled(connection.db, [key], new Date(fifth.getTime() + 15 * MINUTE - 1)), true);
    // The block ends exactly 15 minutes after the failure that reached the limit.
    assert.strictEqual(await isThrottled(connection.db, [key], new Date(fifth.getTime() + 15 * MINUTE)), false);
  });

  it('restarts counting when the 15-minute window expired, also after a block ended', async () => {
    const key = newKey();
    const start = new Date();
    for (let failure = 0; failure < LIMIT - 1; failure++) await recordFailure(connection.db, key, LIMIT, start);

    const later = new Date(start.getTime() + THROTTLE_WINDOW_MS);
    assert.deepStrictEqual(await recordFailure(connection.db, key, LIMIT, later), { failures: 1, blockedUntil: null });
    assert.strictEqual(await isThrottled(connection.db, [key], later), false);

    for (let failure = 2; failure <= LIMIT; failure++) await recordFailure(connection.db, key, LIMIT, later);
    assert.strictEqual(await isThrottled(connection.db, [key], later), true);

    const afterBlock = new Date(later.getTime() + THROTTLE_WINDOW_MS);
    assert.deepStrictEqual(await recordFailure(connection.db, key, LIMIT, afterBlock), { failures: 1, blockedUntil: null });
    assert.strictEqual(await isThrottled(connection.db, [key], afterBlock), false);
  });

  it('is blocked when any of the given keys is blocked', async () => {
    const blockedKey = newKey();
    const freeKey = newKey();
    const now = new Date();
    for (let failure = 0; failure < LIMIT; failure++) await recordFailure(connection.db, blockedKey, LIMIT, now);
    await recordFailure(connection.db, freeKey, LIMIT, now);

    assert.strictEqual(await isThrottled(connection.db, [freeKey], now), false);
    assert.strictEqual(await isThrottled(connection.db, [freeKey, blockedKey], now), true);
    assert.strictEqual(await isThrottled(connection.db, [newKey()], now), false);
    assert.strictEqual(await isThrottled(connection.db, [], now), false);
  });

  it('counts concurrent failures exactly', async () => {
    const key = newKey();
    const now = new Date();
    // The second failure waits on the row the first one has not committed yet.
    const [first, second] = await overlapping(
      connection,
      (tx) => recordFailure(tx, key, 20, now),
      (db) => recordFailure(db, key, 20, now)
    );
    assert.deepStrictEqual([first.failures, second.failures], [1, 2]);

    const states = await Promise.all(
      Array.from({ length: 10 }, () => recordFailure(connection.db, key, 20, now))
    );
    assert.deepStrictEqual(states.map((state) => state.failures).sort((a, b) => a - b), [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    assert.strictEqual((await recordFailure(connection.db, key, 20, now)).failures, 13);
  });

  it('clears a key: blocked no more and counting starts again', async () => {
    const key = newKey();
    const now = new Date();
    for (let failure = 0; failure < LIMIT; failure++) await recordFailure(connection.db, key, LIMIT, now);
    assert.strictEqual(await isThrottled(connection.db, [key], now), true);

    await clearThrottle(connection.db, key);
    assert.strictEqual(await isThrottled(connection.db, [key], now), false);
    assert.deepStrictEqual(await recordFailure(connection.db, key, LIMIT, now), { failures: 1, blockedUntil: null });
  });

  it('deletes rows whose window and block both ended when a failure is recorded', async () => {
    const stale = newKey();
    const blocked = newKey();
    const recent = newKey();
    const start = new Date();
    await recordFailure(connection.db, stale, LIMIT, start);
    for (let failure = 1; failure < LIMIT; failure++) await recordFailure(connection.db, blocked, LIMIT, start);
    await recordFailure(connection.db, blocked, LIMIT, new Date(start.getTime() + MINUTE));
    await recordFailure(connection.db, recent, LIMIT, new Date(start.getTime() + 2 * MINUTE));

    // At start + 15 min the window of `stale` ended; `blocked` stays until its block
    // ends (start + 16 min) and `recent` is still inside its window.
    const cleanup = new Date(start.getTime() + THROTTLE_WINDOW_MS);
    await recordFailure(connection.db, newKey(), LIMIT, cleanup);
    assert.deepStrictEqual(await storedKeys([stale, blocked, recent]), [blocked, recent].sort());
    assert.strictEqual(await isThrottled(connection.db, [blocked], cleanup), true);

    const blockEnded = new Date(start.getTime() + MINUTE + THROTTLE_WINDOW_MS);
    await recordFailure(connection.db, newKey(), LIMIT, blockEnded);
    assert.deepStrictEqual(await storedKeys([stale, blocked, recent]), [recent]);
  });
});
