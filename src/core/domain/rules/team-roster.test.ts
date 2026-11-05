import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getTeamRosterPlayers, isCalledUpTo, isYouthCategory } from './team-roster';
import { makePlayer, makeTeam } from '@/core/testing/fixtures';

const team = makeTeam({ id: 'team-own', playerIds: ['p-junior'] });
const own9 = makePlayer({ id: 'p-own-9', dorsal: 9, teamId: 'team-own' });
const own4 = makePlayer({ id: 'p-own-4', dorsal: 4, teamId: 'team-own' });
const junior = makePlayer({ id: 'p-junior', dorsal: 6, teamId: 'team-u19' });
const other = makePlayer({ id: 'p-other', dorsal: 1, teamId: 'team-u19' });

describe('getTeamRosterPlayers', () => {
  it('lists assigned and called-up players sorted by dorsal', () => {
    const roster = getTeamRosterPlayers(team, [own9, other, junior, own4]);
    assert.deepStrictEqual(
      roster.map((player) => player.id),
      ['p-own-4', 'p-junior', 'p-own-9']
    );
  });

  it('is empty without a team', () => {
    assert.deepStrictEqual(getTeamRosterPlayers(undefined, [own9, junior]), []);
  });
});

describe('isCalledUpTo', () => {
  it('is true only for a roster player assigned to another team', () => {
    assert.strictEqual(isCalledUpTo(junior, team), true);
    assert.strictEqual(isCalledUpTo(own9, team), false);
    assert.strictEqual(isCalledUpTo(other, team), false);
    assert.strictEqual(isCalledUpTo(junior, undefined), false);
  });

  it('is false for a team player that is also listed in the roster', () => {
    const listedOwn = makeTeam({ id: 'team-own', playerIds: ['p-own-9'] });
    assert.strictEqual(isCalledUpTo(own9, listedOwn), false);
  });
});

describe('isYouthCategory', () => {
  it('excludes Primera, Femenino and custom categories', () => {
    assert.deepStrictEqual(
      (['PRIMERA', 'U21', 'U19', 'U17', 'U15', 'U13', 'MINI', 'FEMENINO', 'CUSTOM'] as const).filter(isYouthCategory),
      ['U21', 'U19', 'U17', 'U15', 'U13', 'MINI']
    );
  });
});
