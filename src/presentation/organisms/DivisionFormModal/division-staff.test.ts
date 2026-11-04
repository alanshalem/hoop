import { describe, it } from 'node:test';
import assert from 'node:assert';
import { makeCoach } from '@/core/testing/fixtures';
import { coachNames, COACH_REFUSAL_MESSAGES, toDivisionStaff } from './division-staff';

describe('division staff form (S5)', () => {
  it('leaves the head coach empty and keeps the assistants in order', () => {
    assert.deepStrictEqual(toDivisionStaff('', ['a1', 'a2']), { headCoachId: undefined, assistantCoachIds: ['a1', 'a2'] });
  });

  it('never lists the head coach as an assistant too', () => {
    assert.deepStrictEqual(toDivisionStaff('c1', ['a1', 'c1']), { headCoachId: 'c1', assistantCoachIds: ['a1'] });
  });

  it('names the coaches of a team by id, skipping ids that are not coaches', () => {
    const coaches = [makeCoach({ id: 'c1', name: 'PEREZ, J.' }), makeCoach({ id: 'a1', name: 'ROSSI, L.M.' })];
    assert.deepStrictEqual(coachNames(['a1', 'user-coach-1', 'c1'], coaches), ['ROSSI, L.M.', 'PEREZ, J.']);
    assert.deepStrictEqual(coachNames([], coaches), []);
  });

  it('explains every assignment refusal in Spanish', () => {
    assert.deepStrictEqual(COACH_REFUSAL_MESSAGES, {
      COACH_NOT_FOUND: 'El entrenador elegido ya no existe.',
      TEAM_NOT_FOUND: 'La división no tiene un equipo asociado.',
    });
  });
});
