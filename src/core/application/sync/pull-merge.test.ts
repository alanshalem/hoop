import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  applyServerSnapshot,
  isServerCursorBehind,
  mergePulledChanges,
  reconcileSelection,
} from './pull-merge';
import { toMatchRecord } from './sync-records';
import { readFieldVersions, resolveFieldVersions, writeFieldVersions, type CompleteFieldVersions } from './match-fields';
import { createEmptyOutbox, enqueueChanges } from './outbox';
import type { PulledChanges, SyncableClubData, SyncEvent, SyncRecord } from './sync-types';
import { makeDivision, makeEvent, makeMatch, makePlayer, makeTeam } from '@/core/testing/fixtures';

const T0 = '2026-10-30T18:00:00.000Z';
const T1 = '2026-10-30T18:00:01.000Z';
const T2 = '2026-10-30T18:00:02.000Z';

function club(overrides: Partial<SyncableClubData> = {}): SyncableClubData {
  return {
    divisions: [makeDivision()],
    teams: [makeTeam()],
    players: [makePlayer({ id: 'p1' })],
    matches: [makeMatch({ events: [] })],
    ...overrides,
  };
}

const pulled = (changes: Partial<PulledChanges>): PulledChanges => ({ records: [], events: [], ...changes });

const playerRecord = (id: string, updatedAt: string, overrides: Partial<SyncRecord> = {}): SyncRecord =>
  ({ kind: 'player', id, data: makePlayer({ id, lastName: `Remote ${updatedAt}` }), updatedAt, deleted: false, ...overrides }) as SyncRecord;

const remoteEvent = (id: string, timestamp: string, overrides: Partial<SyncEvent> = {}): SyncEvent => ({
  id,
  matchId: 'm-test',
  data: makeEvent({ id, timestamp, type: 'FG2_MADE', isOwnTeam: true }),
  deleted: false,
  ...overrides,
});

describe('mergePulledChanges: records by last-write-wins (S10.7)', () => {
  it('applies a remote record without local version and stores its version', () => {
    const result = mergePulledChanges({ data: club(), versions: {}, outbox: createEmptyOutbox() }, pulled({
      records: [playerRecord('p1', T1)],
    }));
    assert.strictEqual(result.changed, true);
    assert.strictEqual(result.data.players[0].lastName, `Remote ${T1}`);
    assert.strictEqual(result.versions['player:p1'], T1);
  });

  it('applies equal or newer versions and ignores older ones', () => {
    const base = { data: club(), versions: { 'player:p1': T1 }, outbox: createEmptyOutbox() };
    const older = mergePulledChanges(base, pulled({ records: [playerRecord('p1', T0)] }));
    assert.strictEqual(older.changed, false);
    assert.strictEqual(older.data, base.data);
    assert.strictEqual(older.versions['player:p1'], T1);

    const equal = mergePulledChanges(base, pulled({ records: [playerRecord('p1', T1)] }));
    assert.strictEqual(equal.data.players[0].lastName, `Remote ${T1}`);

    const newer = mergePulledChanges(base, pulled({ records: [playerRecord('p1', T2)] }));
    assert.strictEqual(newer.data.players[0].lastName, `Remote ${T2}`);
    assert.strictEqual(newer.versions['player:p1'], T2);
  });

  it('drops a pending outbox entry superseded by a remote version and keeps newer local ones', () => {
    const base = club();
    const local = enqueueChanges(
      { outbox: createEmptyOutbox(), versions: {} },
      {
        records: [
          { kind: 'player', id: 'p1', data: base.players[0], deleted: false },
          { kind: 'division', id: 'div-test', data: base.divisions[0], deleted: false },
        ],
        events: [],
      },
      Date.parse(T1)
    );
    const result = mergePulledChanges({ data: base, ...local }, pulled({
      records: [
        playerRecord('p1', T2),
        { kind: 'division', id: 'div-test', data: makeDivision({ name: 'Old' }), updatedAt: T0, deleted: false },
      ],
    }));
    assert.deepStrictEqual(Object.keys(result.outbox.records), ['division:div-test']);
    assert.strictEqual(result.data.divisions[0].name, 'Primera Test');
  });

  it('removes entities on tombstones and appends unknown ids', () => {
    const result = mergePulledChanges({ data: club(), versions: {}, outbox: createEmptyOutbox() }, pulled({
      records: [
        playerRecord('p1', T1, { deleted: true }),
        playerRecord('p9', T1),
        { kind: 'team', id: 'team-2', data: makeTeam({ id: 'team-2' }), updatedAt: T1, deleted: false },
      ],
    }));
    assert.deepStrictEqual(result.data.players.map((p) => p.id), ['p9']);
    assert.deepStrictEqual(result.data.teams.map((t) => t.id), ['team-own', 'team-2']);
    assert.strictEqual(result.versions['player:p1'], T1);
  });

  it('updates match metadata, keeps local events and re-derives the scoreboard', () => {
    const own = makeEvent({ id: 'ev-1', type: 'FG3_MADE', isOwnTeam: true });
    const base = club({ matches: [makeMatch({ events: [own], homeScore: 3 })] });
    const remote = toMatchRecord(makeMatch({ rivalTeamName: 'Remote Rival', homeScore: 99 }));
    const result = mergePulledChanges({ data: base, versions: {}, outbox: createEmptyOutbox() }, pulled({
      records: [{ kind: 'match', id: 'm-test', data: remote, updatedAt: T1, deleted: false }],
    }));
    const [match] = result.data.matches;
    assert.strictEqual(match.rivalTeamName, 'Remote Rival');
    assert.deepStrictEqual(match.events, [own]);
    assert.strictEqual(match.homeScore, 3, 'score comes from events, never from the record');
  });

  it('keeps the original collection references when nothing changes', () => {
    const data = club();
    const result = mergePulledChanges({ data, versions: {}, outbox: createEmptyOutbox() }, pulled({}));
    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.data.players, data.players);
    assert.strictEqual(result.data.matches, data.matches);
  });
});

describe('mergePulledChanges: events append-only (S10.7)', () => {
  it('appends new events by id, sorted by timestamp then id, and re-derives', () => {
    const local = makeEvent({ id: 'ev-b', timestamp: '2026-10-30T20:00:05.000Z', type: 'FG2_MADE', isOwnTeam: true });
    const base = club({ matches: [makeMatch({ events: [local], homeScore: 2 })] });
    const result = mergePulledChanges({ data: base, versions: {}, outbox: createEmptyOutbox() }, pulled({
      events: [
        remoteEvent('ev-c', '2026-10-30T20:00:05.000Z'),
        remoteEvent('ev-a', '2026-10-30T20:00:01.000Z'),
        remoteEvent('ev-b', '2026-10-30T20:00:05.000Z'),
      ],
    }));
    const [match] = result.data.matches;
    assert.deepStrictEqual(match.events.map((e) => e.id), ['ev-a', 'ev-b', 'ev-c']);
    assert.strictEqual(match.events[1], local, 'an existing id is never overwritten');
    assert.strictEqual(match.homeScore, 6);
  });

  it('removes events on tombstones and clears their pending outbox entry', () => {
    const doomed = makeEvent({ id: 'ev-1', type: 'FG3_MADE', isOwnTeam: true });
    const base = club({ matches: [makeMatch({ events: [doomed], homeScore: 3 })] });
    const local = enqueueChanges(
      { outbox: createEmptyOutbox(), versions: {} },
      { records: [], events: [{ id: 'ev-1', matchId: 'm-test', data: doomed, deleted: false }] },
      Date.parse(T0)
    );
    const result = mergePulledChanges({ data: base, ...local }, pulled({
      events: [remoteEvent('ev-1', T0, { deleted: true })],
    }));
    assert.deepStrictEqual(result.data.matches[0].events, []);
    assert.strictEqual(result.data.matches[0].homeScore, 0);
    assert.deepStrictEqual(result.outbox.events, {});
  });

  it('does not resurrect an event with a pending local tombstone', () => {
    const local = enqueueChanges(
      { outbox: createEmptyOutbox(), versions: {} },
      { records: [], events: [{ id: 'ev-1', matchId: 'm-test', data: makeEvent({ id: 'ev-1' }), deleted: true }] },
      Date.parse(T0)
    );
    const result = mergePulledChanges({ data: club(), ...local }, pulled({ events: [remoteEvent('ev-1', T0)] }));
    assert.deepStrictEqual(result.data.matches[0].events, []);
  });

  it('ignores events of unknown matches', () => {
    const result = mergePulledChanges({ data: club(), versions: {}, outbox: createEmptyOutbox() }, pulled({
      events: [remoteEvent('ev-1', T0, { matchId: 'm-gone' })],
    }));
    assert.strictEqual(result.changed, false);
  });

  it('applies records before events, so a match and its events can arrive in one pull', () => {
    const remote = toMatchRecord(makeMatch({ id: 'm-new' }));
    const result = mergePulledChanges({ data: club(), versions: {}, outbox: createEmptyOutbox() }, pulled({
      events: [remoteEvent('ev-1', T0, { matchId: 'm-new', data: makeEvent({ id: 'ev-1', matchId: 'm-new' }) })],
      records: [{ kind: 'match', id: 'm-new', data: remote, updatedAt: T0, deleted: false }],
    }));
    const created = result.data.matches.find((m) => m.id === 'm-new');
    assert.deepStrictEqual(created?.events.map((e) => e.id), ['ev-1']);
  });
});

describe('mergePulledChanges: match records merge per field (S13.1)', () => {
  const T3 = '2026-10-30T18:00:03.000Z';
  const allAt = (iso: string): CompleteFieldVersions => resolveFieldVersions(undefined, iso);
  const remoteMatch = (
    overrides: Partial<ReturnType<typeof makeMatch>>,
    updatedAt: string,
    fieldVersions?: Partial<CompleteFieldVersions>
  ): SyncRecord => ({
    kind: 'match',
    id: 'm-test',
    data: toMatchRecord(makeMatch(overrides)),
    updatedAt,
    deleted: false,
    ...(fieldVersions ? { fieldVersions: { ...allAt(T0), ...fieldVersions } } : {}),
  });

  /** A device whose match changed `status` locally at T3 (pending push). */
  function deviceWithLocalStatusEdit() {
    const base = club({ matches: [makeMatch({ status: 'HALFTIME', venue: 'Club' })] });
    const known = writeFieldVersions({ 'match:m-test': T0 }, 'm-test', allAt(T0));
    const local = enqueueChanges(
      { outbox: createEmptyOutbox(), versions: known },
      { records: [{ kind: 'match', id: 'm-test', data: toMatchRecord(base.matches[0]), deleted: false, changedFields: ['status'] }], events: [] },
      Date.parse(T3)
    );
    return { data: base, ...local };
  }

  it('keeps the local edit and applies the remote edit of another field', () => {
    const state = deviceWithLocalStatusEdit();
    const result = mergePulledChanges(state, pulled({
      records: [remoteMatch({ status: 'LIVE', venue: 'Remote venue' }, T2, { venue: T2 })],
    }));
    const [match] = result.data.matches;
    assert.strictEqual(match.status, 'HALFTIME', 'the newer local field wins');
    assert.strictEqual(match.venue, 'Remote venue', 'the newer remote field wins');
    const versions = readFieldVersions(result.versions, 'm-test');
    assert.strictEqual(versions['game-state'], T3);
    assert.strictEqual(versions.venue, T2);
    assert.strictEqual(result.versions['match:m-test'], T3);
    assert.ok(result.outbox.records['match:m-test'], 'the local edit is still pending');
  });

  it('applies a newer remote value of the same field and drops the pending entry it covers', () => {
    const state = deviceWithLocalStatusEdit();
    const T4 = '2026-10-30T18:00:04.000Z';
    const result = mergePulledChanges(state, pulled({
      records: [remoteMatch({ status: 'FINISHED', venue: 'Club' }, T4, { 'game-state': T4 })],
    }));
    assert.strictEqual(result.data.matches[0].status, 'FINISHED');
    assert.strictEqual(result.outbox.records['match:m-test'], undefined);
  });

  it('keeps the remote value on a tie (the server already decided)', () => {
    const state = deviceWithLocalStatusEdit();
    const result = mergePulledChanges(state, pulled({
      records: [remoteMatch({ status: 'LIVE', venue: 'Club' }, T3, { 'game-state': T3 })],
    }));
    assert.strictEqual(result.data.matches[0].status, 'LIVE');
    assert.strictEqual(result.outbox.records['match:m-test'], undefined);
  });

  it('treats a record without field versions as written at updatedAt on every field', () => {
    const state = deviceWithLocalStatusEdit();
    const result = mergePulledChanges(state, pulled({
      records: [remoteMatch({ status: 'LIVE', venue: 'Legacy venue' }, T2)],
    }));
    const [match] = result.data.matches;
    assert.strictEqual(match.status, 'HALFTIME');
    assert.strictEqual(match.venue, 'Legacy venue');
  });

  it('removes the match only when the tombstone is newer than every local field', () => {
    const state = deviceWithLocalStatusEdit();
    const older = mergePulledChanges(state, pulled({ records: [{ ...remoteMatch({}, T2), deleted: true }] }));
    assert.deepStrictEqual(older.data.matches.map((match) => match.id), ['m-test']);
    assert.strictEqual(older.changed, false);

    const newer = mergePulledChanges(state, pulled({ records: [{ ...remoteMatch({}, T3), deleted: true }] }));
    assert.deepStrictEqual(newer.data.matches, []);
  });

  it('leaves the data untouched when every local field is newer', () => {
    const state = deviceWithLocalStatusEdit();
    const result = mergePulledChanges(state, pulled({
      records: [remoteMatch({ status: 'LIVE', venue: 'Club' }, T1, { 'game-state': T1 })],
    }));
    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.data, state.data);
  });

  it('re-applies a pending match edit over the snapshot field by field', () => {
    const state = deviceWithLocalStatusEdit();
    const snapshot = applyServerSnapshot(
      pulled({ records: [remoteMatch({ status: 'LIVE', venue: 'Server venue' }, T2, { venue: T2 })] }),
      state.outbox
    );
    const [match] = snapshot.data.matches;
    assert.strictEqual(match.status, 'HALFTIME');
    assert.strictEqual(match.venue, 'Server venue');
    assert.strictEqual(readFieldVersions(snapshot.versions, 'm-test')['game-state'], T3);
    assert.ok(snapshot.outbox.records['match:m-test']);
  });
});

/** Record-level versions only (match field versions use `match:<id>#<field>` keys). */
const recordVersions = (versions: Record<string, string>) =>
  Object.fromEntries(Object.entries(versions).filter(([key]) => !key.includes('#')));

describe('applyServerSnapshot (first sync on a device)', () => {
  it('replaces local data with the server snapshot and resets the outbox', () => {
    const remote = toMatchRecord(makeMatch({ id: 'm-server' }));
    const snapshot = applyServerSnapshot(pulled({
      records: [
        playerRecord('p-server', T1),
        playerRecord('p-gone', T1, { deleted: true }),
        { kind: 'match', id: 'm-server', data: remote, updatedAt: T1, deleted: false },
      ],
      events: [
        remoteEvent('ev-2', '2026-10-30T20:00:02.000Z', { matchId: 'm-server', data: makeEvent({ id: 'ev-2', matchId: 'm-server', timestamp: '2026-10-30T20:00:02.000Z' }) }),
        remoteEvent('ev-1', '2026-10-30T20:00:01.000Z', { matchId: 'm-server', data: makeEvent({ id: 'ev-1', matchId: 'm-server', timestamp: '2026-10-30T20:00:01.000Z', type: 'FG3_MADE' }) }),
      ],
    }));
    assert.deepStrictEqual(snapshot.data.divisions, []);
    assert.deepStrictEqual(snapshot.data.players.map((p) => p.id), ['p-server']);
    assert.deepStrictEqual(snapshot.data.matches[0].events.map((e) => e.id), ['ev-1', 'ev-2']);
    assert.strictEqual(snapshot.data.matches[0].homeScore, 5);
    assert.deepStrictEqual(recordVersions(snapshot.versions), {
      'player:p-server': T1,
      'player:p-gone': T1,
      'match:m-server': T1,
    });
    assert.deepStrictEqual(readFieldVersions(snapshot.versions, 'm-server'), resolveFieldVersions(undefined, T1));
    assert.deepStrictEqual(snapshot.outbox, createEmptyOutbox());
  });

  it('re-applies the pending outbox over the snapshot and keeps it, unless the server version is newer', () => {
    const T3 = '2026-10-30T18:00:03.000Z';
    const serverEvent = (id: string, second: number, type: 'FG2_MADE' | 'FG3_MADE') => {
      const timestamp = `2026-10-30T20:00:0${second}.000Z`;
      return remoteEvent(id, timestamp, { matchId: 'm-server', data: makeEvent({ id, matchId: 'm-server', timestamp, type }) });
    };
    const stale = enqueueChanges(
      { outbox: createEmptyOutbox(), versions: {} },
      { records: [{ kind: 'player', id: 'p-stale', data: makePlayer({ id: 'p-stale', lastName: 'Local' }), deleted: false }], events: [] },
      Date.parse(T0)
    );
    const local = enqueueChanges(
      stale,
      {
        records: [
          { kind: 'player', id: 'p-local', data: makePlayer({ id: 'p-local' }), deleted: false },
          { kind: 'player', id: 'p-server', data: makePlayer({ id: 'p-server' }), deleted: true },
        ],
        events: [
          { ...serverEvent('ev-3', 3, 'FG2_MADE'), deleted: false },
          { ...serverEvent('ev-1', 1, 'FG3_MADE'), deleted: true },
        ],
      },
      Date.parse(T3)
    );

    const snapshot = applyServerSnapshot(
      pulled({
        records: [
          playerRecord('p-server', T1),
          playerRecord('p-stale', T2),
          { kind: 'match', id: 'm-server', data: toMatchRecord(makeMatch({ id: 'm-server' })), updatedAt: T1, deleted: false },
        ],
        events: [serverEvent('ev-1', 1, 'FG3_MADE'), serverEvent('ev-2', 2, 'FG2_MADE')],
      }),
      local.outbox
    );

    assert.deepStrictEqual(snapshot.data.players.map((p) => [p.id, p.lastName]), [
      ['p-stale', `Remote ${T2}`],
      ['p-local', 'Player'],
    ]);
    const match = snapshot.data.matches[0];
    assert.deepStrictEqual(match.events.map((e) => e.id), ['ev-2', 'ev-3']);
    assert.strictEqual(match.homeScore, 4, 'the scoreboard is re-derived');
    assert.deepStrictEqual(Object.keys(snapshot.outbox.records).sort(), ['player:p-local', 'player:p-server']);
    assert.deepStrictEqual(Object.keys(snapshot.outbox.events).sort(), ['ev-1', 'ev-3']);
    assert.strictEqual(snapshot.outbox.nextRev, local.outbox.nextRev);
    assert.deepStrictEqual(recordVersions(snapshot.versions), {
      'player:p-server': T3,
      'player:p-stale': T2,
      'player:p-local': T3,
      'match:m-server': T1,
    });
  });
});

describe('isServerCursorBehind (database reset)', () => {
  it('is true only when the server cursor is lower than the local one', () => {
    assert.strictEqual(isServerCursorBehind('1200', '15'), true);
    assert.strictEqual(isServerCursorBehind('15', '15'), false);
    assert.strictEqual(isServerCursorBehind('15', '1200'), false);
    assert.strictEqual(isServerCursorBehind(null, '0'), false);
  });
});

describe('reconcileSelection', () => {
  it('keeps existing selections and falls back to the first available ids', () => {
    const data = club({ matches: [makeMatch({ id: 'm-a', status: 'FINISHED' }), makeMatch({ id: 'm-live', status: 'LIVE' })] });
    assert.deepStrictEqual(reconcileSelection({ activeDivisionId: 'div-test', activeMatchId: 'm-a' }, data), {
      activeDivisionId: 'div-test',
      activeMatchId: 'm-a',
    });
    assert.deepStrictEqual(reconcileSelection({ activeDivisionId: 'gone', activeMatchId: 'gone' }, data), {
      activeDivisionId: 'div-test',
      activeMatchId: 'm-live',
    });
    assert.deepStrictEqual(
      reconcileSelection({ activeDivisionId: 'gone', activeMatchId: 'gone' }, club({ divisions: [], matches: [] })),
      { activeDivisionId: '', activeMatchId: '' }
    );
  });

  it('falls back to a match at HALFTIME like a LIVE one (it is in play)', () => {
    const data = club({ matches: [makeMatch({ id: 'm-a', status: 'FINISHED' }), makeMatch({ id: 'm-half', status: 'HALFTIME' })] });
    assert.strictEqual(reconcileSelection({ activeDivisionId: 'div-test', activeMatchId: 'gone' }, data).activeMatchId, 'm-half');
  });
});
