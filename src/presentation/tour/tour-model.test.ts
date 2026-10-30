import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  filterStepsByRole,
  nextStepIndex,
  previousStepIndex,
  resolveTourSteps,
  rolesWith,
  tourProgress,
  type TourDefinition,
  type TourStep,
} from './tour-model';

const step = (target: string | null, overrides: Partial<TourStep> = {}): TourStep => ({
  target,
  title: `Paso ${target ?? 'centrado'}`,
  body: 'Texto del paso.',
  ...overrides,
});

const TOUR: TourDefinition = {
  id: 'divisions',
  title: 'Divisiones',
  steps: [
    step(null),
    step('divisions-create', { roles: ['ADMIN'] }),
    step('division-card'),
    step('division-roster', { roles: ['ADMIN', 'HEAD_COACH'] }),
    step(null, { title: 'Fin' }),
  ],
};

describe('rolesWith', () => {
  it('lists the roles that hold a permission, using can() from the domain', () => {
    assert.deepStrictEqual(rolesWith('MANAGE_DIVISIONS'), ['ADMIN']);
    assert.deepStrictEqual(rolesWith('MANAGE_PLAYERS'), ['ADMIN', 'HEAD_COACH']);
    assert.deepStrictEqual(rolesWith('RECORD_LIVE'), ['ADMIN', 'HEAD_COACH', 'ASSISTANT_STATISTICIAN']);
  });
});

describe('filterStepsByRole', () => {
  it('keeps steps without roles and the ones that list the role', () => {
    const targets = (role: Parameters<typeof filterStepsByRole>[1]) =>
      filterStepsByRole(TOUR.steps, role).map((s) => s.target);
    assert.deepStrictEqual(targets('ADMIN'), [null, 'divisions-create', 'division-card', 'division-roster', null]);
    assert.deepStrictEqual(targets('HEAD_COACH'), [null, 'division-card', 'division-roster', null]);
    assert.deepStrictEqual(targets('ASSISTANT_STATISTICIAN'), [null, 'division-card', null]);
  });
});

describe('resolveTourSteps', () => {
  it('skips steps whose target is missing and always keeps centered cards', () => {
    const present = new Set(['divisions-create', 'division-roster']);
    const steps = resolveTourSteps(TOUR, { role: 'ADMIN', isTargetPresent: (id) => present.has(id) });
    assert.deepStrictEqual(
      steps.map((s) => s.target),
      [null, 'divisions-create', 'division-roster', null]
    );
  });

  it('applies the role filter before the presence check', () => {
    const asked: string[] = [];
    const steps = resolveTourSteps(TOUR, {
      role: 'ASSISTANT_STATISTICIAN',
      isTargetPresent: (id) => {
        asked.push(id);
        return true;
      },
    });
    assert.deepStrictEqual(asked, ['division-card']);
    assert.strictEqual(steps.length, 3);
  });

  it('returns an empty list when every step is filtered out', () => {
    const onlyTargets: TourDefinition = { id: 'x', title: 'X', steps: [step('a'), step('b')] };
    assert.deepStrictEqual(resolveTourSteps(onlyTargets, { role: 'ADMIN', isTargetPresent: () => false }), []);
  });
});

describe('step navigation', () => {
  it('moves forward until the last step, then reports the end', () => {
    assert.strictEqual(nextStepIndex(0, 3), 1);
    assert.strictEqual(nextStepIndex(1, 3), 2);
    assert.strictEqual(nextStepIndex(2, 3), null);
  });

  it('moves back but never before the first step', () => {
    assert.strictEqual(previousStepIndex(2), 1);
    assert.strictEqual(previousStepIndex(1), 0);
    assert.strictEqual(previousStepIndex(0), null);
  });

  it('reports a 1-based progress with first/last flags', () => {
    assert.deepStrictEqual(tourProgress(0, 4), { current: 1, total: 4, isFirst: true, isLast: false });
    assert.deepStrictEqual(tourProgress(2, 4), { current: 3, total: 4, isFirst: false, isLast: false });
    assert.deepStrictEqual(tourProgress(3, 4), { current: 4, total: 4, isFirst: false, isLast: true });
    assert.deepStrictEqual(tourProgress(0, 1), { current: 1, total: 1, isFirst: true, isLast: true });
  });
});
