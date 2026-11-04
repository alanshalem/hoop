import { describe, it } from 'node:test';
import assert from 'node:assert';
import { makeMatch, makeRivalTeam } from '@/core/testing/fixtures';
import {
  RIVAL_PLAYER_REFUSAL_MESSAGES,
  RIVAL_TEAM_REFUSAL_MESSAGES,
  RivalPlayerFormSchema,
  RivalTeamFormSchema,
  countLinkedMatches,
  formatLinkedMatches,
  formatRivalPlayerCount,
  rivalPlayerRefusalField,
  sortRivalPlayers,
} from './rival-roster';

const issues = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  result.success ? [] : (result.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]);

describe('rival team form (S14)', () => {
  it('trims the name and requires a division', () => {
    assert.deepStrictEqual(RivalTeamFormSchema.parse({ divisionId: 'div-1', name: '  Obras Sanitarias ' }), {
      divisionId: 'div-1',
      name: 'Obras Sanitarias',
    });
    assert.deepStrictEqual(issues(RivalTeamFormSchema.safeParse({ divisionId: '', name: 'Obras' })), [
      ['divisionId', 'Elige la división del rival.'],
    ]);
  });

  it('refuses empty and too long names with the use-case message', () => {
    for (const name of ['   ', 'x'.repeat(61)]) {
      assert.deepStrictEqual(issues(RivalTeamFormSchema.safeParse({ divisionId: 'div-1', name })), [
        ['name', RIVAL_TEAM_REFUSAL_MESSAGES.INVALID_NAME],
      ]);
    }
    assert.strictEqual(RIVAL_TEAM_REFUSAL_MESSAGES.INVALID_NAME, 'El nombre debe tener de 1 a 60 caracteres.');
    assert.strictEqual(RIVAL_TEAM_REFUSAL_MESSAGES.RIVAL_TEAM_NOT_FOUND, 'El equipo rival ya no existe.');
  });
});

describe('rival player form (S14)', () => {
  it('accepts dorsals 0 and 99 and trims names', () => {
    assert.deepStrictEqual(RivalPlayerFormSchema.parse({ dorsal: 0, firstName: ' Juan ', lastName: ' Pérez ' }), {
      dorsal: 0,
      firstName: 'Juan',
      lastName: 'Pérez',
    });
    assert.ok(RivalPlayerFormSchema.safeParse({ dorsal: 99, firstName: 'A', lastName: 'B' }).success);
  });

  it('refuses dorsals outside 0-99, decimals and an empty field with the use-case message', () => {
    for (const dorsal of [-1, 100, 4.5, Number.NaN]) {
      assert.deepStrictEqual(issues(RivalPlayerFormSchema.safeParse({ dorsal, firstName: 'A', lastName: 'B' })), [
        ['dorsal', RIVAL_PLAYER_REFUSAL_MESSAGES.INVALID_DORSAL],
      ]);
    }
    assert.strictEqual(RIVAL_PLAYER_REFUSAL_MESSAGES.INVALID_DORSAL, 'El dorsal debe ser un número entero de 0 a 99.');
  });

  it('refuses empty and too long names', () => {
    assert.deepStrictEqual(
      issues(RivalPlayerFormSchema.safeParse({ dorsal: 7, firstName: ' ', lastName: 'x'.repeat(41) })),
      [
        ['firstName', 'El nombre debe tener de 1 a 40 caracteres.'],
        ['lastName', 'El apellido debe tener de 1 a 40 caracteres.'],
      ]
    );
  });

  it('explains every use-case refusal and points dorsal refusals at the dorsal field', () => {
    assert.strictEqual(RIVAL_PLAYER_REFUSAL_MESSAGES.DUPLICATE_DORSAL, 'Ya hay un jugador con ese dorsal en este equipo.');
    assert.strictEqual(
      RIVAL_PLAYER_REFUSAL_MESSAGES.INVALID_PLAYER_NAME,
      'El nombre y el apellido deben tener de 1 a 40 caracteres.'
    );
    assert.strictEqual(RIVAL_PLAYER_REFUSAL_MESSAGES.PLAYER_NOT_FOUND, 'El jugador ya no está en el plantel del rival.');
    assert.strictEqual(RIVAL_PLAYER_REFUSAL_MESSAGES.RIVAL_TEAM_NOT_FOUND, 'El equipo rival ya no existe.');
    assert.strictEqual(rivalPlayerRefusalField('DUPLICATE_DORSAL'), 'dorsal');
    assert.strictEqual(rivalPlayerRefusalField('INVALID_DORSAL'), 'dorsal');
    assert.strictEqual(rivalPlayerRefusalField('INVALID_PLAYER_NAME'), 'firstName');
    assert.strictEqual(rivalPlayerRefusalField('PLAYER_NOT_FOUND'), null);
    assert.strictEqual(rivalPlayerRefusalField('RIVAL_TEAM_NOT_FOUND'), null);
  });
});

describe('rival roster display (S14)', () => {
  it('sorts players by dorsal without changing the input', () => {
    const team = makeRivalTeam({
      players: [
        { id: 'a', dorsal: 23, firstName: 'A', lastName: 'A' },
        { id: 'b', dorsal: 4, firstName: 'B', lastName: 'B' },
        { id: 'c', dorsal: 0, firstName: 'C', lastName: 'C' },
      ],
    });
    assert.deepStrictEqual(
      sortRivalPlayers(team.players).map((player) => player.dorsal),
      [0, 4, 23]
    );
    assert.deepStrictEqual(
      team.players.map((player) => player.dorsal),
      [23, 4, 0]
    );
  });

  it('counts players and matches that resolve to the team', () => {
    assert.strictEqual(formatRivalPlayerCount(0), 'Sin jugadores');
    assert.strictEqual(formatRivalPlayerCount(1), '1 jugador');
    assert.strictEqual(formatRivalPlayerCount(12), '12 jugadores');
    assert.strictEqual(formatLinkedMatches(0), 'Ningún partido con este nombre');
    assert.strictEqual(formatLinkedMatches(1), '1 partido con este nombre');
    assert.strictEqual(formatLinkedMatches(3), '3 partidos con este nombre');
  });

  it('links matches of the same division whose rival name matches, ignoring case and accents', () => {
    const team = makeRivalTeam({ id: 'r-obras', name: 'Obras Sanitarias' });
    const other = makeRivalTeam({ id: 'r-other', divisionId: 'div-2', name: 'Obras Sanitarias' });
    const matches = [
      makeMatch({ id: 'm1', rivalTeamName: 'obras sanitarias' }),
      makeMatch({ id: 'm2', rivalTeamName: 'Óbras Sanitarias ' }),
      makeMatch({ id: 'm3', rivalTeamName: 'Obras', divisionId: 'div-test' }),
      makeMatch({ id: 'm4', rivalTeamName: 'Obras Sanitarias', divisionId: 'div-2' }),
    ];
    assert.strictEqual(countLinkedMatches(team, [team, other], matches), 2);
    assert.strictEqual(countLinkedMatches(other, [team, other], matches), 1);
  });
});
