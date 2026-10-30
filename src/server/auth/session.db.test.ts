import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { DatabaseConnection } from '../db/client';
import { sessions, users } from '../db/schema';
import { openTestDatabase } from '../testing/test-database';
import { authenticateUser } from './authenticate';
import { hashPassword, needsRehash } from './password';
import { createSession, hashSessionToken, revokeSession, SESSION_TTL_MS, validateSessionToken } from './session';

const PASSWORD = 'secret-1922';

describe('sessions and credentials (database)', () => {
  let connection: DatabaseConnection;
  const userId = `test-user-${randomUUID()}`;
  const email = `${userId}@test.camg.com.ar`;
  const expectedUser = { id: userId, email, name: 'Usuario de prueba', role: 'HEAD_COACH' as const };

  before(async () => {
    connection = await openTestDatabase();
    await connection.db.insert(users).values({ ...expectedUser, passwordHash: await hashPassword(PASSWORD) });
  });

  after(async () => {
    await connection.db.delete(users).where(eq(users.id, userId));
    await connection.pool.end();
  });

  it('stores only the SHA-256 of the token and validates it to the public user', async () => {
    const now = new Date();
    const { token, expiresAt } = await createSession(connection.db, userId, now);

    const rows = await connection.db.select().from(sessions).where(eq(sessions.userId, userId));
    const row = rows.find((candidate) => candidate.id === hashSessionToken(token));
    assert.ok(row, 'session row keyed by the token hash');
    assert.ok(rows.every((candidate) => candidate.id !== token), 'raw token never stored');
    assert.strictEqual(row.expiresAt.getTime(), now.getTime() + SESSION_TTL_MS);
    assert.strictEqual(expiresAt.getTime(), now.getTime() + SESSION_TTL_MS);

    const user = await validateSessionToken(connection.db, token, now);
    assert.deepStrictEqual(user, expectedUser);
  });

  it('rejects an expired session and deletes its row', async () => {
    const created = new Date(Date.now() - SESSION_TTL_MS - 1000);
    const { token } = await createSession(connection.db, userId, created);

    assert.strictEqual(await validateSessionToken(connection.db, token), null);
    const rows = await connection.db.select().from(sessions).where(eq(sessions.id, hashSessionToken(token)));
    assert.strictEqual(rows.length, 0);
  });

  it('treats the exact expiry instant as expired', async () => {
    const now = new Date();
    const { token, expiresAt } = await createSession(connection.db, userId, now);
    assert.strictEqual(await validateSessionToken(connection.db, token, expiresAt), null);
  });

  it('revokes a session', async () => {
    const { token } = await createSession(connection.db, userId);
    assert.ok(await validateSessionToken(connection.db, token));

    await revokeSession(connection.db, token);
    assert.strictEqual(await validateSessionToken(connection.db, token), null);
    await revokeSession(connection.db, token);
  });

  it('rejects unknown tokens', async () => {
    assert.strictEqual(await validateSessionToken(connection.db, 'not-a-real-token'), null);
  });

  it('deletes sessions when their user is deleted', async () => {
    const otherId = `test-user-${randomUUID()}`;
    await connection.db.insert(users).values({
      id: otherId,
      email: `${otherId}@test.camg.com.ar`,
      name: 'Usuario temporal',
      role: 'ADMIN',
      passwordHash: await hashPassword(PASSWORD),
    });
    const { token } = await createSession(connection.db, otherId);

    await connection.db.delete(users).where(eq(users.id, otherId));
    const rows = await connection.db.select().from(sessions).where(eq(sessions.id, hashSessionToken(token)));
    assert.strictEqual(rows.length, 0);
  });

  it('rejects non-lowercase emails at the database level', async () => {
    await assert.rejects(
      connection.db.insert(users).values({
        id: `test-user-${randomUUID()}`,
        email: 'Mixed.Case@test.camg.com.ar',
        name: 'Mayusculas',
        role: 'ADMIN',
        passwordHash: 'x',
      })
    );
  });

  it('upgrades a hash with older cost parameters on the next successful login only', async () => {
    const legacyId = `test-user-${randomUUID()}`;
    const salt = randomBytes(16);
    const key = scryptSync(PASSWORD, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 2 * 128 * 16384 * 8 });
    const legacyHash = ['scrypt', 16384, 8, 1, salt.toString('base64url'), key.toString('base64url')].join('$');
    const legacyEmail = `${legacyId}@test.camg.com.ar`;
    await connection.db
      .insert(users)
      .values({ id: legacyId, email: legacyEmail, name: 'Hash antiguo', role: 'ADMIN', passwordHash: legacyHash });
    const storedHash = async () =>
      (await connection.db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, legacyId)))[0].hash;

    try {
      assert.strictEqual(await authenticateUser(connection.db, legacyEmail, 'wrong-password'), null);
      assert.strictEqual(await storedHash(), legacyHash, 'a failed login never rewrites the hash');

      assert.ok(await authenticateUser(connection.db, legacyEmail, PASSWORD));
      const upgraded = await storedHash();
      assert.notStrictEqual(upgraded, legacyHash);
      assert.deepStrictEqual(upgraded.split('$').slice(0, 4), ['scrypt', '131072', '8', '1']);
      assert.strictEqual(needsRehash(upgraded), false);

      assert.ok(await authenticateUser(connection.db, legacyEmail, PASSWORD), 'the new hash still verifies');
      assert.strictEqual(await storedHash(), upgraded, 'a current hash is not rewritten');
    } finally {
      await connection.db.delete(users).where(eq(users.id, legacyId));
    }
  });

  it('authenticates with the right password only, matching the email case-insensitively', async () => {
    assert.deepStrictEqual(await authenticateUser(connection.db, email.toUpperCase(), PASSWORD), expectedUser);
    assert.strictEqual(await authenticateUser(connection.db, email, 'wrong-password'), null);
    assert.strictEqual(await authenticateUser(connection.db, `missing-${email}`, PASSWORD), null);
  });
});
