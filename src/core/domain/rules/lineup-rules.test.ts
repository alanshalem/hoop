import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getLineupCandidates } from './lineup-rules';
import { makeMatch, makePlayer, makeTeam } from '@/core/testing/fixtures';

const team = makeTeam({ id: 'team-own', playerIds: ['p-junior'] });
const own = makePlayer({ id: 'p-own', dorsal: 9, teamId: 'team-own' });
const junior = makePlayer({ id: 'p-junior', dorsal: 6, teamId: 'team-u19' });
const outsider = makePlayer({ id: 'p-outsider', dorsal: 3, teamId: 'team-u19' });
const listedGuest = makePlayer({ id: 'p-guest', dorsal: 12, teamId: 'team-u19' });
const suspended = makePlayer({ id: 'p-suspended', dorsal: 2, teamId: 'team-own', status: 'SUSPENDED' });
const players = [own, junior, outsider, listedGuest, suspended];

const ids = (list: readonly { id: string }[]) => list.map((player) => player.id);

describe('getLineupCandidates', () => {
  it('offers the team roster plus listed players, sorted by dorsal', () => {
    const match = makeMatch({ status: 'SCHEDULED', rosterOwnPlayerIds: ['p-guest'] });
    assert.deepStrictEqual(ids(getLineupCandidates(match, team, players)), ['p-junior', 'p-own', 'p-guest']);
  });

  it('leaves suspended players out before tip-off, even when listed', () => {
    const match = makeMatch({ status: 'SCHEDULED', rosterOwnPlayerIds: ['p-suspended'] });
    assert.deepStrictEqual(ids(getLineupCandidates(match, team, players)), ['p-junior', 'p-own']);
  });

  it('keeps listed suspended players once the match started', () => {
    for (const status of ['LIVE', 'HALFTIME', 'FINISHED'] as const) {
      const listed = makeMatch({ status, rosterOwnPlayerIds: ['p-suspended'] });
      assert.deepStrictEqual(ids(getLineupCandidates(listed, team, players)), ['p-suspended', 'p-junior', 'p-own']);
      const unlisted = makeMatch({ status, rosterOwnPlayerIds: [] });
      assert.deepStrictEqual(ids(getLineupCandidates(unlisted, team, players)), ['p-junior', 'p-own']);
    }
  });

  it('offers only the listed players when the team no longer exists', () => {
    const match = makeMatch({ status: 'LIVE', rosterOwnPlayerIds: ['p-guest', 'p-own'] });
    assert.deepStrictEqual(ids(getLineupCandidates(match, undefined, players)), ['p-own', 'p-guest']);
  });
});
