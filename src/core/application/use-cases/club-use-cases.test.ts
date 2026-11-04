import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  addPlayer,
  assignAssistantCoaches,
  assignHeadCoach,
  callUpPlayer,
  ClubData,
  createDivision,
  deleteDivision,
  deletePlayer,
  updateDivision,
  updatePlayer,
} from './club-use-cases';
import type { Player } from '@/core/domain/entities/club.types';
import { makeCoach } from '@/core/testing/fixtures';

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

const COACHES = [
  makeCoach({ id: 'c1', name: 'Head One', role: 'HEAD' }),
  makeCoach({ id: 'c2', name: 'Head Two', role: 'HEAD' }),
  makeCoach({ id: 'a1', name: 'Assistant One', role: 'ASSISTANT' }),
];

function seed(): ClubData {
  return {
    divisions: [
      { id: 'd1', name: 'Primera', category: 'PRIMERA', gender: 'MALE', clubId: 'c' },
      { id: 'd2', name: 'U19', category: 'U19', gender: 'MALE', clubId: 'c' },
    ],
    teams: [
      { id: 't1', name: 'Club - Primera', divisionId: 'd1', season: '2025/2026', headCoachId: 'c1', assistantCoachIds: [], playerIds: ['a', 'y'], clubId: 'c' },
      { id: 't2', name: 'Club - U19', divisionId: 'd2', season: '2025/2026', assistantCoachIds: [], playerIds: ['y'], clubId: 'c' },
    ],
    players: [player('a', 't1'), player('y', 't2')],
  };
}

describe('createDivision', () => {
  const U15 = { name: 'U15', category: 'U15', gender: 'MALE', clubId: 'c' } as const;
  const ctx = { divisionId: 'd3', teamId: 't3', season: '2025/2026', clubName: 'Club' };

  it('creates the division and its team for the given season', () => {
    const result = createDivision(seed(), COACHES, U15, ctx);
    assert.ok(result.ok);
    assert.strictEqual(result.data.divisions.length, 3);
    assert.deepStrictEqual(result.data.teams[2], {
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

  it('assigns the chosen head coach and assistants by coach id (S5)', () => {
    const result = createDivision(seed(), COACHES, U15, { ...ctx, headCoachId: 'a1', assistantCoachIds: ['c2', 'c2'] });
    assert.ok(result.ok);
    assert.strictEqual(result.data.teams[2].headCoachId, 'a1');
    assert.deepStrictEqual(result.data.teams[2].assistantCoachIds, ['c2']);
  });

  it('refuses unknown coach ids and creates nothing (S5)', () => {
    const data = seed();
    assert.deepStrictEqual(createDivision(data, COACHES, U15, { ...ctx, headCoachId: 'u1' }), {
      ok: false,
      reason: 'COACH_NOT_FOUND',
    });
    assert.deepStrictEqual(createDivision(data, COACHES, U15, { ...ctx, assistantCoachIds: ['nope'] }), {
      ok: false,
      reason: 'COACH_NOT_FOUND',
    });
    assert.deepStrictEqual(data, seed());
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

describe('assignHeadCoach (S5)', () => {
  it('assigns any existing coach to the team, whatever its role', () => {
    const result = assignHeadCoach(seed(), COACHES, 't2', 'c2');
    assert.ok(result.ok);
    assert.strictEqual(result.data.teams[1].headCoachId, 'c2');
    const assistant = assignHeadCoach(seed(), COACHES, 't2', 'a1');
    assert.ok(assistant.ok);
    assert.strictEqual(assistant.data.teams[1].headCoachId, 'a1');
  });

  it('refuses ids that are not coaches (for example a user id)', () => {
    assert.deepStrictEqual(assignHeadCoach(seed(), COACHES, 't2', 'u1'), {
      ok: false,
      reason: 'COACH_NOT_FOUND',
    });
  });

  it('unassigns the head coach when coachId is null', () => {
    const result = assignHeadCoach(seed(), COACHES, 't1', null);
    assert.ok(result.ok);
    assert.strictEqual(result.data.teams[0].headCoachId, undefined);
  });

  it('rejects unknown teams', () => {
    assert.deepStrictEqual(assignHeadCoach(seed(), COACHES, 'nope', 'c2'), {
      ok: false,
      reason: 'TEAM_NOT_FOUND',
    });
  });
});

describe('assignAssistantCoaches (S5)', () => {
  it('replaces the assistants of the team with the given coaches, once each, in order', () => {
    const data = seed();
    const result = assignAssistantCoaches(data, COACHES, 't1', ['a1', 'c2', 'a1']);
    assert.ok(result.ok);
    assert.deepStrictEqual(result.data.teams[0].assistantCoachIds, ['a1', 'c2']);
    assert.strictEqual(result.data.teams[1], data.teams[1]);
    const cleared = assignAssistantCoaches(result.data, COACHES, 't1', []);
    assert.ok(cleared.ok);
    assert.deepStrictEqual(cleared.data.teams[0].assistantCoachIds, []);
  });

  it('refuses unknown coaches and unknown teams', () => {
    assert.deepStrictEqual(assignAssistantCoaches(seed(), COACHES, 't1', ['a1', 'u1']), {
      ok: false,
      reason: 'COACH_NOT_FOUND',
    });
    assert.deepStrictEqual(assignAssistantCoaches(seed(), COACHES, 'nope', ['a1']), {
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
