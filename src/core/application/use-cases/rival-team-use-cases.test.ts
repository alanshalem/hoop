import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { RivalTeam } from '@/core/domain/entities/rival.types';
import { makeRivalTeam } from '@/core/testing/fixtures';
import {
  addRivalPlayer,
  createRivalTeam,
  deleteRivalTeam,
  removeRivalPlayer,
  renameRivalTeam,
  updateRivalPlayer,
} from './rival-team-use-cases';

const CLUB = 'club-1';

function expectOk<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  assert.strictEqual(result.ok, true, JSON.stringify(result));
  return result as Extract<T, { ok: true }>;
}

/** Two teams; the first has two players (#5 and #11). */
function fixture(): RivalTeam[] {
  return [
    makeRivalTeam({ id: 'rival-a', clubId: CLUB, divisionId: 'div-1', name: 'Obras Sanitarias' }),
    makeRivalTeam({ id: 'rival-b', clubId: CLUB, divisionId: 'div-1', name: 'Quimsa', players: [] }),
  ];
}

/** Runs a refused call and checks it left the list exactly as it was. */
function expectRefusal(run: (teams: RivalTeam[]) => { ok: boolean }, reason: string) {
  const teams = fixture();
  const before = structuredClone(teams);
  assert.deepStrictEqual(run(teams), { ok: false, reason });
  assert.deepStrictEqual(teams, before, 'rejected input leaves the list unchanged');
}

describe('createRivalTeam (S14)', () => {
  it('adds an empty team of the division with a trimmed name, keeping the other records', () => {
    const teams = fixture();
    const result = expectOk(
      createRivalTeam(teams, { divisionId: 'div-2', name: '  Ferro Carril Oeste ' }, { id: 'rival-c', clubId: CLUB })
    );
    assert.strictEqual(result.id, 'rival-c');
    assert.deepStrictEqual(result.rivalTeams, [
      ...teams,
      { id: 'rival-c', clubId: CLUB, divisionId: 'div-2', name: 'Ferro Carril Oeste', players: [] },
    ]);
    assert.strictEqual(result.rivalTeams[0], teams[0]);
    assert.strictEqual(result.rivalTeams[1], teams[1]);
  });

  it('refuses a blank name or one longer than 60 characters', () => {
    for (const name of ['', '   ', 'x'.repeat(61)]) {
      expectRefusal((teams) => createRivalTeam(teams, { divisionId: 'div-1', name }, { id: 'x', clubId: CLUB }), 'INVALID_NAME');
    }
  });
});

describe('renameRivalTeam (S14)', () => {
  it('renames with a trimmed name and keeps the other teams', () => {
    const teams = fixture();
    const result = expectOk(renameRivalTeam(teams, 'rival-b', ' Quimsa (Santiago) '));
    assert.deepStrictEqual(result.rivalTeams, [teams[0], { ...teams[1], name: 'Quimsa (Santiago)' }]);
    assert.strictEqual(result.rivalTeams[0], teams[0]);
  });

  it('refuses an invalid name or an unknown team', () => {
    expectRefusal((teams) => renameRivalTeam(teams, 'rival-a', '  '), 'INVALID_NAME');
    expectRefusal((teams) => renameRivalTeam(teams, 'missing', 'Boca'), 'RIVAL_TEAM_NOT_FOUND');
  });
});

describe('addRivalPlayer (S14)', () => {
  it('appends the player with trimmed names and returns its id', () => {
    const teams = fixture();
    const result = expectOk(
      addRivalPlayer(teams, 'rival-a', { dorsal: 0, firstName: ' Juan Pablo ', lastName: ' Vaulet ' }, { id: 'rp-new' })
    );
    assert.strictEqual(result.playerId, 'rp-new');
    assert.deepStrictEqual(result.rivalTeams[0].players, [
      ...teams[0].players,
      { id: 'rp-new', dorsal: 0, firstName: 'Juan Pablo', lastName: 'Vaulet' },
    ]);
    assert.strictEqual(result.rivalTeams[0].players[0], teams[0].players[0]);
    assert.strictEqual(result.rivalTeams[1], teams[1]);
  });

  it('refuses dorsals outside 0-99 or not integer', () => {
    for (const dorsal of [-1, 100, 4.5]) {
      expectRefusal(
        (teams) => addRivalPlayer(teams, 'rival-a', { dorsal, firstName: 'Juan', lastName: 'Pérez' }, { id: 'x' }),
        'INVALID_DORSAL'
      );
    }
  });

  it('refuses blank or too long player names', () => {
    for (const [firstName, lastName] of [['', 'Pérez'], ['Juan', ' '], ['Juan', 'x'.repeat(41)]]) {
      expectRefusal(
        (teams) => addRivalPlayer(teams, 'rival-a', { dorsal: 30, firstName, lastName }, { id: 'x' }),
        'INVALID_PLAYER_NAME'
      );
    }
  });

  it('refuses a dorsal already used in the team, but allows it in another team', () => {
    expectRefusal(
      (teams) => addRivalPlayer(teams, 'rival-a', { dorsal: 5, firstName: 'Juan', lastName: 'Pérez' }, { id: 'x' }),
      'DUPLICATE_DORSAL'
    );
    expectOk(addRivalPlayer(fixture(), 'rival-b', { dorsal: 5, firstName: 'Juan', lastName: 'Pérez' }, { id: 'x' }));
  });

  it('refuses an unknown team', () => {
    expectRefusal(
      (teams) => addRivalPlayer(teams, 'missing', { dorsal: 30, firstName: 'Juan', lastName: 'Pérez' }, { id: 'x' }),
      'RIVAL_TEAM_NOT_FOUND'
    );
  });
});

describe('updateRivalPlayer (S14)', () => {
  it('edits dorsal and names, keeping the other players and teams', () => {
    const teams = fixture();
    const [first, second] = teams[0].players;
    const result = expectOk(updateRivalPlayer(teams, 'rival-a', first.id, { dorsal: 23, lastName: ' Gómez ' }));
    assert.deepStrictEqual(result.rivalTeams[0].players, [{ ...first, dorsal: 23, lastName: 'Gómez' }, second]);
    assert.strictEqual(result.rivalTeams[0].players[1], second);
    assert.strictEqual(result.rivalTeams[1], teams[1]);
  });

  it('accepts the player keeping its own dorsal', () => {
    const teams = fixture();
    const [first] = teams[0].players;
    const result = expectOk(updateRivalPlayer(teams, 'rival-a', first.id, { dorsal: first.dorsal, firstName: 'Pedro' }));
    assert.strictEqual(result.rivalTeams[0].players[0].firstName, 'Pedro');
  });

  it('refuses invalid values, a repeated dorsal and unknown ids', () => {
    const [first, second] = fixture()[0].players;
    expectRefusal((teams) => updateRivalPlayer(teams, 'rival-a', first.id, { dorsal: 100 }), 'INVALID_DORSAL');
    expectRefusal((teams) => updateRivalPlayer(teams, 'rival-a', first.id, { firstName: '' }), 'INVALID_PLAYER_NAME');
    expectRefusal((teams) => updateRivalPlayer(teams, 'rival-a', first.id, { dorsal: second.dorsal }), 'DUPLICATE_DORSAL');
    expectRefusal((teams) => updateRivalPlayer(teams, 'rival-a', 'missing', { dorsal: 1 }), 'PLAYER_NOT_FOUND');
    expectRefusal((teams) => updateRivalPlayer(teams, 'missing', first.id, { dorsal: 1 }), 'RIVAL_TEAM_NOT_FOUND');
  });
});

describe('removeRivalPlayer (S14)', () => {
  it('removes the player and keeps the rest', () => {
    const teams = fixture();
    const [first, second] = teams[0].players;
    const result = expectOk(removeRivalPlayer(teams, 'rival-a', first.id));
    assert.deepStrictEqual(result.rivalTeams[0].players, [second]);
    assert.strictEqual(result.rivalTeams[1], teams[1]);
  });

  it('refuses an unknown player or team', () => {
    expectRefusal((teams) => removeRivalPlayer(teams, 'rival-a', 'missing'), 'PLAYER_NOT_FOUND');
    expectRefusal((teams) => removeRivalPlayer(teams, 'missing', 'rp-1'), 'RIVAL_TEAM_NOT_FOUND');
  });
});

describe('deleteRivalTeam (S14)', () => {
  it('removes the team and keeps the others by reference', () => {
    const teams = fixture();
    const result = expectOk(deleteRivalTeam(teams, 'rival-a'));
    assert.deepStrictEqual(result.rivalTeams, [teams[1]]);
    assert.strictEqual(result.rivalTeams[0], teams[1]);
  });

  it('refuses an unknown team', () => {
    expectRefusal((teams) => deleteRivalTeam(teams, 'missing'), 'RIVAL_TEAM_NOT_FOUND');
  });
});
