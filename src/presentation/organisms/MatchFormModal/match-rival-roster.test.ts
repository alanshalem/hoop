import { describe, it } from 'node:test';
import assert from 'node:assert';
import { makeRivalTeam } from '@/core/testing/fixtures';
import { RIVAL_PLAYER_REFUSAL_MESSAGES, RIVAL_TEAM_REFUSAL_MESSAGES } from '@/presentation/organisms/RivalTeamFormModal/rival-roster';
import {
  EMPTY_ROSTER_DRAFT,
  applyRosterOperations,
  divisionRivalSuggestions,
  formatMissingRoster,
  planRosterOperations,
  removeDraftPlayer,
  resolveMatchRivalRoster,
  rosterRows,
  saveDraftPlayer,
  type RosterActions,
  type RosterDraft,
  type RosterOperation,
} from './match-rival-roster';

const boca = makeRivalTeam({
  id: 'r-boca',
  divisionId: 'div-1',
  name: 'Boca Juniors',
  players: [
    { id: 'rp-23', dorsal: 23, firstName: 'Marcos', lastName: 'Ruiz' },
    { id: 'rp-4', dorsal: 4, firstName: 'Lucas', lastName: 'Faggiano' },
  ],
});
const obras = makeRivalTeam({ id: 'r-obras', divisionId: 'div-1', name: 'Obras Sanitarias', players: [] });
const bocaU19 = makeRivalTeam({ id: 'r-boca-u19', divisionId: 'div-2', name: 'Boca Juniors' });
const teams = [boca, obras, bocaU19];

/** Applies a sequence of draft saves, failing the test on any refusal. */
function draftWith(
  baseline: typeof boca.players,
  steps: { input: { dorsal: number; firstName: string; lastName: string }; rowKey?: string; newKey?: string }[]
): RosterDraft {
  return steps.reduce<RosterDraft>((draft, step, index) => {
    const result = saveDraftPlayer(baseline, draft, step.input, step.rowKey ?? null, step.newKey ?? `new-${index}`);
    assert.ok(result.ok, `step ${index} refused`);
    return result.draft;
  }, EMPTY_ROSTER_DRAFT);
}

describe('match form rival roster state (S16)', () => {
  it('finds the roster of the selected division ignoring case, accents and spaces', () => {
    assert.deepStrictEqual(resolveMatchRivalRoster(teams, 'div-1', '  bóca juniors '), { kind: 'FOUND', team: boca });
    assert.deepStrictEqual(resolveMatchRivalRoster(teams, 'div-2', 'Boca Juniors'), { kind: 'FOUND', team: bocaU19 });
  });

  it('reports a typed rival without roster in the division, with the trimmed name', () => {
    assert.deepStrictEqual(resolveMatchRivalRoster(teams, 'div-1', ' River Plate '), {
      kind: 'MISSING',
      name: 'River Plate',
    });
    assert.deepStrictEqual(resolveMatchRivalRoster(teams, 'div-3', 'Boca Juniors'), {
      kind: 'MISSING',
      name: 'Boca Juniors',
    });
    assert.strictEqual(
      formatMissingRoster('River Plate', 'Primera División'),
      'River Plate no tiene plantel en Primera División.'
    );
  });

  it('shows no section for an empty name or without division', () => {
    assert.deepStrictEqual(resolveMatchRivalRoster(teams, 'div-1', ''), { kind: 'NONE' });
    assert.deepStrictEqual(resolveMatchRivalRoster(teams, 'div-1', '   '), { kind: 'NONE' });
    assert.deepStrictEqual(resolveMatchRivalRoster(teams, '', 'Boca Juniors'), { kind: 'NONE' });
  });

  it('suggests the rival teams of the selected division sorted by name', () => {
    const river = makeRivalTeam({ id: 'r-river', divisionId: 'div-1', name: 'Atenas' });
    assert.deepStrictEqual(
      divisionRivalSuggestions([...teams, river], 'div-1').map((team) => team.name),
      ['Atenas', 'Boca Juniors', 'Obras Sanitarias']
    );
    assert.deepStrictEqual(divisionRivalSuggestions(teams, 'div-9'), []);
    assert.deepStrictEqual(divisionRivalSuggestions(teams, ''), []);
  });
});

describe('match form rival roster draft (S16)', () => {
  it('lists the roster by dorsal when there is no draft', () => {
    assert.deepStrictEqual(rosterRows(boca.players, EMPTY_ROSTER_DRAFT), [
      { key: 'rp-4', dorsal: 4, firstName: 'Lucas', lastName: 'Faggiano', isNew: false },
      { key: 'rp-23', dorsal: 23, firstName: 'Marcos', lastName: 'Ruiz', isNew: false },
    ]);
  });

  it('adds, edits and removes players in the draft without touching the roster', () => {
    const draft = draftWith(boca.players, [
      { input: { dorsal: 7, firstName: ' Juan ', lastName: ' Pérez ' }, newKey: 'd-1' },
      { input: { dorsal: 10, firstName: 'Lucas', lastName: 'Faggiano' }, rowKey: 'rp-4' },
    ]);
    const removed = removeDraftPlayer(boca.players, draft, 'rp-23');
    assert.deepStrictEqual(rosterRows(boca.players, removed), [
      { key: 'd-1', dorsal: 7, firstName: 'Juan', lastName: 'Pérez', isNew: true },
      { key: 'rp-4', dorsal: 10, firstName: 'Lucas', lastName: 'Faggiano', isNew: false },
    ]);
    assert.deepStrictEqual(
      boca.players.map((player) => player.dorsal),
      [23, 4]
    );
  });

  it('edits and removes a player added in the draft', () => {
    const draft = draftWith([], [
      { input: { dorsal: 7, firstName: 'Juan', lastName: 'Pérez' }, newKey: 'd-1' },
      { input: { dorsal: 8, firstName: 'Ana', lastName: 'Gómez' }, newKey: 'd-2' },
      { input: { dorsal: 9, firstName: 'Juan', lastName: 'Pérez' }, rowKey: 'd-1' },
    ]);
    assert.deepStrictEqual(
      rosterRows([], draft).map((row) => [row.key, row.dorsal]),
      [
        ['d-2', 8],
        ['d-1', 9],
      ]
    );
    assert.deepStrictEqual(rosterRows([], removeDraftPlayer([], draft, 'd-2')).map((row) => row.key), ['d-1']);
  });

  it('refuses a duplicate dorsal against the roster and the draft, leaving the draft unchanged', () => {
    const draft = draftWith(boca.players, [{ input: { dorsal: 7, firstName: 'Juan', lastName: 'Pérez' }, newKey: 'd-1' }]);
    for (const [input, rowKey] of [
      [{ dorsal: 23, firstName: 'Ana', lastName: 'Gómez' }, null],
      [{ dorsal: 7, firstName: 'Ana', lastName: 'Gómez' }, null],
      [{ dorsal: 7, firstName: 'Lucas', lastName: 'Faggiano' }, 'rp-4'],
    ] as const) {
      const result = saveDraftPlayer(boca.players, draft, input, rowKey, 'd-2');
      assert.deepStrictEqual(result, { ok: false, reason: 'DUPLICATE_DORSAL' });
    }
    assert.strictEqual(RIVAL_PLAYER_REFUSAL_MESSAGES.DUPLICATE_DORSAL, 'Ya hay un jugador con ese dorsal en este equipo.');
    assert.strictEqual(rosterRows(boca.players, draft).length, 3);
  });

  it('frees the dorsal of a removed player and lets a player keep its own dorsal', () => {
    const removed = removeDraftPlayer(boca.players, EMPTY_ROSTER_DRAFT, 'rp-23');
    assert.ok(saveDraftPlayer(boca.players, removed, { dorsal: 23, firstName: 'Ana', lastName: 'Gómez' }, null, 'd-1').ok);
    assert.ok(
      saveDraftPlayer(boca.players, EMPTY_ROSTER_DRAFT, { dorsal: 4, firstName: 'Luca', lastName: 'Faggiano' }, 'rp-4', 'x')
        .ok
    );
  });

  it('refuses invalid dorsals and names with the use-case reasons', () => {
    assert.deepStrictEqual(
      saveDraftPlayer([], EMPTY_ROSTER_DRAFT, { dorsal: 100, firstName: 'A', lastName: 'B' }, null, 'd-1'),
      { ok: false, reason: 'INVALID_DORSAL' }
    );
    assert.deepStrictEqual(
      saveDraftPlayer([], EMPTY_ROSTER_DRAFT, { dorsal: 1, firstName: ' ', lastName: 'B' }, null, 'd-1'),
      { ok: false, reason: 'INVALID_PLAYER_NAME' }
    );
  });
});

describe('match form rival roster save plan (S16)', () => {
  const found = { kind: 'FOUND', team: boca } as const;

  it('plans nothing without draft changes (no rival writes)', () => {
    assert.deepStrictEqual(planRosterOperations(found, 'div-1', EMPTY_ROSTER_DRAFT), []);
    assert.deepStrictEqual(planRosterOperations({ kind: 'MISSING', name: 'River' }, 'div-1', EMPTY_ROSTER_DRAFT), []);
    assert.deepStrictEqual(planRosterOperations({ kind: 'NONE' }, 'div-1', EMPTY_ROSTER_DRAFT), []);
  });

  it('plans nothing when an edit restores the original values', () => {
    const draft = draftWith(boca.players, [
      { input: { dorsal: 10, firstName: 'Lucas', lastName: 'Faggiano' }, rowKey: 'rp-4' },
      { input: { dorsal: 4, firstName: 'Lucas', lastName: 'Faggiano' }, rowKey: 'rp-4' },
    ]);
    assert.deepStrictEqual(planRosterOperations(found, 'div-1', draft), []);
  });

  it('orders an existing roster as removes, updates (roster order) and adds (draft order)', () => {
    // The removed #23 frees its dorsal for #4 in the same draft.
    let draft = removeDraftPlayer(boca.players, EMPTY_ROSTER_DRAFT, 'rp-23');
    for (const [input, rowKey, newKey] of [
      [{ dorsal: 31, firstName: 'Ana', lastName: 'Gómez' }, null, 'd-1'],
      [{ dorsal: 23, firstName: 'Lucas', lastName: 'Faggiano' }, 'rp-4', 'x'],
      [{ dorsal: 30, firstName: 'Eva', lastName: 'Sosa' }, null, 'd-2'],
    ] as const) {
      const result = saveDraftPlayer(boca.players, draft, input, rowKey, newKey);
      assert.ok(result.ok);
      draft = result.draft;
    }
    const expected: RosterOperation[] = [
      { type: 'REMOVE_PLAYER', playerId: 'rp-23' },
      { type: 'UPDATE_PLAYER', playerId: 'rp-4', player: { dorsal: 23, firstName: 'Lucas', lastName: 'Faggiano' } },
      { type: 'ADD_PLAYER', player: { dorsal: 31, firstName: 'Ana', lastName: 'Gómez' } },
      { type: 'ADD_PLAYER', player: { dorsal: 30, firstName: 'Eva', lastName: 'Sosa' } },
    ];
    assert.deepStrictEqual(planRosterOperations(found, 'div-1', draft), expected);
  });

  it('creates the rival team with the typed name and division before adding players', () => {
    const draft = draftWith([], [
      { input: { dorsal: 5, firstName: 'Juan', lastName: 'Pérez' }, newKey: 'd-1' },
      { input: { dorsal: 2, firstName: 'Ana', lastName: 'Gómez' }, newKey: 'd-2' },
    ]);
    assert.deepStrictEqual(planRosterOperations({ kind: 'MISSING', name: 'River Plate' }, 'div-1', draft), [
      { type: 'CREATE_TEAM', divisionId: 'div-1', name: 'River Plate' },
      { type: 'ADD_PLAYER', player: { dorsal: 5, firstName: 'Juan', lastName: 'Pérez' } },
      { type: 'ADD_PLAYER', player: { dorsal: 2, firstName: 'Ana', lastName: 'Gómez' } },
    ]);
  });

  it('keeps added players and drops edits of another roster when the rival changes', () => {
    const draft = draftWith(boca.players, [
      { input: { dorsal: 7, firstName: 'Juan', lastName: 'Pérez' }, newKey: 'd-1' },
      { input: { dorsal: 10, firstName: 'Lucas', lastName: 'Faggiano' }, rowKey: 'rp-4' },
    ]);
    assert.deepStrictEqual(planRosterOperations({ kind: 'FOUND', team: obras }, 'div-1', draft), [
      { type: 'ADD_PLAYER', player: { dorsal: 7, firstName: 'Juan', lastName: 'Pérez' } },
    ]);
    assert.deepStrictEqual(rosterRows(obras.players, draft).map((row) => row.key), ['d-1']);
  });
});

describe('match form rival roster apply (S16)', () => {
  /** Records every store call; refuses what `refuse` says. */
  function fakeActions(refuse: Partial<Record<keyof RosterActions, string>> = {}) {
    const calls: unknown[][] = [];
    const actions: RosterActions = {
      createRivalTeam: (input) => {
        calls.push(['createRivalTeam', input]);
        return refuse.createRivalTeam ? { ok: false, reason: 'INVALID_NAME' } : { ok: true, id: 'r-new' };
      },
      addRivalPlayer: (teamId, input) => {
        calls.push(['addRivalPlayer', teamId, input]);
        return refuse.addRivalPlayer === String(input.dorsal)
          ? { ok: false, reason: 'DUPLICATE_DORSAL' }
          : { ok: true, playerId: `rp-${input.dorsal}` };
      },
      updateRivalPlayer: (teamId, playerId, updates) => {
        calls.push(['updateRivalPlayer', teamId, playerId, updates]);
        return refuse.updateRivalPlayer ? { ok: false, reason: 'PLAYER_NOT_FOUND' } : { ok: true };
      },
      removeRivalPlayer: (teamId, playerId) => {
        calls.push(['removeRivalPlayer', teamId, playerId]);
        return { ok: true };
      },
    };
    return { actions, calls };
  }

  it('creates the team and adds the players to its new id', () => {
    const { actions, calls } = fakeActions();
    const refusals = applyRosterOperations(
      [
        { type: 'CREATE_TEAM', divisionId: 'div-1', name: 'River Plate' },
        { type: 'ADD_PLAYER', player: { dorsal: 5, firstName: 'Juan', lastName: 'Pérez' } },
      ],
      null,
      actions
    );
    assert.deepStrictEqual(refusals, []);
    assert.deepStrictEqual(calls, [
      ['createRivalTeam', { divisionId: 'div-1', name: 'River Plate' }],
      ['addRivalPlayer', 'r-new', { dorsal: 5, firstName: 'Juan', lastName: 'Pérez' }],
    ]);
  });

  it('applies removes, updates and adds to the existing team in plan order', () => {
    const { actions, calls } = fakeActions();
    const player = { dorsal: 9, firstName: 'Ana', lastName: 'Gómez' };
    applyRosterOperations(
      [
        { type: 'REMOVE_PLAYER', playerId: 'rp-23' },
        { type: 'UPDATE_PLAYER', playerId: 'rp-4', player },
        { type: 'ADD_PLAYER', player },
      ],
      'r-boca',
      actions
    );
    assert.deepStrictEqual(calls, [
      ['removeRivalPlayer', 'r-boca', 'rp-23'],
      ['updateRivalPlayer', 'r-boca', 'rp-4', player],
      ['addRivalPlayer', 'r-boca', player],
    ]);
  });

  it('reports refused player actions and keeps applying the rest', () => {
    const { actions, calls } = fakeActions({ addRivalPlayer: '5', updateRivalPlayer: 'yes' });
    const refusals = applyRosterOperations(
      [
        { type: 'UPDATE_PLAYER', playerId: 'rp-4', player: { dorsal: 4, firstName: 'Lucas', lastName: 'Faggiano' } },
        { type: 'ADD_PLAYER', player: { dorsal: 5, firstName: 'Juan', lastName: 'Pérez' } },
        { type: 'ADD_PLAYER', player: { dorsal: 6, firstName: 'Ana', lastName: 'Gómez' } },
      ],
      'r-boca',
      actions
    );
    assert.deepStrictEqual(refusals, [
      `#4 Lucas Faggiano: ${RIVAL_PLAYER_REFUSAL_MESSAGES.PLAYER_NOT_FOUND}`,
      `#5 Juan Pérez: ${RIVAL_PLAYER_REFUSAL_MESSAGES.DUPLICATE_DORSAL}`,
    ]);
    assert.strictEqual(calls.length, 3);
  });

  it('stops when the team cannot be created', () => {
    const { actions, calls } = fakeActions({ createRivalTeam: 'yes' });
    const refusals = applyRosterOperations(
      [
        { type: 'CREATE_TEAM', divisionId: 'div-1', name: 'x'.repeat(61) },
        { type: 'ADD_PLAYER', player: { dorsal: 5, firstName: 'Juan', lastName: 'Pérez' } },
      ],
      null,
      actions
    );
    assert.deepStrictEqual(refusals, [RIVAL_TEAM_REFUSAL_MESSAGES.INVALID_NAME]);
    assert.strictEqual(calls.length, 1);
  });

  it('writes nothing for an empty plan', () => {
    const { actions, calls } = fakeActions();
    assert.deepStrictEqual(applyRosterOperations([], 'r-boca', actions), []);
    assert.deepStrictEqual(calls, []);
  });
});
