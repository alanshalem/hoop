import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createSeedState } from '@/core/infrastructure/mocks/seed-data';
import { authenticateUser } from '../auth/authenticate';
import { openTestDatabase } from '../testing/test-database';
import type { DatabaseConnection } from './client';
import { matchEvents, syncRecords, users } from './schema';
import { seedDatabase } from './seed';

const DEMO_PASSWORD = 'demo-password-for-tests';

describe('database seed', () => {
  let connection: DatabaseConnection;
  const seed = createSeedState(new Date());
  const userIds = seed.users.map((user) => user.id);
  const recordIds = [...seed.divisions, ...seed.teams, ...seed.players, ...seed.matches].map((entity) => entity.id);
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
    assert.strictEqual(again.recordsWritten, 0, 'same updatedAt: last-write-wins keeps the stored rows');
    assert.strictEqual(again.eventsInserted, 0, 'events are append-only');
    assert.deepStrictEqual(await passwordHashes(), hashesAfterFirstRun, 'matching hashes are kept');

    const later = await seedDatabase(connection.db, { now: new Date(now.getTime() + 1000), demoPassword: DEMO_PASSWORD });
    assert.deepStrictEqual(await counts(), expected);
    assert.strictEqual(later.recordsWritten, recordIds.length, 'a newer seed restores the demo records');
    assert.strictEqual(later.eventsInserted, 0);
  });

  it('creates users that can log in with the demo password', async () => {
    for (const user of seed.users) {
      const authenticated = await authenticateUser(connection.db, user.email, DEMO_PASSWORD);
      assert.deepStrictEqual(authenticated, {
        id: user.id,
        email: user.email.toLowerCase(),
        name: user.name,
        role: user.role,
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
