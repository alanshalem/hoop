import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import type { DatabaseConnection } from '../db/client';
import { authThrottles, users } from '../db/schema';
import { openTestDatabase } from '../testing/test-database';
import { resetUserPassword } from '../users/service';
import { attemptLogin } from './authenticate';
import { hashPassword } from './password';
import { THROTTLE_LIMITS, THROTTLE_WINDOW_MS, isThrottled, recordFailure, throttleKey } from './throttle';

const PASSWORD = 'secret-1922';
const WRONG = 'wrong-password';
const INVALID = { ok: false, error: 'INVALID_CREDENTIALS' } as const;
const BLOCKED = { ok: false, error: 'TOO_MANY_ATTEMPTS' } as const;

describe('login throttling (database, S1, S3)', () => {
  let connection: DatabaseConnection;
  let passwordHash: string;
  const createdIds: string[] = [];
  const keys: string[] = [];

  async function insertUser(role: 'ADMIN' | 'ASSISTANT_STATISTICIAN' = 'ASSISTANT_STATISTICIAN') {
    const id = `test-user-${randomUUID()}`;
    const email = `${id}@test.camg.com.ar`;
    await connection.db.insert(users).values({ id, email, name: 'Usuario de prueba', role, passwordHash });
    createdIds.push(id);
    keys.push(throttleKey.loginEmail(email));
    return { id, email };
  }

  function unknownEmail(): string {
    const email = `nadie-${randomUUID()}@test.camg.com.ar`;
    keys.push(throttleKey.loginEmail(email));
    return email;
  }

  function newIp(): string {
    const ip = `test-ip-${randomUUID()}`;
    keys.push(throttleKey.loginIp(ip));
    return ip;
  }

  before(async () => {
    connection = await openTestDatabase();
    passwordHash = await hashPassword(PASSWORD);
  });

  after(async () => {
    if (keys.length > 0) await connection.db.delete(authThrottles).where(inArray(authThrottles.key, keys));
    for (const id of createdIds) await connection.db.delete(users).where(eq(users.id, id));
    await connection.pool.end();
  });

  it('refuses an email for 15 minutes after 5 failures, even with the right password', async () => {
    const user = await insertUser();
    const start = new Date();
    for (let failure = 0; failure < 5; failure++) {
      // Case and spaces do not make a different email.
      const email = failure % 2 === 0 ? user.email : `  ${user.email.toUpperCase()} `;
      assert.deepStrictEqual(await attemptLogin(connection.db, { email, password: WRONG, ip: null }, start), INVALID);
    }

    const right = { email: user.email, password: PASSWORD, ip: null };
    assert.deepStrictEqual(await attemptLogin(connection.db, right, start), BLOCKED);
    assert.deepStrictEqual(await attemptLogin(connection.db, { ...right, password: WRONG }, start), BLOCKED);
    const almost = new Date(start.getTime() + THROTTLE_WINDOW_MS - 1);
    assert.deepStrictEqual(await attemptLogin(connection.db, right, almost), BLOCKED);

    const result = await attemptLogin(connection.db, right, new Date(start.getTime() + THROTTLE_WINDOW_MS));
    assert.ok(result.ok);
    assert.strictEqual(result.user.id, user.id);
  });

  it('throttles an unknown email the same way (no enumeration)', async () => {
    const email = unknownEmail();
    const now = new Date();
    for (let failure = 0; failure < 5; failure++) {
      assert.deepStrictEqual(await attemptLogin(connection.db, { email, password: WRONG, ip: null }, now), INVALID);
    }
    assert.deepStrictEqual(await attemptLogin(connection.db, { email, password: PASSWORD, ip: null }, now), BLOCKED);
  });

  it('counts a deactivated account like a wrong password', async () => {
    const user = await insertUser();
    await connection.db.update(users).set({ active: false }).where(eq(users.id, user.id));
    const attempt = { email: user.email, password: PASSWORD, ip: null };
    for (let failure = 0; failure < 5; failure++) assert.deepStrictEqual(await attemptLogin(connection.db, attempt), INVALID);
    assert.deepStrictEqual(await attemptLogin(connection.db, attempt), BLOCKED);
  });

  it('clears the email counter on a successful login', async () => {
    const user = await insertUser();
    const wrong = { email: user.email, password: WRONG, ip: null };
    const right = { email: user.email, password: PASSWORD, ip: null };
    for (let failure = 0; failure < 4; failure++) await attemptLogin(connection.db, wrong);
    assert.ok((await attemptLogin(connection.db, right)).ok);
    for (let failure = 0; failure < 4; failure++) assert.deepStrictEqual(await attemptLogin(connection.db, wrong), INVALID);
    assert.ok((await attemptLogin(connection.db, right)).ok);
  });

  it('refuses a client IP after 20 failures in 15 minutes, for any email', async () => {
    const user = await insertUser();
    const ip = newIp();
    for (let failure = 0; failure < 20; failure++) {
      const attempt = { email: unknownEmail(), password: WRONG, ip };
      assert.deepStrictEqual(await attemptLogin(connection.db, attempt), INVALID, `failure ${failure + 1}`);
    }

    assert.deepStrictEqual(await attemptLogin(connection.db, { email: user.email, password: PASSWORD, ip }), BLOCKED);
    // Another IP, or no IP at all, still logs in.
    assert.ok((await attemptLogin(connection.db, { email: user.email, password: PASSWORD, ip: newIp() })).ok);
    assert.ok((await attemptLogin(connection.db, { email: user.email, password: PASSWORD, ip: null })).ok);
    // A success does not clear the IP counter.
    assert.deepStrictEqual(await attemptLogin(connection.db, { email: user.email, password: PASSWORD, ip }), BLOCKED);
  });

  it('lets the admin unblock an account by resetting its password', async () => {
    const admin = await insertUser('ADMIN');
    const user = await insertUser();
    const passwordChangeKey = throttleKey.passwordChange(user.id);
    keys.push(passwordChangeKey);
    for (let failure = 0; failure < 5; failure++) {
      await attemptLogin(connection.db, { email: user.email, password: WRONG, ip: null });
      await recordFailure(connection.db, passwordChangeKey, THROTTLE_LIMITS.passwordChange);
    }
    assert.deepStrictEqual(await attemptLogin(connection.db, { email: user.email, password: PASSWORD, ip: null }), BLOCKED);
    assert.strictEqual(await isThrottled(connection.db, [passwordChangeKey]), true);

    const reset = await resetUserPassword(connection.db, admin, user.id, 'temporal-2024');
    assert.ok(reset.ok);
    assert.strictEqual(await isThrottled(connection.db, [passwordChangeKey]), false);
    const result = await attemptLogin(connection.db, { email: user.email, password: 'temporal-2024', ip: null });
    assert.ok(result.ok);
    assert.strictEqual(result.user.mustChangePassword, true);
  });
});
