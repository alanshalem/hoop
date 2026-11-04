import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { asc, eq, sql } from 'drizzle-orm';
import { hashPassword } from '../auth/password';
import type { DatabaseConnection } from '../db/client';
import { matchEvents, sessions, syncRecords, users } from '../db/schema';
import { seedDatabase } from '../db/seed';
import { readDataEpoch } from '../sync/epoch';
import { createSyncChangeListener, type SyncChangeListener } from '../sync/listener';
import { pullChanges } from '../sync/pull';
import { readCurrentCursor } from '../sync/repository';
import { buildFixture } from '../testing/acta-fixtures';
import { openTestDatabase } from '../testing/test-database';
import { KEPT_ACCOUNT_EMAIL, wipeAndImportActas } from './acta-wipe-import';

/**
 * Runs on the test database only (`npm run test:db`): the wipe deletes every
 * record, event, session and account except the kept administrator there.
 * The demo seed provides that administrator and is loaded again afterwards,
 * so later test files find the database as the seed leaves it.
 */
describe('acta wipe + import (database, S1, S2)', () => {
  let connection: DatabaseConnection;
  let listener: SyncChangeListener;
  const data = buildFixture();
  const NOW = new Date('2030-04-01T12:00:00.000Z');

  const count = async (table: typeof users | typeof sessions | typeof syncRecords | typeof matchEvents) => {
    const [row] = await connection.db.select({ n: sql<number>`count(*)::int` }).from(table);
    return row.n;
  };

  const restoreDemoSeed = () =>
    seedDatabase(connection.db, { now: new Date(), demoPassword: 'demo-password-for-tests' });

  async function seedOldData() {
    const { db } = connection;
    const passwordHash = await hashPassword('old-password-for-tests');
    await db
      .insert(users)
      .values({ id: 'acta-test-other', email: 'other-account@test.invalid', name: 'Other', role: 'HEAD_COACH', passwordHash })
      .onConflictDoNothing();
    const [admin] = await db.select().from(users).where(eq(users.email, KEPT_ACCOUNT_EMAIL));
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await db
      .insert(sessions)
      .values([
        { id: `acta-test-session-admin-${Date.now()}`, userId: admin.id, expiresAt },
        { id: `acta-test-session-other-${Date.now()}`, userId: 'acta-test-other', expiresAt },
      ]);
    await db
      .insert(syncRecords)
      .values({ kind: 'player', id: 'acta-test-old-player', data: { id: 'acta-test-old-player' }, updatedAt: NOW, deleted: false })
      .onConflictDoNothing();
    await db
      .insert(matchEvents)
      .values({ id: 'acta-test-old-event', matchId: 'acta-test-old-match', data: { id: 'acta-test-old-event' }, deleted: false })
      .onConflictDoNothing();
    return admin;
  }

  before(async () => {
    connection = await openTestDatabase();
    const { connectionString } = connection.pool.options;
    assert.ok(connectionString);
    listener = createSyncChangeListener({ connectionString, retryMs: 50 });
    await restoreDemoSeed();
  });

  after(async () => {
    await listener.close();
    await connection.db.delete(syncRecords).where(sql`${syncRecords.id} LIKE 'acta-%'`);
    await restoreDemoSeed();
    await connection.pool.end();
  });

  it('aborts without changing anything when the kept account is missing', async () => {
    await seedOldData();
    const before = { users: await count(users), records: await count(syncRecords), events: await count(matchEvents) };
    const epoch = await readDataEpoch(connection.db);

    await assert.rejects(
      wipeAndImportActas(connection.db, data, { now: NOW, keepEmail: 'missing-admin@test.invalid' }),
      /missing-admin@test\.invalid does not exist/
    );
    assert.deepStrictEqual(
      { users: await count(users), records: await count(syncRecords), events: await count(matchEvents) },
      before
    );
    assert.strictEqual(await readDataEpoch(connection.db), epoch);
  });

  it('keeps only the admin, wipes records, events and sessions, rotates the epoch and inserts the reports', async () => {
    const admin = await seedOldData();
    const epochBefore = await readDataEpoch(connection.db);
    const cursorBefore = Number(await readCurrentCursor(connection.db));
    const usersBefore = await count(users);
    const sessionsBefore = await count(sessions);
    let notified: string | null = null;
    await listener.ready();
    const unsubscribe = listener.subscribe((cursor) => {
      notified = cursor;
    });

    const summary = await wipeAndImportActas(connection.db, data, { now: NOW });

    const remaining = await connection.db.select().from(users);
    assert.deepStrictEqual(remaining.map((user) => user.email), [KEPT_ACCOUNT_EMAIL]);
    assert.strictEqual(remaining[0].passwordHash, admin.passwordHash, 'the admin password is never changed');
    assert.deepStrictEqual(remaining[0].updatedAt, admin.updatedAt);
    assert.strictEqual(await count(sessions), 0, 'every session is removed, the admin logs in again');
    assert.strictEqual(await count(matchEvents), 0);

    const rows = await connection.db.select().from(syncRecords).orderBy(asc(syncRecords.seq));
    const expectedIds = [
      data.division.id,
      data.team.id,
      ...data.coaches.map((c) => c.id),
      ...data.players.map((p) => p.id),
      ...data.rivalTeams.map((t) => t.id),
      ...data.matches.map((m) => m.id),
    ];
    assert.deepStrictEqual(rows.map((row) => row.id).sort(), [...expectedIds].sort());
    assert.ok(rows.every((row) => !row.deleted && row.updatedAt.getTime() === NOW.getTime()));
    assert.ok(rows.every((row) => row.seq > cursorBefore), 'the sequence continues, it never restarts');
    const match = rows.find((row) => row.id === data.matches[0].id);
    assert.deepStrictEqual(match?.data.officialResult, data.matches[0].officialResult);
    assert.ok(!('events' in (match?.data ?? {})), 'match records never embed events');

    const epoch = await readDataEpoch(connection.db);
    assert.notStrictEqual(epoch, epochBefore);
    const pulled = await pullChanges(connection.db, 0);
    assert.strictEqual(pulled.epoch, epoch);
    assert.strictEqual(pulled.records.length, expectedIds.length);

    assert.deepStrictEqual(summary, {
      keptAccount: KEPT_ACCOUNT_EMAIL,
      deleted: { users: usersBefore - 1, sessions: sessionsBefore, records: summary.deleted.records, events: summary.deleted.events },
      inserted: { division: 1, team: 1, coach: 2, player: 4, rivalTeam: 2, match: 3 },
      epoch,
      cursor: await readCurrentCursor(connection.db),
    });
    assert.ok(summary.deleted.records >= 1 && summary.deleted.events >= 1);

    // The notification is delivered after the commit, asynchronously.
    for (let i = 0; i < 50 && notified === null; i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    unsubscribe();
    assert.strictEqual(notified, summary.cursor);
  });
});
