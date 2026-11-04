import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { chartCodeRecordId } from '@/core/domain/entities/chart.types';
import type { UserRole } from '@/core/domain/entities/club.types';
import { resolveFieldVersions } from '@/core/application/sync/match-fields';
import { createSeedState } from '@/core/infrastructure/mocks/seed-data';
import type { DatabaseConnection } from '../db/client';
import { matchEvents, syncRecords } from '../db/schema';
import { openTestDatabase } from '../testing/test-database';
import type { PushBody, PushEventInput, PushRecordInput } from './api-schema';
import { createSyncChangeListener, SYNC_CHANNEL, type SyncChangeListener } from './listener';
import { pullChanges } from './pull';
import { applyPush } from './push';
import { readCurrentCursor } from './repository';

const ADMIN = { role: 'ADMIN' as UserRole };
const COACH = { role: 'HEAD_COACH' as UserRole };
const STATISTICIAN = { role: 'ASSISTANT_STATISTICIAN' as UserRole };

const seed = createSeedState(new Date('2026-10-30T12:00:00.000Z'));
const seedMatch = seed.matches.find((match) => match.events.length > 0);
if (!seedMatch) throw new Error('The seed must contain a match with events');
const { events: seedEvents, ...seedMatchRecord } = seedMatch;

const at = (minute: number) => new Date(Date.UTC(2026, 9, 30, 10, minute));
const uid = (prefix: string) => `t9-${prefix}-${randomUUID()}`;

function playerRecord(id: string, updatedAt: Date, overrides: Record<string, unknown> = {}, deleted = false): PushRecordInput {
  return { kind: 'player', id, data: { ...seed.players[0], id, ...overrides }, updatedAt, deleted };
}

function matchRecord(id: string, updatedAt: Date, overrides: Record<string, unknown> = {}, deleted = false): PushRecordInput {
  return { kind: 'match', id, data: { ...seedMatchRecord, id, ...overrides }, updatedAt, deleted };
}

function chartCodeRecord(code: string, updatedAt: Date, overrides: Record<string, unknown> = {}): PushRecordInput {
  const clubId = seed.divisions[0].clubId;
  const id = chartCodeRecordId(clubId, 'DEFENSE', code);
  const data = { id, clubId, category: 'DEFENSE', code, symbol: 'ZP', label: 'Zona press', tone: 'POSITIVE', archived: false, order: 14 };
  return { kind: 'chartCode', id, data: { ...data, ...overrides }, updatedAt, deleted: false };
}

function rivalTeamRecord(id: string, updatedAt: Date, overrides: Record<string, unknown> = {}, deleted = false): PushRecordInput {
  const data = {
    id,
    clubId: seed.divisions[0].clubId,
    divisionId: seed.divisions[0].id,
    name: 'Atenas de Córdoba',
    players: [
      { id: `${id}-p1`, dorsal: 4, firstName: 'Bruno', lastName: 'Lell' },
      { id: `${id}-p2`, dorsal: 15, firstName: 'Matías', lastName: 'Ruiz' },
    ],
  };
  return { kind: 'rivalTeam', id, data: { ...data, ...overrides }, updatedAt, deleted };
}

function coachRecord(id: string, updatedAt: Date, overrides: Record<string, unknown> = {}, deleted = false): PushRecordInput {
  const data = { id, clubId: seed.divisions[0].clubId, name: 'PEREZ, J.', license: '123', role: 'HEAD' };
  return { kind: 'coach', id, data: { ...data, ...overrides }, updatedAt, deleted };
}

function eventInput(id: string, matchId: string, deleted = false, overrides: Record<string, unknown> = {}): PushEventInput {
  return { id, matchId, data: { ...seedEvents[0], id, matchId, ...overrides }, deleted };
}

function body(records: PushRecordInput[] = [], events: PushEventInput[] = []): PushBody {
  return { records, events };
}

describe('sync push / pull (database)', () => {
  let connection: DatabaseConnection;
  const createdRecordIds: string[] = [];
  const createdEventIds: string[] = [];

  const push = async (user: { role: UserRole }, payload: PushBody) => {
    createdRecordIds.push(...payload.records.map((record) => record.id));
    createdEventIds.push(...payload.events.map((event) => event.id));
    return applyPush(connection.db, user, payload);
  };

  const storedRecord = async (kind: 'player' | 'match' | 'division' | 'chartCode' | 'rivalTeam' | 'coach', id: string) => {
    const [row] = await connection.db
      .select()
      .from(syncRecords)
      .where(and(eq(syncRecords.kind, kind), eq(syncRecords.id, id)));
    return row;
  };

  /** Event tests need their match stored first (S13.2). */
  const createMatch = async (id: string = uid('match')) => {
    const result = await push(ADMIN, body([matchRecord(id, at(0))]));
    assert.deepStrictEqual(result.accepted, [id]);
    return id;
  };

  const storedEvent = async (id: string) => {
    const [row] = await connection.db.select().from(matchEvents).where(eq(matchEvents.id, id));
    return row;
  };

  before(async () => {
    connection = await openTestDatabase();
  });

  after(async () => {
    if (createdRecordIds.length > 0) {
      await connection.db.delete(syncRecords).where(inArray(syncRecords.id, createdRecordIds));
    }
    if (createdEventIds.length > 0) {
      await connection.db.delete(matchEvents).where(inArray(matchEvents.id, createdEventIds));
    }
    await connection.pool.end();
  });

  it('accepts a new record and pulls it back once, advancing the cursor', async () => {
    const id = uid('player');
    const start = await readCurrentCursor(connection.db);

    const result = await push(ADMIN, body([playerRecord(id, at(1), { firstName: 'Lucia' })]));
    assert.deepStrictEqual(result.accepted, [id]);
    assert.deepStrictEqual(result.rejected, []);
    assert.match(result.cursor, /^\d+$/);
    assert.ok(Number(result.cursor) > Number(start));

    const pulled = await pullChanges(connection.db, Number(start));
    assert.deepStrictEqual(pulled.events, []);
    assert.strictEqual(pulled.records.length, 1);
    const [record] = pulled.records;
    assert.strictEqual(record.kind, 'player');
    assert.strictEqual(record.id, id);
    assert.strictEqual(record.updatedAt, at(1).toISOString());
    assert.strictEqual(record.deleted, false);
    assert.strictEqual(record.data.firstName, 'Lucia');
    assert.strictEqual(record.data.id, id);
    assert.strictEqual(pulled.cursor, result.cursor);
    assert.strictEqual(pulled.hasMore, false);

    assert.deepStrictEqual(await pullChanges(connection.db, Number(pulled.cursor)), {
      records: [],
      events: [],
      cursor: pulled.cursor,
      hasMore: false,
    });
  });

  it('returns everything (including seed data) on a full snapshot from 0', async () => {
    const pulled = await pullChanges(connection.db, 0, 5);
    assert.strictEqual(pulled.records.length + pulled.events.length, 5);
    assert.strictEqual(pulled.hasMore, true);
  });

  it('applies last-write-wins: newer replaces, equal or older is STALE and changes nothing', async () => {
    const id = uid('player');
    await push(ADMIN, body([playerRecord(id, at(5), { firstName: 'Original' })]));
    const afterFirst = await storedRecord('player', id);

    const newer = await push(COACH, body([playerRecord(id, at(6), { firstName: 'Newer' })]));
    assert.deepStrictEqual(newer.accepted, [id]);
    const afterNewer = await storedRecord('player', id);
    assert.strictEqual(afterNewer.data.firstName, 'Newer');
    assert.strictEqual(afterNewer.updatedAt.toISOString(), at(6).toISOString());
    assert.ok(afterNewer.seq > afterFirst.seq);

    const cursorBefore = await readCurrentCursor(connection.db);
    for (const updatedAt of [at(6), at(4)]) {
      const stale = await push(ADMIN, body([playerRecord(id, updatedAt, { firstName: 'Stale' })]));
      assert.deepStrictEqual(stale.accepted, []);
      assert.deepStrictEqual(stale.rejected, [{ id, reason: 'STALE' }]);
      assert.strictEqual(stale.cursor, cursorBefore);
    }
    assert.deepStrictEqual(await storedRecord('player', id), afterNewer);
  });

  it('stores deletions as tombstones that pull returns, and LWW still applies to them', async () => {
    const id = uid('player');
    await push(ADMIN, body([playerRecord(id, at(10))]));
    const cursor = await readCurrentCursor(connection.db);

    const deletion = await push(COACH, body([playerRecord(id, at(11), {}, true)]));
    assert.deepStrictEqual(deletion.accepted, [id]);

    const pulled = await pullChanges(connection.db, Number(cursor));
    assert.deepStrictEqual(
      pulled.records.map((record) => [record.id, record.deleted, record.updatedAt]),
      [[id, true, at(11).toISOString()]]
    );

    const olderEdit = await push(COACH, body([playerRecord(id, at(10), { firstName: 'Revived' })]));
    assert.deepStrictEqual(olderEdit.rejected, [{ id, reason: 'STALE' }]);
    assert.strictEqual((await storedRecord('player', id)).deleted, true);

    const newerEdit = await push(COACH, body([playerRecord(id, at(12), { firstName: 'Revived' })]));
    assert.deepStrictEqual(newerEdit.accepted, [id]);
    const revived = await storedRecord('player', id);
    assert.strictEqual(revived.deleted, false);
    assert.strictEqual(revived.data.firstName, 'Revived');
  });

  it('rejects writes the role may not make as FORBIDDEN, per item, without storing them', async () => {
    const playerId = uid('player');
    const matchId = uid('match');
    const newMatchId = uid('match');
    const divisionId = uid('division');
    await push(ADMIN, body([matchRecord(matchId, at(20))]));

    const statistician = await push(
      STATISTICIAN,
      body([
        playerRecord(playerId, at(21)),
        matchRecord(matchId, at(21), { homeScore: 12 }),
        matchRecord(newMatchId, at(21)),
      ])
    );
    assert.deepStrictEqual(statistician.accepted, [matchId]);
    assert.deepStrictEqual(statistician.rejected, [
      { id: playerId, reason: 'FORBIDDEN' },
      { id: newMatchId, reason: 'FORBIDDEN' },
    ]);
    assert.strictEqual(await storedRecord('player', playerId), undefined);
    assert.strictEqual(await storedRecord('match', newMatchId), undefined);
    assert.strictEqual((await storedRecord('match', matchId)).data.homeScore, 12);

    const statisticianDelete = await push(STATISTICIAN, body([matchRecord(matchId, at(22), {}, true)]));
    assert.deepStrictEqual(statisticianDelete.rejected, [{ id: matchId, reason: 'FORBIDDEN' }]);
    assert.strictEqual((await storedRecord('match', matchId)).deleted, false);

    const coachDivision = await push(COACH, body([{ ...playerRecord(divisionId, at(23)), kind: 'division', data: { ...seed.divisions[0], id: divisionId } }]));
    assert.deepStrictEqual(coachDivision.rejected, [{ id: divisionId, reason: 'FORBIDDEN' }]);
    assert.strictEqual(await storedRecord('division', divisionId), undefined);
  });

  it('stores chart codes only from roles that manage the catalog and pulls them back (S9)', async () => {
    const code = `CUSTOM_${randomUUID()}`;
    const record = chartCodeRecord(code, at(24));

    const statistician = await push(STATISTICIAN, body([record]));
    assert.deepStrictEqual(statistician.accepted, []);
    assert.deepStrictEqual(statistician.rejected, [{ id: record.id, reason: 'FORBIDDEN' }]);
    assert.strictEqual(await storedRecord('chartCode', record.id), undefined);

    const start = await readCurrentCursor(connection.db);
    const coach = await push(COACH, body([record]));
    assert.deepStrictEqual(coach.accepted, [record.id]);
    assert.deepStrictEqual(coach.rejected, []);

    const pulled = await pullChanges(connection.db, Number(start));
    assert.deepStrictEqual(
      pulled.records.map(({ kind, id, data, updatedAt, deleted }) => ({ kind, id, data, updatedAt, deleted })),
      [{ kind: 'chartCode', id: record.id, data: record.data, updatedAt: at(24).toISOString(), deleted: false }]
    );

    const archive = await push(STATISTICIAN, body([chartCodeRecord(code, at(25), { archived: true })]));
    assert.deepStrictEqual(archive.rejected, [{ id: record.id, reason: 'FORBIDDEN' }]);
    assert.strictEqual((await storedRecord('chartCode', record.id)).data.archived, false);

    const invalid = await push(ADMIN, body([chartCodeRecord(code, at(26), { symbol: 'ABCD' })]));
    assert.deepStrictEqual(invalid.rejected, [{ id: record.id, reason: 'INVALID' }]);
    assert.strictEqual((await storedRecord('chartCode', record.id)).data.symbol, 'ZP');
  });

  it('stores rival teams only from roles that manage matches and pulls them back (S14)', async () => {
    const id = uid('rival');
    const record = rivalTeamRecord(id, at(27));

    const statistician = await push(STATISTICIAN, body([record]));
    assert.deepStrictEqual(statistician.accepted, []);
    assert.deepStrictEqual(statistician.rejected, [{ id, reason: 'FORBIDDEN' }]);
    assert.strictEqual(await storedRecord('rivalTeam', id), undefined);

    const start = await readCurrentCursor(connection.db);
    const coach = await push(COACH, body([record]));
    assert.deepStrictEqual(coach.accepted, [id]);
    assert.deepStrictEqual(coach.rejected, []);

    const pulled = await pullChanges(connection.db, Number(start));
    assert.deepStrictEqual(
      pulled.records.map(({ kind, id, data, updatedAt, deleted }) => ({ kind, id, data, updatedAt, deleted })),
      [{ kind: 'rivalTeam', id, data: record.data, updatedAt: at(27).toISOString(), deleted: false }]
    );

    const rename = await push(STATISTICIAN, body([rivalTeamRecord(id, at(28), { name: 'Atenas' })]));
    assert.deepStrictEqual(rename.rejected, [{ id, reason: 'FORBIDDEN' }]);
    const removal = await push(STATISTICIAN, body([rivalTeamRecord(id, at(28), {}, true)]));
    assert.deepStrictEqual(removal.rejected, [{ id, reason: 'FORBIDDEN' }]);
    const kept = await storedRecord('rivalTeam', id);
    assert.strictEqual(kept.data.name, 'Atenas de Córdoba');
    assert.strictEqual(kept.deleted, false);

    const repeatedDorsal = rivalTeamRecord(id, at(29), {
      players: [
        { id: `${id}-p1`, dorsal: 4, firstName: 'Bruno', lastName: 'Lell' },
        { id: `${id}-p2`, dorsal: 4, firstName: 'Matías', lastName: 'Ruiz' },
      ],
    });
    const invalid = await push(ADMIN, body([repeatedDorsal]));
    assert.deepStrictEqual(invalid.rejected, [{ id, reason: 'INVALID' }]);
    assert.deepStrictEqual((await storedRecord('rivalTeam', id)).data, record.data);

    const deleted = await push(COACH, body([rivalTeamRecord(id, at(30), {}, true)]));
    assert.deepStrictEqual(deleted.accepted, [id]);
    assert.strictEqual((await storedRecord('rivalTeam', id)).deleted, true);
  });

  it('stores coaches only from roles that manage divisions and pulls them back (S5)', async () => {
    const id = uid('coach');
    const record = coachRecord(id, at(31));

    const statistician = await push(STATISTICIAN, body([record]));
    assert.deepStrictEqual(statistician.accepted, []);
    assert.deepStrictEqual(statistician.rejected, [{ id, reason: 'FORBIDDEN' }]);
    assert.strictEqual(await storedRecord('coach', id), undefined);

    const start = await readCurrentCursor(connection.db);
    const admin = await push(ADMIN, body([record]));
    assert.deepStrictEqual(admin.accepted, [id]);
    assert.deepStrictEqual(admin.rejected, []);

    const pulled = await pullChanges(connection.db, Number(start));
    assert.deepStrictEqual(
      pulled.records.map(({ kind, id, data, updatedAt, deleted }) => ({ kind, id, data, updatedAt, deleted })),
      [{ kind: 'coach', id, data: record.data, updatedAt: at(31).toISOString(), deleted: false }]
    );

    const removal = await push(STATISTICIAN, body([coachRecord(id, at(32), {}, true)]));
    assert.deepStrictEqual(removal.rejected, [{ id, reason: 'FORBIDDEN' }]);
    assert.strictEqual((await storedRecord('coach', id)).deleted, false);

    const malformed = await push(ADMIN, body([coachRecord(id, at(33), { name: 'A', role: 'COACH' })]));
    assert.deepStrictEqual(malformed.accepted, []);
    assert.deepStrictEqual(malformed.rejected, [{ id, reason: 'INVALID' }]);
    assert.deepStrictEqual((await storedRecord('coach', id)).data, record.data);
  });

  it('rejects data that fails the domain schema as INVALID and never stores match events in records', async () => {
    const badPlayer = uid('player');
    const mismatched = uid('player');
    const matchId = uid('match');
    const result = await push(
      ADMIN,
      body(
        [
          playerRecord(badPlayer, at(30), { dorsal: 120 }),
          { ...playerRecord(mismatched, at(30)), data: { ...seed.players[0], id: 'another-id' } },
          { ...matchRecord(matchId, at(30)), data: { ...seedMatchRecord, id: matchId, events: seedEvents } },
        ],
        [
          eventInput(uid('event'), matchId, false, { matchId: 'another-match' }),
          eventInput(uid('event'), matchId, false, { quarterTimeRemainingSeconds: -1 }),
        ]
      )
    );
    assert.deepStrictEqual(result.accepted, [matchId]);
    assert.deepStrictEqual(
      result.rejected.map((item) => item.reason),
      ['INVALID', 'INVALID', 'INVALID', 'INVALID']
    );
    assert.strictEqual(await storedRecord('player', badPlayer), undefined);
    const match = await storedRecord('match', matchId);
    assert.ok(!('events' in match.data));
  });

  it('dedupes a batch by (kind, id), keeping the newest updatedAt', async () => {
    const id = uid('player');
    const result = await push(
      ADMIN,
      body([
        playerRecord(id, at(41), { firstName: 'Newest' }),
        playerRecord(id, at(40), { firstName: 'Older' }),
      ])
    );
    assert.deepStrictEqual(result.accepted, [id]);
    assert.deepStrictEqual(result.rejected, []);
    const stored = await storedRecord('player', id);
    assert.strictEqual(stored.data.firstName, 'Newest');
    assert.strictEqual(stored.updatedAt.toISOString(), at(41).toISOString());
  });

  it('rejects records dated more than 5 minutes ahead of the server clock as INVALID', async () => {
    const now = new Date();
    const tooFar = uid('player');
    const withinSkew = uid('player');
    const cursorBefore = await readCurrentCursor(connection.db);

    const result = await push(
      ADMIN,
      body([
        playerRecord(tooFar, new Date(now.getTime() + 6 * 60 * 1000)),
        playerRecord(withinSkew, new Date(now.getTime() + 4 * 60 * 1000)),
      ])
    );
    assert.deepStrictEqual(result.accepted, [withinSkew]);
    assert.deepStrictEqual(result.rejected, [{ id: tooFar, reason: 'INVALID' }]);
    assert.strictEqual(await storedRecord('player', tooFar), undefined);
    assert.ok(Number(result.cursor) > Number(cursorBefore));

    // A far-future tombstone cannot pin a record forever either.
    const pinned = await push(ADMIN, body([playerRecord(withinSkew, new Date('2099-01-01T00:00:00.000Z'), {}, true)]));
    assert.deepStrictEqual(pinned.rejected, [{ id: withinSkew, reason: 'INVALID' }]);
    assert.strictEqual((await storedRecord('player', withinSkew)).deleted, false);
  });

  it('merges events append-only: insert once, immutable data, permanent tombstones', async () => {
    const matchId = await createMatch();
    const eventId = uid('event');
    const unknownTombstone = uid('event');

    const inserted = await push(STATISTICIAN, body([], [eventInput(eventId, matchId)]));
    assert.deepStrictEqual(inserted.accepted, [eventId]);
    const original = await storedEvent(eventId);
    assert.strictEqual(original.matchId, matchId);
    assert.strictEqual(original.deleted, false);

    const resent = await push(STATISTICIAN, body([], [eventInput(eventId, matchId)]));
    assert.deepStrictEqual(resent.accepted, [eventId]);
    assert.deepStrictEqual(await storedEvent(eventId), original);

    const rewritten = await push(STATISTICIAN, body([], [eventInput(eventId, matchId, false, { playerId: 'p-2' })]));
    assert.deepStrictEqual(rewritten.rejected, [{ id: eventId, reason: 'STALE' }]);
    assert.deepStrictEqual(await storedEvent(eventId), original);

    const cursor = await readCurrentCursor(connection.db);
    const tombstoned = await push(STATISTICIAN, body([], [eventInput(eventId, matchId, true)]));
    assert.deepStrictEqual(tombstoned.accepted, [eventId]);
    const deleted = await storedEvent(eventId);
    assert.strictEqual(deleted.deleted, true);
    assert.deepStrictEqual(deleted.data, original.data);
    assert.ok(deleted.seq > original.seq);
    const pulled = await pullChanges(connection.db, Number(cursor));
    assert.deepStrictEqual(pulled.events, [{ id: eventId, matchId, data: original.data, deleted: true }]);

    const revert = await push(STATISTICIAN, body([], [eventInput(eventId, matchId)]));
    assert.deepStrictEqual(revert.rejected, [{ id: eventId, reason: 'STALE' }]);
    const again = await push(STATISTICIAN, body([], [eventInput(eventId, matchId, true)]));
    assert.deepStrictEqual(again.accepted, [eventId]);
    assert.deepStrictEqual(await storedEvent(eventId), deleted);

    const fresh = await push(STATISTICIAN, body([], [eventInput(unknownTombstone, matchId, true)]));
    assert.deepStrictEqual(fresh.accepted, [unknownTombstone]);
    assert.strictEqual((await storedEvent(unknownTombstone)).deleted, true);
  });

  it('dedupes events in a batch so a tombstone wins over its live copy', async () => {
    const matchId = await createMatch();
    const eventId = uid('event');
    const result = await push(
      STATISTICIAN,
      body([], [eventInput(eventId, matchId, true), eventInput(eventId, matchId)])
    );
    assert.deepStrictEqual(result.accepted, [eventId]);
    assert.strictEqual((await storedEvent(eventId)).deleted, true);
  });

  it('paginates records and events together in seq order until hasMore is false', async () => {
    const matchId = await createMatch();
    const start = await readCurrentCursor(connection.db);
    const records = Array.from({ length: 6 }, (_, index) => playerRecord(uid(`page-${index}`), at(50)));
    const events = Array.from({ length: 17 }, (_, index) => eventInput(uid(`page-event-${index}`), matchId));
    const pushed = await push(ADMIN, body(records, events));
    assert.strictEqual(pushed.accepted.length, 23);
    await push(ADMIN, body([playerRecord(records[0].id, at(51), { firstName: 'Bumped' })]));

    const seen: string[] = [];
    let cursor = Number(start);
    let pages = 0;
    for (;;) {
      const page = await pullChanges(connection.db, cursor, 5);
      pages += 1;
      assert.ok(page.records.length + page.events.length <= 5);
      seen.push(...page.records.map((record) => record.id), ...page.events.map((event) => event.id));
      assert.ok(Number(page.cursor) > cursor || !page.hasMore);
      cursor = Number(page.cursor);
      if (!page.hasMore) break;
    }
    assert.strictEqual(pages, 5);
    assert.strictEqual(seen.length, 23);
    assert.deepStrictEqual(new Set(seen), new Set([...records, ...events].map((item) => item.id)));
    assert.strictEqual(String(cursor), await readCurrentCursor(connection.db));
  });

  it('rejects events of a match that is neither stored live nor accepted earlier in the batch as INVALID (S13.2)', async () => {
    const deletedMatch = await createMatch();
    await push(ADMIN, body([matchRecord(deletedMatch, at(1), {}, true)]));
    const unknownMatch = uid('match');
    const forbiddenMatch = uid('match');
    const sameBatchMatch = uid('match');
    const orphan = uid('event');
    const onDeleted = uid('event');
    const orphanTombstone = uid('event');
    const onForbidden = uid('event');
    const onNew = uid('event');
    const cursorBefore = await readCurrentCursor(connection.db);

    const result = await push(
      STATISTICIAN,
      body(
        [matchRecord(forbiddenMatch, at(2))],
        [
          eventInput(orphan, unknownMatch),
          eventInput(onDeleted, deletedMatch),
          eventInput(orphanTombstone, unknownMatch, true),
          eventInput(onForbidden, forbiddenMatch),
        ]
      )
    );
    assert.deepStrictEqual(result.accepted, []);
    assert.deepStrictEqual(result.rejected, [
      { id: forbiddenMatch, reason: 'FORBIDDEN' },
      { id: orphan, reason: 'INVALID' },
      { id: onDeleted, reason: 'INVALID' },
      { id: orphanTombstone, reason: 'INVALID' },
      { id: onForbidden, reason: 'INVALID' },
    ]);
    assert.strictEqual(result.cursor, cursorBefore);
    for (const id of [orphan, onDeleted, orphanTombstone, onForbidden]) assert.strictEqual(await storedEvent(id), undefined);

    const accepted = await push(ADMIN, body([matchRecord(sameBatchMatch, at(2))], [eventInput(onNew, sameBatchMatch)]));
    assert.deepStrictEqual(accepted.accepted, [sameBatchMatch, onNew]);
    assert.strictEqual((await storedEvent(onNew)).matchId, sameBatchMatch);
  });

  it('keeps the newest write when concurrent pushes race on the same record', async () => {
    const id = uid('player');
    const minutes = [3, 9, 1, 7, 5];
    await Promise.all(minutes.map((minute) => push(ADMIN, body([playerRecord(id, at(minute), { firstName: `m${minute}` })]))));
    const stored = await storedRecord('player', id);
    assert.strictEqual(stored.updatedAt.toISOString(), at(9).toISOString());
    assert.strictEqual(stored.data.firstName, 'm9');
  });
});

describe('field-level merge of match records (database, S13.1)', () => {
  let connection: DatabaseConnection;
  const createdRecordIds: string[] = [];
  const iso = (minute: number) => at(minute).toISOString();
  const allAt = (minute: number) => resolveFieldVersions(undefined, iso(minute));

  const push = async (payload: PushBody) => {
    createdRecordIds.push(...payload.records.map((record) => record.id));
    return applyPush(connection.db, ADMIN, payload);
  };

  /** A device push: the whole record, with only `fields` stamped at `minute`. */
  const devicePush = (id: string, minute: number, data: Record<string, unknown>, fields: Record<string, number>) =>
    push(
      body([
        {
          ...matchRecord(id, at(minute), data),
          fieldVersions: {
            ...allAt(0),
            ...Object.fromEntries(Object.entries(fields).map(([field, fieldMinute]) => [field, iso(fieldMinute)])),
          },
        },
      ])
    );

  const stored = async (id: string) => {
    const [row] = await connection.db
      .select()
      .from(syncRecords)
      .where(and(eq(syncRecords.kind, 'match'), eq(syncRecords.id, id)));
    return row;
  };

  before(async () => {
    connection = await openTestDatabase();
  });

  after(async () => {
    if (createdRecordIds.length > 0) {
      await connection.db.delete(syncRecords).where(inArray(syncRecords.id, createdRecordIds));
    }
    await connection.pool.end();
  });

  it('keeps both edits when two devices change different fields, and pull returns the field versions', async () => {
    const id = uid('match');
    await push(body([matchRecord(id, at(0), { venue: 'Club' })]));
    const cursor = await readCurrentCursor(connection.db);

    const venueEdit = await devicePush(id, 3, { venue: 'Device A venue' }, { venue: 3 });
    assert.deepStrictEqual(venueEdit.accepted, [id]);
    const statusEdit = await devicePush(id, 2, { venue: 'Club', status: 'HALFTIME' }, { 'game-state': 2 });
    assert.deepStrictEqual(statusEdit.accepted, [id]);

    const row = await stored(id);
    assert.strictEqual(row.data.venue, 'Device A venue');
    assert.strictEqual(row.data.status, 'HALFTIME');
    assert.strictEqual(row.fieldVersions?.venue, iso(3));
    assert.strictEqual(row.fieldVersions?.['game-state'], iso(2));
    assert.strictEqual(row.fieldVersions?.rivalTeamName, iso(0));
    assert.strictEqual(row.updatedAt.toISOString(), iso(3));

    const pulled = await pullChanges(connection.db, Number(cursor));
    const latest = pulled.records.filter((record) => record.id === id).at(-1);
    assert.ok(latest);
    assert.deepStrictEqual(latest.fieldVersions, row.fieldVersions);
    assert.strictEqual(latest.updatedAt, iso(3));
  });

  it('lets the newer version of the same field win; older and tied pushes are STALE and change nothing', async () => {
    const id = uid('match');
    await push(body([matchRecord(id, at(0), { venue: 'Club' })]));
    await devicePush(id, 5, { venue: 'Newer' }, { venue: 5 });
    const afterNewer = await stored(id);

    for (const minute of [4, 5]) {
      const result = await devicePush(id, minute, { venue: `Device ${minute}` }, { venue: minute });
      assert.deepStrictEqual(result.rejected, [{ id, reason: 'STALE' }]);
    }
    assert.deepStrictEqual(await stored(id), afterNewer);
    assert.strictEqual(afterNewer.data.venue, 'Newer');
  });

  it('applies a match tombstone as a whole only when it is newer than every field', async () => {
    const id = uid('match');
    await push(body([matchRecord(id, at(0))]));
    await devicePush(id, 6, { status: 'HALFTIME' }, { 'game-state': 6 });

    const older = await push(body([matchRecord(id, at(5), {}, true)]));
    assert.deepStrictEqual(older.rejected, [{ id, reason: 'STALE' }]);
    assert.strictEqual((await stored(id)).deleted, false);

    const newer = await push(body([matchRecord(id, at(7), {}, true)]));
    assert.deepStrictEqual(newer.accepted, [id]);
    const row = await stored(id);
    assert.strictEqual(row.deleted, true);
    assert.strictEqual(row.fieldVersions, null);

    const fieldEdit = await devicePush(id, 6, { venue: 'Late' }, { venue: 6 });
    assert.deepStrictEqual(fieldEdit.rejected, [{ id, reason: 'STALE' }], 'a field edit older than the tombstone cannot revive it');
  });

  it('merges over a row written before field versions existed (NULL field_versions)', async () => {
    const id = uid('match');
    createdRecordIds.push(id);
    await connection.db.insert(syncRecords).values({
      kind: 'match',
      id,
      data: { ...seedMatchRecord, id, venue: 'Legacy venue', status: 'LIVE' },
      updatedAt: at(4),
      deleted: false,
      fieldVersions: null,
    });

    const result = await devicePush(id, 6, { venue: 'Stale venue', status: 'HALFTIME' }, { 'game-state': 6, venue: 3 });
    assert.deepStrictEqual(result.accepted, [id]);
    const row = await stored(id);
    assert.strictEqual(row.data.status, 'HALFTIME');
    assert.strictEqual(row.data.venue, 'Legacy venue', 'an older field loses to the legacy updatedAt');
    assert.strictEqual(row.fieldVersions?.venue, iso(4));
    assert.strictEqual(row.fieldVersions?.['game-state'], iso(6));
  });

  it('rejects field versions newer than the record updatedAt as INVALID', async () => {
    const id = uid('match');
    const result = await devicePush(id, 2, {}, { status: 3 });
    assert.deepStrictEqual(result.rejected, [{ id, reason: 'INVALID' }]);
    assert.strictEqual(await stored(id), undefined);
  });
});

describe('sync change notifications (database)', () => {
  let connection: DatabaseConnection;
  let listener: SyncChangeListener;
  const createdRecordIds: string[] = [];

  before(async () => {
    connection = await openTestDatabase();
    const { connectionString } = connection.pool.options;
    assert.ok(connectionString);
    listener = createSyncChangeListener({ connectionString, retryMs: 50 });
  });

  after(async () => {
    await listener.close();
    if (createdRecordIds.length > 0) {
      await connection.db.delete(syncRecords).where(inArray(syncRecords.id, createdRecordIds));
    }
    await connection.pool.end();
  });

  function nextCursor(timeoutMs = 2000): { cursor: Promise<string | null>; stop: () => void } {
    let stop = () => {};
    const cursor = new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => {
        unsubscribe();
        resolve(null);
      }, timeoutMs);
      const unsubscribe = listener.subscribe((value) => {
        clearTimeout(timer);
        unsubscribe();
        resolve(value);
      });
      stop = () => {
        clearTimeout(timer);
        unsubscribe();
        resolve(null);
      };
    });
    return { cursor, stop };
  }

  it(`notifies ${SYNC_CHANNEL} with the cursor after a push with accepted writes`, async () => {
    const waiting = nextCursor();
    await listener.ready();
    const id = uid('notify');
    createdRecordIds.push(id);
    const result = await applyPush(connection.db, ADMIN, body([playerRecord(id, at(1))]));
    assert.strictEqual(await waiting.cursor, result.cursor);
  });

  it('does not notify when nothing was written', async () => {
    const id = uid('notify');
    createdRecordIds.push(id);
    const setup = nextCursor();
    await listener.ready();
    const created = await applyPush(connection.db, ADMIN, body([playerRecord(id, at(2))]));
    assert.strictEqual(await setup.cursor, created.cursor);

    const waiting = nextCursor(400);
    await listener.ready();
    const stale = await applyPush(connection.db, ADMIN, body([playerRecord(id, at(2))]));
    assert.deepStrictEqual(stale.rejected, [{ id, reason: 'STALE' }]);
    assert.strictEqual(await waiting.cursor, null);
  });

  it('reconnects after losing its connection and reports the current cursor', async () => {
    await listener.ready();
    const waiting = nextCursor(5000);
    await connection.db.execute(sql`
      SELECT pg_terminate_backend(pid) FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid() AND query = ${`LISTEN ${SYNC_CHANNEL}`}
    `);
    assert.strictEqual(await waiting.cursor, await readCurrentCursor(connection.db));

    const after = nextCursor();
    await listener.ready();
    const id = uid('notify');
    createdRecordIds.push(id);
    const result = await applyPush(connection.db, ADMIN, body([playerRecord(id, at(3))]));
    assert.strictEqual(await after.cursor, result.cursor);
  });
});
