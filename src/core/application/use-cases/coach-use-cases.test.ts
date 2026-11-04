import { describe, it } from 'node:test';
import assert from 'node:assert';
import { COACH_ROLE_LABELS, CoachSchema, type Coach } from '@/core/domain/entities/coach.types';
import { makeCoach, makeTeam } from '@/core/testing/fixtures';
import { createCoach, deleteCoach, updateCoach } from './coach-use-cases';

const head = makeCoach({ id: 'coach-head', name: 'PEREZ, J.', license: '123', role: 'HEAD' });
const assistant = makeCoach({ id: 'coach-assistant', name: 'ROSSI, L.M.', license: '456', role: 'ASSISTANT' });

describe('CoachSchema (S5)', () => {
  it('trims the name (2 to 60 characters) and the optional license (1 to 20)', () => {
    const parsed = CoachSchema.parse({ id: 'c1', clubId: 'club', name: '  PEREZ, J. ', license: ' 123 ', role: 'HEAD' });
    assert.deepStrictEqual(parsed, { id: 'c1', clubId: 'club', name: 'PEREZ, J.', license: '123', role: 'HEAD' });
    assert.strictEqual(CoachSchema.parse({ id: 'c1', clubId: 'club', name: 'Ab', role: 'ASSISTANT' }).license, undefined);
  });

  it('refuses a short or long name, an empty or long license and an unknown role', () => {
    const base = { id: 'c1', clubId: 'club', name: 'PEREZ', role: 'HEAD' };
    assert.strictEqual(CoachSchema.safeParse({ ...base, name: ' A ' }).success, false);
    assert.strictEqual(CoachSchema.safeParse({ ...base, name: 'x'.repeat(61) }).success, false);
    assert.strictEqual(CoachSchema.safeParse({ ...base, license: '  ' }).success, false);
    assert.strictEqual(CoachSchema.safeParse({ ...base, license: 'x'.repeat(21) }).success, false);
    assert.strictEqual(CoachSchema.safeParse({ ...base, role: 'COACH' }).success, false);
  });

  it('labels the roles in Spanish', () => {
    assert.deepStrictEqual(COACH_ROLE_LABELS, { HEAD: 'Entrenador principal', ASSISTANT: 'Ayudante' });
  });
});

describe('createCoach (S5)', () => {
  it('adds a trimmed coach with the given id and club, keeping the others', () => {
    const result = createCoach([head], { name: ' ROSSI, L.M. ', license: ' 456 ', role: 'ASSISTANT' }, {
      id: 'coach-new',
      clubId: 'club-test',
    });
    assert.ok(result.ok);
    assert.strictEqual(result.id, 'coach-new');
    assert.strictEqual(result.coaches[0], head);
    assert.deepStrictEqual(result.coaches[1], {
      id: 'coach-new',
      clubId: 'club-test',
      name: 'ROSSI, L.M.',
      license: '456',
      role: 'ASSISTANT',
    });
  });

  it('stores no license when it is left empty', () => {
    const result = createCoach([], { name: 'PEREZ', license: '   ', role: 'HEAD' }, { id: 'c', clubId: 'club' });
    assert.ok(result.ok);
    assert.ok(!('license' in result.coaches[0]));
  });

  it('refuses an invalid name or license and changes nothing', () => {
    const coaches: Coach[] = [head];
    assert.deepStrictEqual(createCoach(coaches, { name: 'A', role: 'HEAD' }, { id: 'c', clubId: 'club' }), {
      ok: false,
      reason: 'INVALID_NAME',
    });
    assert.deepStrictEqual(
      createCoach(coaches, { name: 'PEREZ', license: 'x'.repeat(21), role: 'HEAD' }, { id: 'c', clubId: 'club' }),
      { ok: false, reason: 'INVALID_LICENSE' }
    );
    assert.deepStrictEqual(coaches, [head]);
  });
});

describe('updateCoach (S5)', () => {
  it('edits name, license and role of one coach and keeps the others by reference', () => {
    const result = updateCoach([head, assistant], assistant.id, { name: ' ROSSI, L. ', license: '094', role: 'HEAD' });
    assert.ok(result.ok);
    assert.strictEqual(result.coaches[0], head);
    assert.deepStrictEqual(result.coaches[1], { ...assistant, name: 'ROSSI, L.', license: '094', role: 'HEAD' });
  });

  it('clears the license when it is emptied', () => {
    const result = updateCoach([head], head.id, { license: '' });
    assert.ok(result.ok);
    assert.ok(!('license' in result.coaches[0]));
    assert.strictEqual(result.coaches[0].name, head.name);
  });

  it('refuses an unknown coach, an invalid name or license', () => {
    assert.deepStrictEqual(updateCoach([head], 'nope', { name: 'PEREZ' }), { ok: false, reason: 'COACH_NOT_FOUND' });
    assert.deepStrictEqual(updateCoach([head], head.id, { name: ' ' }), { ok: false, reason: 'INVALID_NAME' });
    assert.deepStrictEqual(updateCoach([head], head.id, { license: 'x'.repeat(21) }), {
      ok: false,
      reason: 'INVALID_LICENSE',
    });
  });
});

describe('deleteCoach (S5)', () => {
  it('removes the coach and unassigns it from every team, leaving other teams untouched', () => {
    const coached = makeTeam({ id: 't1', headCoachId: head.id, assistantCoachIds: [assistant.id, head.id] });
    const assisted = makeTeam({ id: 't2', headCoachId: assistant.id, assistantCoachIds: [head.id] });
    const other = makeTeam({ id: 't3', headCoachId: assistant.id, assistantCoachIds: [] });
    const result = deleteCoach({ coaches: [head, assistant], teams: [coached, assisted, other] }, head.id);
    assert.ok(result.ok);
    assert.deepStrictEqual(result.coaches, [assistant]);
    assert.strictEqual(result.teams[0].headCoachId, undefined);
    assert.deepStrictEqual(result.teams[0].assistantCoachIds, [assistant.id]);
    assert.deepStrictEqual(result.teams[1], { ...assisted, assistantCoachIds: [] });
    assert.strictEqual(result.teams[2], other);
  });

  it('refuses an unknown coach', () => {
    assert.deepStrictEqual(deleteCoach({ coaches: [head], teams: [] }, 'nope'), {
      ok: false,
      reason: 'COACH_NOT_FOUND',
    });
  });
});
