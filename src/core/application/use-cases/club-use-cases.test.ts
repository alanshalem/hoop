import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  addPlayer,
  assignHeadCoach,
  callUpPlayer,
  ClubData,
  createDivision,
  deleteDivision,
  deletePlayer,
  updateDivision,
  updatePlayer,
} from './club-use-cases';
import type { Player, User } from '@/core/domain/entities/club.types';

function player(id: string, teamId?: string): Player {
  return {
    id,
    firstName: id,
    lastName: id,
    dorsal: 1,
    heightCm: 190,
    dominantHand: 'RIGHT',
    position: 'PG',
    status: 'ACTIVE',
    clubId: 'c',
    teamId,
  };
}

function user(id: string, role: User['role']): User {
  return {
    id,
    name: id,
    email: `${id}@hoop.test`,
    role,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function seed(): ClubData {
  return {
    divisions: [
      { id: 'd1', name: 'Primera', category: 'PRIMERA', gender: 'MALE', clubId: 'c' },
      { id: 'd2', name: 'U19', category: 'U19', gender: 'MALE', clubId: 'c' },
    ],
    teams: [
      { id: 't1', name: 'Club - Primera', divisionId: 'd1', season: '2025/2026', headCoachId: 'u1', assistantCoachIds: [], playerIds: ['a', 'y'], clubId: 'c' },
      { id: 't2', name: 'Club - U19', divisionId: 'd2', season: '2025/2026', assistantCoachIds: [], playerIds: ['y'], clubId: 'c' },
    ],
    players: [player('a', 't1'), player('y', 't2')],
  };
}

describe('createDivision', () => {
  it('creates the division and its team for the given season', () => {
    const next = createDivision(
      seed(),
      { name: 'U15', category: 'U15', gender: 'MALE', clubId: 'c' },
      { divisionId: 'd3', teamId: 't3', season: '2025/2026', clubName: 'Club' }
    );
    assert.strictEqual(next.divisions.length, 3);
    assert.deepStrictEqual(next.teams[2], {
      id: 't3',
      name: 'Club - U15',
      divisionId: 'd3',
      season: '2025/2026',
      headCoachId: undefined,
      assistantCoachIds: [],
      playerIds: [],
      clubId: 'c',
    });
  });
});

describe('updateDivision', () => {
  it('renames the division and its team', () => {
    const next = updateDivision(seed(), 'd2', { name: 'Sub-19' }, { clubName: 'Club' });
    assert.strictEqual(next.divisions[1].name, 'Sub-19');
    assert.strictEqual(next.teams[1].name, 'Club - Sub-19');
    assert.strictEqual(next.teams[0].name, 'Club - Primera');
  });

  it('keeps the team name when the division name is unchanged', () => {
    const next = updateDivision(seed(), 'd2', { description: 'Liga' }, { clubName: 'Other' });
    assert.strictEqual(next.divisions[1].description, 'Liga');
    assert.strictEqual(next.teams[1].name, 'Club - U19');
  });
});

describe('deleteDivision', () => {
  it('removes the division, its team and unassigns its players', () => {
    const next = deleteDivision(seed(), 'd2');
    assert.deepStrictEqual(next.divisions.map((d) => d.id), ['d1']);
    assert.deepStrictEqual(next.teams.map((t) => t.id), ['t1']);
    assert.strictEqual(next.players.find((p) => p.id === 'y')?.teamId, undefined);
    assert.strictEqual(next.players.find((p) => p.id === 'a')?.teamId, 't1');
  });
});

describe('assignHeadCoach', () => {
  const users = [user('u1', 'HEAD_COACH'), user('u2', 'HEAD_COACH'), user('s1', 'ASSISTANT_STATISTICIAN')];

  it('assigns a head coach user to the team', () => {
    const result = assignHeadCoach(seed(), users, 't2', 'u2');
    assert.strictEqual(result.ok, true);
    if (result.ok) assert.strictEqual(result.data.teams[1].headCoachId, 'u2');
  });

  it('rejects users without the HEAD_COACH role', () => {
    assert.deepStrictEqual(assignHeadCoach(seed(), users, 't2', 's1'), {
      ok: false,
      reason: 'USER_NOT_HEAD_COACH',
    });
  });

  it('unassigns the head coach when userId is null', () => {
    const result = assignHeadCoach(seed(), users, 't1', null);
    assert.strictEqual(result.ok, true);
    if (result.ok) assert.strictEqual(result.data.teams[0].headCoachId, undefined);
  });

  it('rejects unknown teams', () => {
    assert.deepStrictEqual(assignHeadCoach(seed(), users, 'nope', 'u2'), {
      ok: false,
      reason: 'TEAM_NOT_FOUND',
    });
  });
});

describe('players', () => {
  it('addPlayer stores the player and adds it to its team roster', () => {
    const { id: _ignored, ...input } = player('ignored', 't2');
    void _ignored;
    const next = addPlayer(seed(), input, { id: 'n1' });
    assert.strictEqual(next.players.at(-1)?.id, 'n1');
    assert.deepStrictEqual(next.teams[1].playerIds, ['y', 'n1']);
  });

  it('updatePlayer moves the player between team rosters when teamId changes', () => {
    const next = updatePlayer(seed(), 'a', { teamId: 't2', dorsal: 9 });
    assert.strictEqual(next.players[0].dorsal, 9);
    assert.deepStrictEqual(next.teams[0].playerIds, ['y']);
    assert.deepStrictEqual(next.teams[1].playerIds, ['y', 'a']);
  });

  it('deletePlayer removes the player from every roster', () => {
    const next = deletePlayer(seed(), 'y');
    assert.deepStrictEqual(next.players.map((p) => p.id), ['a']);
    assert.deepStrictEqual(next.teams[0].playerIds, ['a']);
    assert.deepStrictEqual(next.teams[1].playerIds, []);
  });

  it('callUpPlayer adds a juvenile to the target roster once', () => {
    const data = seed();
    data.teams[0].playerIds = ['a'];
    const result = callUpPlayer(data, 'y', 't1');
    assert.strictEqual(result.ok, true);
    if (result.ok) assert.deepStrictEqual(result.data.teams[0].playerIds, ['a', 'y']);
    assert.deepStrictEqual(callUpPlayer(seed(), 'y', 't1'), {
      ok: false,
      reason: 'ALREADY_IN_TEAM',
    });
    assert.deepStrictEqual(callUpPlayer(seed(), 'zz', 't1'), {
      ok: false,
      reason: 'PLAYER_NOT_FOUND',
    });
  });
});
