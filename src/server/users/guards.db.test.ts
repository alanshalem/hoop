import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { authenticateUser } from '../auth/authenticate';
import { changeOwnPassword, type PasswordChangeResult } from '../auth/password-change';
import { createSession, hashSessionToken, validateSessionToken } from '../auth/session';
import type { DatabaseConnection, DbExecutor } from '../db/client';
import { sessions, users } from '../db/schema';
import { openTestDatabase } from '../testing/test-database';
import { createUser, resetUserPassword, updateUser, type UserAdminResult } from './service';
import { createUserFixtures, FIXTURE_PASSWORD } from './user-fixtures';

/**
 * Durable probes of the safety guards (S3, S5, S6) found by the T4 verification.
 * Cases already covered one-to-one elsewhere are not repeated: create with an
 * email in another case (service.db.test.ts) and the own role kept with the same
 * state (service.db.test.ts, "lets an admin edit their own name and email").
 */

const PREFIX = `guard-probe-${randomUUID().slice(0, 8)}`;
const TEMPORARY_PASSWORD = 'temporal-2024';
const NEW_PASSWORD = 'nueva-clave-2024';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits (up to ~10 s) until a connection of the test database waits on a lock, or `settled()`. */
async function waitForLockWait(connection: DatabaseConnection, settled: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200 && !settled(); attempt++) {
    const { rows } = await connection.pool.query<{ waiting: number }>(
      "SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'"
    );
    if (rows[0].waiting > 0) return;
    await sleep(50);
  }
}

/**
 * Runs `change` inside a transaction that stays open until `overlap` blocks on
 * the rows it locked, so both changes overlap for certain whatever the timing.
 */
async function overlapping<T, U>(
  connection: DatabaseConnection,
  change: (tx: DbExecutor) => Promise<T>,
  overlap: () => Promise<U>
): Promise<[T, U]> {
  let commitFirst = () => {};
  const firstMayCommit = new Promise<void>((resolve) => (commitFirst = resolve));
  let firstApplied: (result: T) => void = () => {};
  const firstResult = new Promise<T>((resolve) => (firstApplied = resolve));
  const firstTransaction = connection.db.transaction(async (tx) => {
    firstApplied(await change(tx));
    await firstMayCommit;
  });

  const first = await firstResult;
  let secondSettled = false;
  const second = overlap().finally(() => (secondSettled = true));
  await waitForLockWait(connection, () => secondSettled);
  commitFirst();
  await firstTransaction;
  return [first, await second];
}

describe('user administration guards (database probes)', () => {
  let connection: DatabaseConnection;
  const fixtures = createUserFixtures(() => connection.db, PREFIX);
  const { insertUser, storedUser, sessionCount, withOnlyAdmins } = fixtures;

  before(async () => {
    connection = await openTestDatabase();
  });

  after(async () => {
    await fixtures.removeAll();
    await connection.pool.end();
  });

  describe('acting admin re-checked inside the transaction (S6)', () => {
    it('refuses an edit by an admin deactivated after the session check and changes nothing', async () => {
      const actor = await insertUser('ADMIN');
      const target = await insertUser('HEAD_COACH');
      await connection.db.update(users).set({ active: false }).where(eq(users.id, actor.id));

      const result = await updateUser(connection.db, actor, target.id, { name: 'No Cambia', role: 'ADMIN' });
      assert.deepStrictEqual(result, { ok: false, error: 'ACTOR_NOT_ALLOWED' });
      const row = await storedUser(target.id);
      assert.deepStrictEqual([row.name, row.role, row.active], [target.name, 'HEAD_COACH', true]);
    });

    it('refuses an edit by an admin demoted after the session check', async () => {
      const actor = await insertUser('ADMIN');
      const target = await insertUser('HEAD_COACH');
      await connection.db.update(users).set({ role: 'HEAD_COACH' }).where(eq(users.id, actor.id));

      assert.deepStrictEqual(await updateUser(connection.db, actor, target.id, { active: false }), {
        ok: false,
        error: 'ACTOR_NOT_ALLOWED',
      });
      assert.strictEqual((await storedUser(target.id)).active, true);
    });

    it('refuses a create and a reset by a deactivated admin and writes nothing', async () => {
      const actor = await insertUser('ADMIN');
      const target = await insertUser('HEAD_COACH');
      const { token } = await createSession(connection.db, target.id);
      const before = await storedUser(target.id);
      await connection.db.update(users).set({ active: false }).where(eq(users.id, actor.id));

      const email = `${PREFIX}-rechazado@test.camg.com.ar`;
      assert.deepStrictEqual(
        await createUser(connection.db, actor, {
          name: 'Rechazado',
          email,
          role: 'ADMIN',
          temporaryPassword: TEMPORARY_PASSWORD,
        }),
        { ok: false, error: 'ACTOR_NOT_ALLOWED' }
      );
      assert.strictEqual((await connection.db.select().from(users).where(eq(users.email, email))).length, 0);

      assert.deepStrictEqual(await resetUserPassword(connection.db, actor, target.id, TEMPORARY_PASSWORD), {
        ok: false,
        error: 'ACTOR_NOT_ALLOWED',
      });
      const row = await storedUser(target.id);
      assert.deepStrictEqual([row.passwordHash, row.mustChangePassword], [before.passwordHash, false]);
      assert.ok(await validateSessionToken(connection.db, token), 'the session stays open');
    });
  });

  describe('P1: own account with several fields in one change (S6)', () => {
    it('refuses deactivation or a role change of the own account even with other fields', async () => {
      const admin = await insertUser('ADMIN');

      assert.deepStrictEqual(await updateUser(connection.db, admin, admin.id, { active: false, role: 'HEAD_COACH' }), {
        ok: false,
        error: 'SELF_DEACTIVATION',
      });
      assert.deepStrictEqual(await updateUser(connection.db, admin, admin.id, { active: true, role: 'HEAD_COACH' }), {
        ok: false,
        error: 'SELF_ROLE_CHANGE',
      });
      const row = await storedUser(admin.id);
      assert.deepStrictEqual([row.active, row.role, row.name], [true, 'ADMIN', admin.name]);
    });
  });

  describe('P2: two admins deactivating each other at the same time (S6)', () => {
    it('keeps exactly one active admin and refuses the second change with LAST_ADMIN', async () => {
      const first = await insertUser('ADMIN');
      const second = await insertUser('ADMIN');

      await withOnlyAdmins([first.id, second.id], async () => {
        const [firstResult, secondResult] = await overlapping<UserAdminResult, UserAdminResult>(
          connection,
          (tx) => updateUser(tx, first, second.id, { active: false }),
          () => updateUser(connection.db, second, first.id, { active: false })
        );

        assert.ok(firstResult.ok);
        assert.deepStrictEqual(secondResult, { ok: false, error: 'LAST_ADMIN' });
        const admins = await connection.db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.role, 'ADMIN'), eq(users.active, true), inArray(users.id, [first.id, second.id])));
        assert.deepStrictEqual(admins, [{ id: first.id }]);
      });
    });
  });

  describe('P4: the last admin with role and state in one change (S6)', () => {
    it('refuses with LAST_ADMIN and changes nothing', async () => {
      const last = await insertUser('ADMIN');
      // An admin whose account was deactivated after its session was validated.
      const stale = await insertUser('ADMIN', { active: false });

      await withOnlyAdmins([last.id], async () => {
        assert.deepStrictEqual(
          await updateUser(connection.db, stale, last.id, { active: false, role: 'HEAD_COACH', name: 'Otro' }),
          { ok: false, error: 'LAST_ADMIN' }
        );
        const row = await storedUser(last.id);
        assert.deepStrictEqual([row.active, row.role, row.name], [true, 'ADMIN', last.name]);
      });
    });
  });

  describe('P5: deactivation ends the access (S4)', () => {
    it('blocks the session, login and password change, and reactivating does not revive the session', async () => {
      const admin = await insertUser('ADMIN');
      const target = await insertUser('HEAD_COACH');
      const { token } = await createSession(connection.db, target.id);

      assert.ok((await updateUser(connection.db, admin, target.id, { active: false })).ok);
      assert.strictEqual(await validateSessionToken(connection.db, token), null);
      assert.strictEqual(await authenticateUser(connection.db, target.email, FIXTURE_PASSWORD), null);
      assert.deepStrictEqual(
        await changeOwnPassword(connection.db, token, { currentPassword: FIXTURE_PASSWORD, newPassword: NEW_PASSWORD }),
        { ok: false, error: 'UNAUTHENTICATED' }
      );

      assert.ok((await updateUser(connection.db, admin, target.id, { active: true })).ok);
      assert.strictEqual(await validateSessionToken(connection.db, token), null);
      assert.strictEqual(await sessionCount(target.id), 0);
      assert.ok(await authenticateUser(connection.db, target.email, FIXTURE_PASSWORD), 'a new login works');
    });
  });

  describe('P6: reset, then the forced change (S2, S3)', () => {
    it('closes every session, refuses keeping the temporary password and retires it after the change', async () => {
      const admin = await insertUser('ADMIN');
      const target = await insertUser('HEAD_COACH');
      await createSession(connection.db, target.id);
      await createSession(connection.db, target.id);

      assert.ok((await resetUserPassword(connection.db, admin, target.id, TEMPORARY_PASSWORD)).ok);
      assert.strictEqual(await sessionCount(target.id), 0);

      const loggedIn = await authenticateUser(connection.db, target.email, TEMPORARY_PASSWORD);
      assert.strictEqual(loggedIn?.mustChangePassword, true);
      const current = await createSession(connection.db, target.id);
      const other = await createSession(connection.db, target.id);
      const flagged = await storedUser(target.id);

      assert.deepStrictEqual(
        await changeOwnPassword(connection.db, current.token, {
          currentPassword: TEMPORARY_PASSWORD,
          newPassword: TEMPORARY_PASSWORD,
        }),
        { ok: false, error: 'SAME_PASSWORD' }
      );
      const refused = await storedUser(target.id);
      assert.deepStrictEqual([refused.passwordHash, refused.mustChangePassword], [flagged.passwordHash, true]);
      assert.strictEqual(await sessionCount(target.id), 2);

      const changed = await changeOwnPassword(connection.db, current.token, {
        currentPassword: TEMPORARY_PASSWORD,
        newPassword: NEW_PASSWORD,
      });
      assert.ok(changed.ok);
      assert.strictEqual(changed.user.mustChangePassword, false);
      assert.strictEqual(await validateSessionToken(connection.db, other.token), null);
      assert.strictEqual((await validateSessionToken(connection.db, current.token))?.mustChangePassword, false);
      assert.strictEqual(await sessionCount(target.id), 1);
      assert.strictEqual(await authenticateUser(connection.db, target.email, TEMPORARY_PASSWORD), null);
      assert.ok(await authenticateUser(connection.db, target.email, NEW_PASSWORD));
    });
  });

  describe('P7: emails are unique whatever their case (S6)', () => {
    it('refuses editing an email into another account email in another case and changes nothing', async () => {
      const admin = await insertUser('ADMIN');
      const target = await insertUser('HEAD_COACH');
      const other = await insertUser('HEAD_COACH');

      assert.deepStrictEqual(
        await updateUser(connection.db, admin, target.id, { email: other.email.toUpperCase(), name: 'No Cambia' }),
        { ok: false, error: 'EMAIL_TAKEN' }
      );
      const row = await storedUser(target.id);
      assert.deepStrictEqual([row.email, row.name], [target.email, target.name]);
    });
  });

  describe('P8: two own-password changes at the same time (S5)', () => {
    it('accepts exactly one and leaves only its session open', async () => {
      const user = await insertUser('ASSISTANT_STATISTICIAN', { mustChangePassword: true });
      const first = await createSession(connection.db, user.id);
      const second = await createSession(connection.db, user.id);

      const [firstResult, secondResult] = await overlapping<PasswordChangeResult, PasswordChangeResult>(
        connection,
        (tx) => changeOwnPassword(tx, first.token, { currentPassword: FIXTURE_PASSWORD, newPassword: NEW_PASSWORD }),
        () =>
          changeOwnPassword(connection.db, second.token, {
            currentPassword: FIXTURE_PASSWORD,
            newPassword: 'otra-clave-2024',
          })
      );

      assert.ok(firstResult.ok);
      assert.deepStrictEqual(secondResult, { ok: false, error: 'WRONG_CURRENT_PASSWORD' });
      const remaining = await connection.db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, user.id));
      assert.deepStrictEqual(remaining, [{ id: hashSessionToken(first.token) }]);
      assert.ok(await authenticateUser(connection.db, user.email, NEW_PASSWORD));
      assert.strictEqual(await authenticateUser(connection.db, user.email, 'otra-clave-2024'), null);
    });
  });
});
