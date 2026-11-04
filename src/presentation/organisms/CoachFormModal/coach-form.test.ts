import { describe, it } from 'node:test';
import assert from 'node:assert';
import { makeCoach, makeDivision, makeTeam } from '@/core/testing/fixtures';
import {
  COACH_RECORD_REFUSAL_MESSAGES,
  CoachFormSchema,
  coachAssignments,
  coachRefusalField,
  deleteCoachMessage,
  formatCoachAssignments,
  sortCoaches,
  toCoachFormData,
  toCoachInput,
} from './coach-form';

const issues = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  result.success ? [] : (result.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]);

describe('coach form (S5)', () => {
  it('trims name and license and keeps the role', () => {
    assert.deepStrictEqual(CoachFormSchema.parse({ name: '  Pérez, A. ', license: ' 101 ', role: 'ASSISTANT' }), {
      name: 'Pérez, A.',
      license: '101',
      role: 'ASSISTANT',
    });
  });

  it('accepts names of 2 and 60 characters and an empty license', () => {
    assert.ok(CoachFormSchema.safeParse({ name: 'Al', license: '', role: 'HEAD' }).success);
    assert.ok(CoachFormSchema.safeParse({ name: 'x'.repeat(60), license: '   ', role: 'HEAD' }).success);
  });

  it('refuses names shorter than 2 or longer than 60 characters', () => {
    for (const name of ['A', '   ', 'x'.repeat(61)]) {
      assert.deepStrictEqual(issues(CoachFormSchema.safeParse({ name, license: '', role: 'HEAD' })), [
        ['name', COACH_RECORD_REFUSAL_MESSAGES.INVALID_NAME],
      ]);
    }
    assert.strictEqual(COACH_RECORD_REFUSAL_MESSAGES.INVALID_NAME, 'El nombre debe tener de 2 a 60 caracteres.');
  });

  it('accepts a license of 20 characters and refuses 21', () => {
    assert.ok(CoachFormSchema.safeParse({ name: 'Pérez', license: 'x'.repeat(20), role: 'HEAD' }).success);
    assert.deepStrictEqual(
      issues(CoachFormSchema.safeParse({ name: 'Pérez', license: 'x'.repeat(21), role: 'HEAD' })),
      [['license', COACH_RECORD_REFUSAL_MESSAGES.INVALID_LICENSE]]
    );
    assert.strictEqual(COACH_RECORD_REFUSAL_MESSAGES.INVALID_LICENSE, 'La licencia puede tener hasta 20 caracteres.');
  });

  it('refuses an unknown role', () => {
    assert.deepStrictEqual(issues(CoachFormSchema.safeParse({ name: 'Pérez', license: '', role: 'BOSS' })), [
      ['role', 'Elige el rol del entrenador.'],
    ]);
  });

  it('loads a coach into the form and starts a new one empty as head coach', () => {
    assert.deepStrictEqual(toCoachFormData(makeCoach({ name: 'Pérez, A.', license: '101', role: 'ASSISTANT' })), {
      name: 'Pérez, A.',
      license: '101',
      role: 'ASSISTANT',
    });
    assert.deepStrictEqual(toCoachFormData(makeCoach({ license: undefined })).license, '');
    assert.deepStrictEqual(toCoachFormData(null), { name: '', license: '', role: 'HEAD' });
  });

  it('sends the license as typed so a blank one clears it', () => {
    assert.deepStrictEqual(toCoachInput({ name: 'Pérez', license: '', role: 'HEAD' }), {
      name: 'Pérez',
      license: '',
      role: 'HEAD',
    });
  });

  it('points refusals at their field and closes the form for a missing coach', () => {
    assert.strictEqual(coachRefusalField('INVALID_NAME'), 'name');
    assert.strictEqual(coachRefusalField('INVALID_LICENSE'), 'license');
    assert.strictEqual(coachRefusalField('COACH_NOT_FOUND'), null);
    assert.strictEqual(COACH_RECORD_REFUSAL_MESSAGES.COACH_NOT_FOUND, 'El entrenador ya no existe.');
  });
});

describe('coach list (S5)', () => {
  const divisions = [
    makeDivision({ id: 'div-a', name: 'Primera' }),
    makeDivision({ id: 'div-b', name: 'Sub-17' }),
    makeDivision({ id: 'div-c', name: 'Sub-15' }),
  ];
  const teams = [
    makeTeam({ id: 't-a', divisionId: 'div-a', headCoachId: 'c-1', assistantCoachIds: ['c-2'] }),
    makeTeam({ id: 't-b', divisionId: 'div-b', headCoachId: 'c-2', assistantCoachIds: [] }),
    makeTeam({ id: 't-c', divisionId: 'div-c', assistantCoachIds: ['c-2'] }),
    makeTeam({ id: 't-orphan', divisionId: 'div-gone', headCoachId: 'c-2', assistantCoachIds: [] }),
  ];

  it('lists the divisions of a coach as head coach or assistant, by division name', () => {
    assert.deepStrictEqual(coachAssignments('c-2', teams, divisions), [
      { divisionId: 'div-a', divisionName: 'Primera', role: 'ASSISTANT' },
      { divisionId: 'div-c', divisionName: 'Sub-15', role: 'ASSISTANT' },
      { divisionId: 'div-b', divisionName: 'Sub-17', role: 'HEAD' },
    ]);
    assert.deepStrictEqual(coachAssignments('c-none', teams, divisions), []);
  });

  it('describes the assignments in Spanish', () => {
    assert.strictEqual(formatCoachAssignments([]), 'Sin divisiones asignadas');
    assert.strictEqual(
      formatCoachAssignments(coachAssignments('c-2', teams, divisions)),
      'Primera (ayudante) · Sub-15 (ayudante) · Sub-17 (principal)'
    );
  });

  it('sorts head coaches first, then by name, without changing the input', () => {
    const coaches = [
      makeCoach({ id: 'c-3', name: 'Zárate', role: 'ASSISTANT' }),
      makeCoach({ id: 'c-2', name: 'Álvarez', role: 'ASSISTANT' }),
      makeCoach({ id: 'c-1', name: 'Romero', role: 'HEAD' }),
    ];
    assert.deepStrictEqual(
      sortCoaches(coaches).map((coach) => coach.id),
      ['c-1', 'c-2', 'c-3']
    );
    assert.deepStrictEqual(
      coaches.map((coach) => coach.id),
      ['c-3', 'c-2', 'c-1']
    );
  });

  it('explains on delete that the coach is unassigned from its divisions', () => {
    const coach = makeCoach({ name: 'Romero' });
    assert.strictEqual(
      deleteCoachMessage(coach, coachAssignments('c-2', teams, divisions)),
      'Se eliminará la ficha de Romero. Se quitará del cuerpo técnico de Primera, Sub-15 y Sub-17.'
    );
    assert.strictEqual(
      deleteCoachMessage(coach, coachAssignments('c-1', teams, divisions)),
      'Se eliminará la ficha de Romero. Se quitará del cuerpo técnico de Primera.'
    );
    assert.strictEqual(
      deleteCoachMessage(coach, []),
      'Se eliminará la ficha de Romero. No está asignado a ninguna división.'
    );
  });
});
