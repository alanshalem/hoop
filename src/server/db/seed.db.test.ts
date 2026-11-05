import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createSeedState } from '@/core/infrastructure/mocks/seed-data';
import { authenticateUser } from '../auth/authenticate';
import { hashPassword, verifyPassword } from '../auth/password';
import { readDataEpoch } from '../sync/epoch';
import { applyPush } from '../sync/push';
import { openTestDatabase } from '../testing/test-database';
import type { DatabaseConnection } from './client';
import { matchEvents, syncRecords, users } from './schema';
import { seedDatabase } from './seed';

const DEMO_PASSWORD = 'demo-password-for-tests';

describe('database seed', () => {
  let connection: DatabaseConnection;
  const seed = createSeedState(new Date());
  const userIds = seed.users.map((user) => user.id);
  const recordIds = [...seed.divisions, ...seed.teams, ...seed.players, ...seed.matches, ...seed.rivalTeams].map(
    (entity) => entity.id
  );
  const eventIds = seed.matches.flatMap((match) => match.events.map((event) => event.id));

  async function counts() {
    const { db } = connection;
    const [userCount] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(inArray(users.id, userIds));
    const [recordCount] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(syncRecords)
      .where(inArray(syncRecords.id, recordIds));
    const [eventCount] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(matchEvents)
      .where(inArray(matchEvents.id, eventIds));
    return { users: userCount.n, records: recordCount.n, events: eventCount.n };
  }

  async function passwordHashes() {
    const rows = await connection.db
      .select({ id: users.id, hash: users.passwordHash })
      .from(users)
      .where(inArray(users.id, userIds));
    return new Map(rows.map((row) => [row.id, row.hash]));
  }

  before(async () => {
    connection = await openTestDatabase();
  });

  after(async () => {
    await connection.pool.end();
  });

  it('loads every seed entity, event and user, and is idempotent', async () => {
    const now = new Date();
    const expected = { users: userIds.length, records: recordIds.length, events: eventIds.length };

    await seedDatabase(connection.db, { now, demoPassword: DEMO_PASSWORD });
    assert.deepStrictEqual(await counts(), expected);
    const hashesAfterFirstRun = await passwordHashes();

    const again = await seedDatabase(connection.db, { now, demoPassword: DEMO_PASSWORD });
    assert.deepStrictEqual(await counts(), expected);
    assert.strictEqual(again.recordsInserted, 0, 'records are insert-only');
    assert.strictEqual(again.eventsInserted, 0, 'events are append-only');
    assert.deepStrictEqual(await passwordHashes(), hashesAfterFirstRun, 'matching hashes are kept');

    const later = await seedDatabase(connection.db, { now: new Date(now.getTime() + 1000), demoPassword: DEMO_PASSWORD });
    assert.deepStrictEqual(await counts(), expected);
    assert.strictEqual(later.recordsInserted, 0, 'a later seed never rewrites existing records');
    assert.strictEqual(later.eventsInserted, 0);
  });

  it('never resurrects a tombstone or overwrites user edits on a later re-seed', async () => {
    const division = seed.divisions[0];
    const storedDivision = async () => {
      const [row] = await connection.db
        .select()
        .from(syncRecords)
        .where(and(eq(syncRecords.kind, 'division'), eq(syncRecords.id, division.id)));
      return row;
    };

    await seedDatabase(connection.db, { now: new Date(), demoPassword: DEMO_PASSWORD });
    const deletedAt = new Date(Date.now() + 1000);
    const renamed = 'Division renombrada por el usuario';
    try {
      const result = await applyPush(
        connection.db,
        { role: 'ADMIN' },
        {
          records: [{ kind: 'division', id: division.id, data: { ...division, name: renamed }, updatedAt: deletedAt, deleted: true }],
          events: [],
          epoch: await readDataEpoch(connection.db),
        }
      );
      assert.ok(result.ok);
      assert.deepStrictEqual(result.value.accepted, [division.id]);
      const tombstone = await storedDivision();

      const later = await seedDatabase(connection.db, {
        now: new Date(deletedAt.getTime() + 60 * 60 * 1000),
        demoPassword: DEMO_PASSWORD,
      });
      const after = await storedDivision();
      assert.strictEqual(after.deleted, true);
      assert.strictEqual(after.data.name, renamed);
      assert.strictEqual(after.updatedAt.toISOString(), deletedAt.toISOString());
      assert.strictEqual(after.seq, tombstone.seq, 'the re-seed did not write the row');
      assert.strictEqual(later.recordsInserted, 0);
    } finally {
      // Restore the demo division so later runs start from the seed again.
      await connection.db
        .delete(syncRecords)
        .where(and(eq(syncRecords.kind, 'division'), eq(syncRecords.id, division.id)));
      await seedDatabase(connection.db, { now: new Date(), demoPassword: DEMO_PASSWORD });
    }
    assert.strictEqual((await storedDivision()).deleted, false);
  });

  it('creates users that can log in with the demo password', async () => {
    for (const user of seed.users) {
      const authenticated = await authenticateUser(connection.db, user.email, DEMO_PASSWORD);
      assert.deepStrictEqual(authenticated, {
        id: user.id,
        email: user.email.toLowerCase(),
        name: user.name,
        role: user.role,
        mustChangePassword: false,
      });
    }
  });

  it('re-hashes when the demo password changes', async () => {
    const summary = await seedDatabase(connection.db, { now: new Date(), demoPassword: `${DEMO_PASSWORD}-2` });
    assert.strictEqual(await authenticateUser(connection.db, seed.users[0].email, DEMO_PASSWORD), null);
    assert.ok(await authenticateUser(connection.db, seed.users[0].email, `${DEMO_PASSWORD}-2`));
    await seedDatabase(connection.db, { now: new Date(), demoPassword: DEMO_PASSWORD });

    assert.ok(!JSON.stringify(summary).includes('scrypt$'), 'summary never exposes hashes');
    assert.deepStrictEqual(Object.keys(summary.accounts[0]).sort(), ['email', 'name', 'role']);
  });

  it('keeps the profile of an existing demo account and only resets its password (S4)', async () => {
    await seedDatabase(connection.db, { now: new Date(), demoPassword: DEMO_PASSWORD });
    const account = seed.users.find((user) => user.role === 'HEAD_COACH');
    assert.ok(account);
    const edited = {
      email: `editado-${randomUUID()}@test.camg.com.ar`,
      name: 'Nombre editado desde Usuarios',
      role: 'ASSISTANT_STATISTICIAN' as const,
      active: false,
      mustChangePassword: true,
    };
    await connection.db
      .update(users)
      .set({ ...edited, passwordHash: await hashPassword('otra-clave-2024') })
      .where(eq(users.id, account.id));

    try {
      const summary = await seedDatabase(connection.db, { now: new Date(), demoPassword: DEMO_PASSWORD });
      const [row] = await connection.db.select().from(users).where(eq(users.id, account.id));
      assert.deepStrictEqual(
        { email: row.email, name: row.name, role: row.role, active: row.active, mustChangePassword: row.mustChangePassword },
        edited
      );
      assert.ok(await verifyPassword(DEMO_PASSWORD, row.passwordHash), 'the password is reset to the demo one');
      // The summary shows the stored account, not the seed template.
      assert.deepStrictEqual(
        summary.accounts.find((entry) => entry.email === edited.email),
        { email: edited.email, name: edited.name, role: edited.role }
      );
      assert.ok(!summary.accounts.some((entry) => entry.email === account.email.toLowerCase()));
      assert.deepStrictEqual(summary.skippedAccounts, []);
    } finally {
      await connection.db
        .update(users)
        .set({ email: account.email.toLowerCase(), name: account.name, role: account.role, active: true, mustChangePassword: false })
        .where(eq(users.id, account.id));
    }
  });

  it('skips a missing demo account whose email belongs to another account (S4)', async () => {
    await seedDatabase(connection.db, { now: new Date(), demoPassword: DEMO_PASSWORD });
    const account = seed.users.find((user) => user.role === 'ASSISTANT_STATISTICIAN');
    assert.ok(account);
    const email = account.email.toLowerCase();
    const otherId = `test-seed-${randomUUID()}`;
    const otherHash = await hashPassword('clave-de-otra-cuenta');
    await connection.db.delete(users).where(eq(users.id, account.id));
    await connection.db
      .insert(users)
      .values({ id: otherId, email, name: 'Cuenta creada desde Usuarios', role: 'HEAD_COACH', passwordHash: otherHash });

    try {
      const summary = await seedDatabase(connection.db, { now: new Date(), demoPassword: DEMO_PASSWORD });
      assert.deepStrictEqual(summary.skippedAccounts, [email]);
      assert.strictEqual(summary.accounts.length, seed.users.length - 1);
      assert.ok(!summary.accounts.some((entry) => entry.email === email));
      assert.deepStrictEqual(await connection.db.select().from(users).where(eq(users.id, account.id)), []);
      const [other] = await connection.db.select().from(users).where(eq(users.id, otherId));
      assert.deepStrictEqual(
        [other.email, other.name, other.role, other.passwordHash],
        [email, 'Cuenta creada desde Usuarios', 'HEAD_COACH', otherHash]
      );
      assert.strictEqual(summary.recordsInserted, 0, 'the rest of the seed still runs');
    } finally {
      await connection.db.delete(users).where(eq(users.id, otherId));
      await seedDatabase(connection.db, { now: new Date(), demoPassword: DEMO_PASSWORD });
    }
    assert.ok(await authenticateUser(connection.db, email, DEMO_PASSWORD), 'the demo account is back');
  });

  it('stores the seed rival teams as rivalTeam records (S14)', async () => {
    await seedDatabase(connection.db, { now: new Date(), demoPassword: DEMO_PASSWORD });
    const rows = await connection.db
      .select({ id: syncRecords.id, data: syncRecords.data })
      .from(syncRecords)
      .where(eq(syncRecords.kind, 'rivalTeam'));
    for (const team of seed.rivalTeams) {
      assert.deepStrictEqual(rows.find((row) => row.id === team.id)?.data, team, team.id);
    }
  });

  it('stores matches without embedded events', async () => {
    const [match] = await connection.db
      .select({ data: syncRecords.data })
      .from(syncRecords)
      .where(and(eq(syncRecords.kind, 'match'), eq(syncRecords.id, seed.matches[0].id)));
    assert.ok(match);
    assert.ok(!('events' in match.data));
  });

  it('draws seq for both tables from the one global sync_seq', async () => {
    const result = await connection.db.execute<{ table_name: string; column_default: string }>(sql`
      SELECT table_name, column_default FROM information_schema.columns
      WHERE column_name = 'seq' AND table_name IN ('sync_records', 'match_events')
      ORDER BY table_name`);
    assert.deepStrictEqual(
      result.rows.map((row) => [row.table_name, row.column_default]),
      [
        ['match_events', "nextval('sync_seq'::regclass)"],
        ['sync_records', "nextval('sync_seq'::regclass)"],
      ]
    );
  });
});
