import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { authenticateUser } from '../auth/authenticate';
import { verifyPassword } from '../auth/password';
import { createSession, validateSessionToken } from '../auth/session';
import type { DatabaseConnection } from '../db/client';
import { users } from '../db/schema';
import { openTestDatabase } from '../testing/test-database';
import { createUser, listUsers, resetUserPassword, updateUser, type UserAdminResult } from './service';
import { createUserFixtures, FIXTURE_PASSWORD as PASSWORD } from './user-fixtures';

const PREFIX = `test-admin-${randomUUID().slice(0, 8)}`;

describe('user administration (database)', () => {
  let connection: DatabaseConnection;

  const db = () => connection.db;
  const fixtures = createUserFixtures(db, PREFIX);
  const { insertUser, storedUser, sessionCount, withOnlyAdmins } = fixtures;

  before(async () => {
    connection = await openTestDatabase();
  });

  after(async () => {
    await fixtures.removeAll();
    await connection.pool.end();
  });

  describe('list (S1)', () => {
    it('returns every account sorted by name with its status and no password data', async () => {
      const zed = await insertUser('HEAD_COACH', { name: `${PREFIX} Zeta` });
      const abe = await insertUser('ASSISTANT_STATISTICIAN', { name: `${PREFIX} Abel`, active: false });

      const listed = (await listUsers(db())).filter((user) => user.id.startsWith(PREFIX));
      const ids = listed.map((user) => user.id);
      assert.ok(ids.indexOf(abe.id) < ids.indexOf(zed.id), 'sorted by name');

      const abel = listed.find((user) => user.id === abe.id);
      assert.ok(abel);
      assert.deepStrictEqual(Object.keys(abel).sort(), [
        'active',
        'createdAt',
        'email',
        'id',
        'mustChangePassword',
        'name',
        'role',
      ]);
      assert.deepStrictEqual(
        { ...abel, createdAt: undefined },
        {
          id: abe.id,
          email: abe.email,
          name: abe.name,
          role: 'ASSISTANT_STATISTICIAN',
          active: false,
          mustChangePassword: false,
          createdAt: undefined,
        }
      );
      assert.ok(!Number.isNaN(Date.parse(abel.createdAt)));
      assert.ok(!JSON.stringify(listed).includes('scrypt$'));
    });
  });

  describe('create (S2, S6)', () => {
    it('creates an active account that must change its temporary password and can log in', async () => {
      const admin = await insertUser('ADMIN');
      const email = `${PREFIX}-nuevo@test.camg.com.ar`;
      const result = await createUser(db(), admin, {
        name: 'Usuario Nuevo',
        email,
        role: 'HEAD_COACH',
        temporaryPassword: 'temporal-1',
      });
      assert.ok(result.ok);
      assert.strictEqual(result.user.email, email);
      assert.strictEqual(result.user.name, 'Usuario Nuevo');
      assert.strictEqual(result.user.role, 'HEAD_COACH');
      assert.strictEqual(result.user.active, true);
      assert.strictEqual(result.user.mustChangePassword, true);
      assert.ok(!('passwordHash' in result.user));

      const loggedIn = await authenticateUser(db(), email, 'temporal-1');
      assert.deepStrictEqual(loggedIn, {
        id: result.user.id,
        email,
        name: 'Usuario Nuevo',
        role: 'HEAD_COACH',
        mustChangePassword: true,
      });
    });

    it('refuses an email already in use, whatever its case, and writes nothing', async () => {
      const admin = await insertUser('ADMIN');
      const existing = await insertUser('HEAD_COACH');
      const before = (await listUsers(db())).length;

      const result = await createUser(db(), admin, {
        name: 'Duplicado',
        email: existing.email.toUpperCase(),
        role: 'ADMIN',
        temporaryPassword: 'temporal-1',
      });
      assert.deepStrictEqual(result, { ok: false, error: 'EMAIL_TAKEN' });
      assert.strictEqual((await listUsers(db())).length, before);
      assert.strictEqual((await storedUser(existing.id)).role, 'HEAD_COACH');
    });
  });

  describe('edit (S6)', () => {
    it('edits name, email and role of another account', async () => {
      const admin = await insertUser('ADMIN');
      const target = await insertUser('ASSISTANT_STATISTICIAN');
      const email = `${target.id}-editado@test.camg.com.ar`;

      const result = await updateUser(db(), admin, target.id, { name: 'Nombre Editado', email, role: 'HEAD_COACH' });
      assert.ok(result.ok);
      assert.strictEqual(result.user.name, 'Nombre Editado');
      assert.strictEqual(result.user.email, email);
      assert.strictEqual(result.user.role, 'HEAD_COACH');

      const row = await storedUser(target.id);
      assert.deepStrictEqual([row.name, row.email, row.role], ['Nombre Editado', email, 'HEAD_COACH']);
    });

    it('refuses an email used by another account and changes nothing', async () => {
      const admin = await insertUser('ADMIN');
      const target = await insertUser('HEAD_COACH');
      const other = await insertUser('HEAD_COACH');

      const result = await updateUser(db(), admin, target.id, { name: 'No Cambia', email: other.email });
      assert.deepStrictEqual(result, { ok: false, error: 'EMAIL_TAKEN' });
      const row = await storedUser(target.id);
      assert.deepStrictEqual([row.name, row.email], [target.name, target.email]);
    });

    it('accepts the account keeping its own email', async () => {
      const admin = await insertUser('ADMIN');
      const target = await insertUser('HEAD_COACH');
      const result = await updateUser(db(), admin, target.id, { email: target.email, name: 'Mismo Email' });
      assert.ok(result.ok);
      assert.strictEqual(result.user.email, target.email);
    });

    it('answers USER_NOT_FOUND for an unknown id', async () => {
      const admin = await insertUser('ADMIN');
      assert.deepStrictEqual(await updateUser(db(), admin, `${PREFIX}-missing`, { name: 'Nadie' }), {
        ok: false,
        error: 'USER_NOT_FOUND',
      });
      assert.deepStrictEqual(await resetUserPassword(db(), admin, `${PREFIX}-missing`, 'temporal-1'), {
        ok: false,
        error: 'USER_NOT_FOUND',
      });
    });
  });

  describe('deactivate and reactivate (S4)', () => {
    it('keeps the account listed as inactive, closes its sessions and blocks login and session validation', async () => {
      const admin = await insertUser('ADMIN');
      const target = await insertUser('HEAD_COACH');
      const { token } = await createSession(db(), target.id);
      await createSession(db(), target.id);

      const result = await updateUser(db(), admin, target.id, { active: false });
      assert.ok(result.ok);
      assert.strictEqual(result.user.active, false);
      assert.strictEqual(await sessionCount(target.id), 0);
      assert.strictEqual(await validateSessionToken(db(), token), null);
      assert.strictEqual(await authenticateUser(db(), target.email, PASSWORD), null);
      const listed = (await listUsers(db())).find((user) => user.id === target.id);
      assert.strictEqual(listed?.active, false);
    });

    it('refuses a session of an account deactivated without closing it', async () => {
      const target = await insertUser('HEAD_COACH');
      const { token } = await createSession(db(), target.id);
      await db().update(users).set({ active: false }).where(eq(users.id, target.id));
      assert.strictEqual(await validateSessionToken(db(), token), null);
    });

    it('reactivates an account so it can log in again', async () => {
      const admin = await insertUser('ADMIN');
      const target = await insertUser('HEAD_COACH', { active: false });

      const result = await updateUser(db(), admin, target.id, { active: true });
      assert.ok(result.ok);
      assert.strictEqual(result.user.active, true);
      assert.ok(await authenticateUser(db(), target.email, PASSWORD));
    });
  });

  describe('reset password (S2)', () => {
    it('sets a new temporary password, flags the account and closes every session', async () => {
      const admin = await insertUser('ADMIN');
      const target = await insertUser('HEAD_COACH');
      const { token } = await createSession(db(), target.id);

      const result = await resetUserPassword(db(), admin, target.id, 'nueva-temporal');
      assert.ok(result.ok);
      assert.strictEqual(result.user.mustChangePassword, true);
      assert.strictEqual(await sessionCount(target.id), 0);
      assert.strictEqual(await validateSessionToken(db(), token), null);
      assert.strictEqual(await authenticateUser(db(), target.email, PASSWORD), null);
      const loggedIn = await authenticateUser(db(), target.email, 'nueva-temporal');
      assert.strictEqual(loggedIn?.mustChangePassword, true);
      assert.ok(await verifyPassword('nueva-temporal', (await storedUser(target.id)).passwordHash));
    });
  });

  describe('safety guards (S6)', () => {
    it('refuses an admin deactivating or demoting their own account and changes nothing', async () => {
      const admin = await insertUser('ADMIN');
      const { token } = await createSession(db(), admin.id);

      assert.deepStrictEqual(await updateUser(db(), admin, admin.id, { active: false }), {
        ok: false,
        error: 'SELF_DEACTIVATION',
      });
      assert.deepStrictEqual(await updateUser(db(), admin, admin.id, { role: 'HEAD_COACH', name: 'Otro' }), {
        ok: false,
        error: 'SELF_ROLE_CHANGE',
      });
      const row = await storedUser(admin.id);
      assert.deepStrictEqual([row.active, row.role, row.name], [true, 'ADMIN', admin.name]);
      assert.ok(await validateSessionToken(db(), token), 'the session stays open');
    });

    it('lets an admin edit their own name and email', async () => {
      const admin = await insertUser('ADMIN');
      const result = await updateUser(db(), admin, admin.id, { name: 'Admin Renombrado', role: 'ADMIN', active: true });
      assert.ok(result.ok);
      assert.strictEqual(result.user.name, 'Admin Renombrado');
    });

    it('never deactivates or demotes the last active admin', async () => {
      const last = await insertUser('ADMIN');
      // An admin whose account was deactivated after its session was validated.
      const stale = await insertUser('ADMIN', { active: false });

      await withOnlyAdmins([last.id], async () => {
        assert.deepStrictEqual(await updateUser(db(), stale, last.id, { active: false }), {
          ok: false,
          error: 'LAST_ADMIN',
        });
        assert.deepStrictEqual(await updateUser(db(), stale, last.id, { role: 'HEAD_COACH' }), {
          ok: false,
          error: 'LAST_ADMIN',
        });
        const row = await storedUser(last.id);
        assert.deepStrictEqual([row.active, row.role], [true, 'ADMIN']);
      });
    });

    it('keeps one admin when two admins demote each other at the same time', async () => {
      const first = await insertUser('ADMIN');
      const second = await insertUser('ADMIN');

      await withOnlyAdmins([first.id, second.id], async () => {
        // The first change stays uncommitted while the second one runs, so both
        // overlap for certain: the second must wait for it and then refuse.
        let commitFirst = () => {};
        const firstMayCommit = new Promise<void>((resolve) => (commitFirst = resolve));
        let firstApplied: (result: UserAdminResult) => void = () => {};
        const firstResult = new Promise<UserAdminResult>((resolve) => (firstApplied = resolve));
        const firstTransaction = db().transaction(async (tx) => {
          firstApplied(await updateUser(tx, first, second.id, { role: 'HEAD_COACH' }));
          await firstMayCommit;
        });

        assert.ok((await firstResult).ok);
        const secondResult = updateUser(db(), second, first.id, { active: false });
        await new Promise((resolve) => setTimeout(resolve, 300));
        commitFirst();
        await firstTransaction;

        assert.deepStrictEqual(await secondResult, { ok: false, error: 'LAST_ADMIN' });
        const admins = await db()
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.role, 'ADMIN'), eq(users.active, true), inArray(users.id, [first.id, second.id])));
        assert.strictEqual(admins.length, 1);
      });
    });
  });
});
