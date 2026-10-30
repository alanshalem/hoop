import { describe, it } from 'node:test';
import assert from 'node:assert';
import { diffClubState } from './club-diff';
import type { SyncableClubData } from './sync-types';
import { makeDivision, makeEvent, makeMatch, makePlayer, makeTeam } from '@/core/testing/fixtures';

function club(overrides: Partial<SyncableClubData> = {}): SyncableClubData {
  return {
    divisions: [makeDivision()],
    teams: [makeTeam()],
    players: [makePlayer({ id: 'p1' }), makePlayer({ id: 'p2', dorsal: 8 })],
    matches: [makeMatch()],
    ...overrides,
  };
}

describe('diffClubState (S10.7)', () => {
  it('reports nothing when every collection keeps its references', () => {
    const state = club();
    const diff = diffClubState(state, { ...state });
    assert.deepStrictEqual(diff, { records: [], events: [] });
  });

  it('detects created, edited and removed entities by reference and id', () => {
    const prev = club();
    const [p1, p2] = prev.players;
    const edited = { ...p1, dorsal: 23 };
    const created = makePlayer({ id: 'p3', dorsal: 30 });
    const next = { ...prev, players: [edited, created] };

    const diff = diffClubState(prev, next);

    assert.deepStrictEqual(diff.records, [
      { kind: 'player', id: 'p1', data: edited, deleted: false },
      { kind: 'player', id: 'p3', data: created, deleted: false },
      { kind: 'player', id: 'p2', data: p2, deleted: true },
    ]);
    assert.deepStrictEqual(diff.events, []);
  });

  it('covers divisions and teams with their own kinds', () => {
    const prev = club();
    const division = { ...prev.divisions[0], name: 'Primera A' };
    const team = { ...prev.teams[0], headCoachId: 'user-coach-1' };
    const diff = diffClubState(prev, { ...prev, divisions: [division], teams: [team] });
    assert.deepStrictEqual(
      diff.records.map((change) => [change.kind, change.id, change.deleted]),
      [
        ['division', 'div-test', false],
        ['team', 'team-own', false],
      ]
    );
  });

  it('sends match metadata without events and reports new and removed events', () => {
    const kept = makeEvent({ id: 'ev-kept' });
    const undone = makeEvent({ id: 'ev-undone' });
    const prev = club({ matches: [makeMatch({ events: [kept, undone] })] });
    const added = makeEvent({ id: 'ev-added' });
    const nextMatch = { ...prev.matches[0], homeScore: 4, quarterTimeRemainingSeconds: 480, events: [kept, added] };

    const diff = diffClubState(prev, { ...prev, matches: [nextMatch] });

    assert.strictEqual(diff.records.length, 1);
    const [record] = diff.records;
    assert.strictEqual(record.kind, 'match');
    assert.strictEqual(record.deleted, false);
    assert.ok(!('events' in record.data), 'match records never embed events');
    assert.strictEqual(record.data.homeScore, 4);
    assert.deepStrictEqual(record.kind === 'match' && record.changedFields, ['quarterTimeRemainingSeconds']);
    assert.deepStrictEqual(diff.events, [
      { id: 'ev-added', matchId: 'm-test', data: added, deleted: false },
      { id: 'ev-undone', matchId: 'm-test', data: undone, deleted: true },
    ]);
  });

  it('skips the match record when only the match object reference changed', () => {
    const prev = club();
    const sameMetadata = { ...prev.matches[0] };
    const diff = diffClubState(prev, { ...prev, matches: [sameMetadata] });
    assert.deepStrictEqual(diff, { records: [], events: [] });
  });

  it('skips the match record when only derived scoreboard fields changed (S13.1)', () => {
    const prev = club();
    const added = makeEvent({ id: 'ev-added' });
    const nextMatch = { ...prev.matches[0], homeScore: 2, homeFoulsQuarter: 1, events: [added] };
    const diff = diffClubState(prev, { ...prev, matches: [nextMatch] });
    assert.deepStrictEqual(diff.records, []);
    assert.deepStrictEqual(diff.events.map((event) => event.id), ['ev-added']);
  });

  it('lists the changed match fields, compared by value (S13.1)', () => {
    const prev = club();
    const before = prev.matches[0];
    const nextMatch = {
      ...before,
      venue: 'Nuevo estadio',
      status: 'HALFTIME' as const,
      activeLineupOwn: [...before.activeLineupOwn],
    };
    const [record] = diffClubState(prev, { ...prev, matches: [nextMatch] }).records;
    assert.deepStrictEqual(record.kind === 'match' && record.changedFields, ['venue', 'status']);
  });

  it('sends every event of a new match and none for a removed match', () => {
    const event = makeEvent({ id: 'ev-1', matchId: 'm-new' });
    const prev = club();
    const created = makeMatch({ id: 'm-new', events: [event] });

    const added = diffClubState(prev, { ...prev, matches: [...prev.matches, created] });
    assert.deepStrictEqual(
      added.records.map((change) => [change.kind, change.id, change.deleted]),
      [['match', 'm-new', false]]
    );
    assert.ok(!('changedFields' in added.records[0]), 'a new match versions every field');
    assert.deepStrictEqual(added.events, [{ id: 'ev-1', matchId: 'm-new', data: event, deleted: false }]);

    const withMatch = { ...prev, matches: [...prev.matches, created] };
    const removed = diffClubState(withMatch, prev);
    assert.deepStrictEqual(
      removed.records.map((change) => [change.kind, change.id, change.deleted]),
      [['match', 'm-new', true]]
    );
    assert.ok(!('events' in removed.records[0].data), 'tombstones carry the last data without events');
    assert.deepStrictEqual(removed.events, []);
  });
});
