import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import type { DatabaseConnection } from '../db/client';
import { authThrottles, sessions, users } from '../db/schema';
import { openTestDatabase } from '../testing/test-database';
import { authenticateUser } from './authenticate';
import { hashPassword } from './password';
import { changeOwnPassword } from './password-change';
import { createSession, hashSessionToken, validateSessionToken } from './session';
import { throttleKey } from './throttle';

const PASSWORD = 'secret-1922';
const NEW_PASSWORD = 'nueva-clave-2024';

describe('self-service password change (database)', () => {
  let connection: DatabaseConnection;
  const createdIds: string[] = [];

  async function insertUser(mustChangePassword: boolean) {
    const id = `test-user-${randomUUID()}`;
    const email = `${id}@test.camg.com.ar`;
    await connection.db.insert(users).values({
      id,
      email,
      name: 'Usuario de prueba',
      role: 'ASSISTANT_STATISTICIAN',
      passwordHash: await hashPassword(PASSWORD),
      mustChangePassword,
    });
    createdIds.push(id);
    return { id, email };
  }

  async function storedRow(id: string) {
    const [row] = await connection.db.select().from(users).where(eq(users.id, id));
    return row;
  }

  async function sessionIds(userId: string): Promise<string[]> {
    const rows = await connection.db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
    return rows.map((row) => row.id).sort();
  }

  before(async () => {
    connection = await openTestDatabase();
  });

  after(async () => {
    const keys = createdIds.map((id) => throttleKey.passwordChange(id));
    if (keys.length > 0) await connection.db.delete(authThrottles).where(inArray(authThrottles.key, keys));
    for (const id of createdIds) await connection.db.delete(users).where(eq(users.id, id));
    await connection.pool.end();
  });

  it('refuses a wrong current password and changes nothing (S5)', async () => {
    const user = await insertUser(true);
    const current = await createSession(connection.db, user.id);
    const other = await createSession(connection.db, user.id);
    const before = await storedRow(user.id);
    const sessionsBefore = await sessionIds(user.id);

    const result = await changeOwnPassword(connection.db, current.token, {
      currentPassword: 'wrong-password',
      newPassword: NEW_PASSWORD,
    });
    assert.deepStrictEqual(result, { ok: false, error: 'WRONG_CURRENT_PASSWORD' });

    const after = await storedRow(user.id);
    assert.strictEqual(after.passwordHash, before.passwordHash);
    assert.strictEqual(after.mustChangePassword, true);
    assert.deepStrictEqual(await sessionIds(user.id), sessionsBefore);
    assert.ok(await validateSessionToken(connection.db, other.token));
  });

  it('refuses keeping the current password and changes nothing (S3)', async () => {
    const user = await insertUser(true);
    const current = await createSession(connection.db, user.id);
    const other = await createSession(connection.db, user.id);
    const before = await storedRow(user.id);
    const sessionsBefore = await sessionIds(user.id);

    const result = await changeOwnPassword(connection.db, current.token, {
      currentPassword: PASSWORD,
      newPassword: PASSWORD,
    });
    assert.deepStrictEqual(result, { ok: false, error: 'SAME_PASSWORD' });

    const after = await storedRow(user.id);
    assert.strictEqual(after.passwordHash, before.passwordHash);
    assert.strictEqual(after.mustChangePassword, true);
    assert.deepStrictEqual(await sessionIds(user.id), sessionsBefore);
    assert.ok(await validateSessionToken(connection.db, other.token));
  });

  it('stores the new password, clears the flag and keeps only the current session (S3, S5)', async () => {
    const user = await insertUser(true);
    const current = await createSession(connection.db, user.id);
    await createSession(connection.db, user.id);
    await createSession(connection.db, user.id);

    const result = await changeOwnPassword(connection.db, current.token, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    assert.ok(result.ok);
    assert.deepStrictEqual(result.user, {
      id: user.id,
      email: user.email,
      name: 'Usuario de prueba',
      role: 'ASSISTANT_STATISTICIAN',
      mustChangePassword: false,
    });

    assert.deepStrictEqual(await sessionIds(user.id), [hashSessionToken(current.token)]);
    assert.strictEqual((await validateSessionToken(connection.db, current.token))?.mustChangePassword, false);
    assert.strictEqual(await authenticateUser(connection.db, user.email, PASSWORD), null);
    assert.strictEqual((await authenticateUser(connection.db, user.email, NEW_PASSWORD))?.mustChangePassword, false);
  });

  it('refuses further attempts for 15 minutes after 5 wrong current passwords (S2)', async () => {
    const user = await insertUser(false);
    const current = await createSession(connection.db, user.id);
    for (let failure = 0; failure < 5; failure++) {
      assert.deepStrictEqual(
        await changeOwnPassword(connection.db, current.token, { currentPassword: 'wrong-password', newPassword: NEW_PASSWORD }),
        { ok: false, error: 'WRONG_CURRENT_PASSWORD' }
      );
    }
    const before = await storedRow(user.id);

    const result = await changeOwnPassword(connection.db, current.token, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    assert.deepStrictEqual(result, { ok: false, error: 'TOO_MANY_ATTEMPTS' });
    assert.strictEqual((await storedRow(user.id)).passwordHash, before.passwordHash);
    assert.ok(await validateSessionToken(connection.db, current.token));
    // The login throttle is a different counter: the account still logs in.
    assert.ok(await authenticateUser(connection.db, user.email, PASSWORD));
  });

  it('clears the counter after a successful change (S2)', async () => {
    const user = await insertUser(false);
    const current = await createSession(connection.db, user.id);
    const wrong = { currentPassword: 'wrong-password', newPassword: 'otra-clave-2025' };
    for (let failure = 0; failure < 4; failure++) await changeOwnPassword(connection.db, current.token, wrong);
    assert.ok(
      (await changeOwnPassword(connection.db, current.token, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD })).ok
    );

    for (let failure = 0; failure < 4; failure++) {
      assert.deepStrictEqual(await changeOwnPassword(connection.db, current.token, wrong), {
        ok: false,
        error: 'WRONG_CURRENT_PASSWORD',
      });
    }
    assert.ok(
      (await changeOwnPassword(connection.db, current.token, { currentPassword: NEW_PASSWORD, newPassword: PASSWORD })).ok
    );
  });

  it('refuses an unknown or revoked session token', async () => {
    assert.deepStrictEqual(
      await changeOwnPassword(connection.db, 'not-a-real-token', { currentPassword: PASSWORD, newPassword: NEW_PASSWORD }),
      { ok: false, error: 'UNAUTHENTICATED' }
    );
  });
});
