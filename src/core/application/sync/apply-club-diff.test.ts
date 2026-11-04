import { describe, it } from 'node:test';
import assert from 'node:assert';
import { applyClubDiff } from './apply-club-diff';
import { diffClubState } from './club-diff';
import { toMatchRecord } from './sync-records';
import type { SyncableClubData } from './sync-types';
import { makeClubData, makeDivision, makeEvent, makeMatch, makePlayer, makeTeam } from '@/core/testing/fixtures';

function club(overrides: Partial<SyncableClubData> = {}): SyncableClubData {
  return makeClubData({
    divisions: [makeDivision()],
    teams: [makeTeam()],
    players: [makePlayer({ id: 'p1' }), makePlayer({ id: 'p2', dorsal: 8 })],
    matches: [makeMatch()],
    ...overrides,
  });
}

describe('applyClubDiff (S13.3: a follower tab edit applied by the leader)', () => {
  it('replays a diff onto an equal state, so the result matches the follower', () => {
    const follower = club();
    const edited: SyncableClubData = {
      ...follower,
      players: [{ ...follower.players[0], dorsal: 23 }, makePlayer({ id: 'p3' })],
      divisions: [],
    };
    const result = applyClubDiff(club(), diffClubState(follower, edited));
    assert.deepStrictEqual(result.players, edited.players);
    assert.deepStrictEqual(result.divisions, []);
  });

  it('keeps untouched collections by reference', () => {
    const leader = club();
    const follower = club();
    const result = applyClubDiff(leader, diffClubState(follower, { ...follower, players: [makePlayer({ id: 'p1', dorsal: 30 })] }));
    assert.strictEqual(result.divisions, leader.divisions);
    assert.strictEqual(result.teams, leader.teams);
    assert.strictEqual(result.matches, leader.matches);
  });

  it('applies only the changed match fields, keeping concurrent leader edits of other fields', () => {
    const follower = club();
    const followerEdit = { ...follower.matches[0], venue: 'Follower venue' };
    const diff = diffClubState(follower, { ...follower, matches: [followerEdit] });

    const leader = club({ matches: [makeMatch({ status: 'HALFTIME', quarterTimeRemainingSeconds: 0 })] });
    const [match] = applyClubDiff(leader, diff).matches;
    assert.strictEqual(match.venue, 'Follower venue');
    assert.strictEqual(match.status, 'HALFTIME');
    assert.strictEqual(match.quarterTimeRemainingSeconds, 0);
  });

  it('adds new and removes undone events by id, ordered by time, and re-derives the scoreboard', () => {
    const kept = makeEvent({ id: 'ev-kept', type: 'FG2_MADE', timestamp: '2026-10-01T20:00:01.000Z' });
    const undone = makeEvent({ id: 'ev-undone', type: 'FG3_MADE', timestamp: '2026-10-01T20:00:02.000Z' });
    const added = makeEvent({ id: 'ev-added', type: 'FG3_MADE', timestamp: '2026-10-01T20:00:03.000Z' });
    const leaderOnly = makeEvent({ id: 'ev-leader', type: 'FT_MADE', timestamp: '2026-10-01T20:00:04.000Z' });

    const follower = club({ matches: [makeMatch({ events: [kept, undone] })] });
    const diff = diffClubState(follower, { ...follower, matches: [{ ...follower.matches[0], events: [kept, added] }] });

    const leader = club({ matches: [makeMatch({ events: [kept, undone, leaderOnly] })] });
    const [match] = applyClubDiff(leader, diff).matches;
    assert.deepStrictEqual(match.events.map((event) => event.id), ['ev-kept', 'ev-added', 'ev-leader']);
    assert.strictEqual(match.homeScore, 6);
  });

  it('creates a new match with its events and removes a deleted one', () => {
    const event = makeEvent({ id: 'ev-1', matchId: 'm-new', type: 'FG2_MADE' });
    const created = makeMatch({ id: 'm-new', events: [event] });
    const follower = club();
    const withMatch = applyClubDiff(club(), diffClubState(follower, { ...follower, matches: [...follower.matches, created] }));
    const newMatch = withMatch.matches.find((match) => match.id === 'm-new');
    assert.ok(newMatch);
    assert.deepStrictEqual(toMatchRecord(newMatch), toMatchRecord({ ...created, homeScore: 2 }));
    assert.deepStrictEqual(newMatch.events, [event]);

    const removed = applyClubDiff(withMatch, diffClubState(withMatch, { ...withMatch, matches: [follower.matches[0]] }));
    assert.deepStrictEqual(removed.matches.map((match) => match.id), ['m-test']);
  });

  it('ignores events of a match the leader does not have', () => {
    const follower = club({ matches: [] });
    const leader = club({ matches: [] });
    const diff = {
      records: [],
      events: [{ id: 'ev-x', matchId: 'm-missing', data: makeEvent({ id: 'ev-x', matchId: 'm-missing' }), deleted: false }],
    };
    const result = applyClubDiff(leader, diff);
    assert.strictEqual(result.matches, leader.matches);
    assert.deepStrictEqual(follower.matches, []);
  });
});
