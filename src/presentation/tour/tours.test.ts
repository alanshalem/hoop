import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { UserRoleSchema } from '@/core/domain/entities/club.types';
import { filterStepsByRole, SCREEN_TOUR_IDS, TOUR_IDS, WELCOME_TOUR_ID } from './tour-model';
import { TOURS, getTour } from './tours';

const SRC = join(process.cwd(), 'src');

const listTsx = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listTsx(path);
    return entry.name.endsWith('.tsx') ? [path] : [];
  });

// Component files, where the data-tour anchors live (the catalog itself is a .ts file).
const componentSources = listTsx(SRC).map((path) => readFileSync(path, 'utf8'));

const EMOJI = /\p{Extended_Pictographic}/u;

describe('tour catalog', () => {
  it('defines one tour per id: the welcome tour and every screen tour', () => {
    assert.deepStrictEqual(
      TOURS.map((tour) => tour.id),
      [...TOUR_IDS]
    );
    assert.deepStrictEqual(TOUR_IDS, [WELCOME_TOUR_ID, ...SCREEN_TOUR_IDS]);
    assert.deepStrictEqual(SCREEN_TOUR_IDS, [
      'dashboard',
      'divisions',
      'players',
      'matches',
      'lineup',
      'live',
      'stats',
      'planilla',
      'help',
    ]);
    for (const id of TOUR_IDS) assert.strictEqual(getTour(id).id, id);
  });

  it('opens the welcome tour with a centered card and closes it explaining how to replay', () => {
    const { steps } = getTour(WELCOME_TOUR_ID);
    assert.strictEqual(steps[0].target, null);
    assert.strictEqual(steps.at(-1)?.target, null);
    assert.match(steps.at(-1)?.body ?? '', /Ver tutorial/);
  });

  it('walks the welcome tour through the navigation, sync status, user menu and help', () => {
    assert.deepStrictEqual(
      getTour(WELCOME_TOUR_ID)
        .steps.map((step) => step.target)
        .filter((target) => target !== null),
      [
        'nav-dashboard',
        'nav-divisions',
        'nav-players',
        'nav-matches',
        'nav-live',
        'nav-planilla',
        'sync-status',
        'user-menu',
        'nav-help',
      ]
    );
  });

  it('teaches the 2-tap recording in the live console with a seed example', () => {
    const live = getTour('live');
    const targets = live.steps.map((step) => step.target);
    for (const target of ['live-lineup', 'live-court', 'live-pad', 'live-rival', 'live-timeout', 'live-timeline', 'live-finish']) {
      assert.ok(targets.includes(target), `live tour misses ${target}`);
    }
    assert.ok(live.steps.some((step) => step.example?.includes('#7 Campagna')));
  });

  it('has Spanish copy without emojis on every step, each screen tour with at least one example', () => {
    for (const tour of TOURS) {
      assert.ok(tour.steps.length >= 2, `${tour.id} needs at least 2 steps`);
      for (const step of tour.steps) {
        for (const text of [step.title, step.body, step.example ?? '']) {
          assert.ok(!EMOJI.test(text), `${tour.id}: emoji in "${text}"`);
        }
        assert.ok(step.title.trim().length > 0 && step.body.trim().length > 0, `${tour.id}: empty copy`);
      }
      if (tour.id !== WELCOME_TOUR_ID) {
        assert.ok(tour.steps.some((step) => step.example), `${tour.id} needs an example`);
      }
    }
  });

  it('anchors every target on a data-tour attribute of some component', () => {
    const targets = new Set(TOURS.flatMap((tour) => tour.steps.map((step) => step.target)).filter((t) => t !== null));
    for (const target of targets) {
      const anchored = componentSources.some(
        (text) => text.includes(`data-tour="${target}"`) || text.includes(`'${target}'`)
      );
      assert.ok(anchored, `no data-tour anchor for "${target}"`);
    }
  });

  it('shows management steps only to the roles allowed by the domain permissions', () => {
    const targetsFor = (tourId: (typeof TOUR_IDS)[number], role: (typeof UserRoleSchema.options)[number]) =>
      filterStepsByRole(getTour(tourId).steps, role).map((step) => step.target);

    assert.ok(targetsFor('divisions', 'ADMIN').includes('divisions-create'));
    assert.ok(!targetsFor('divisions', 'HEAD_COACH').includes('divisions-create'));
    assert.ok(targetsFor('players', 'HEAD_COACH').includes('players-create'));
    assert.ok(!targetsFor('players', 'ASSISTANT_STATISTICIAN').includes('players-create'));
    assert.ok(targetsFor('matches', 'HEAD_COACH').includes('matches-create'));
    assert.ok(!targetsFor('matches', 'ASSISTANT_STATISTICIAN').includes('matches-create'));
    assert.ok(!targetsFor('lineup', 'ASSISTANT_STATISTICIAN').includes('lineup-start'));
    for (const target of ['chart-catalog-create', 'chart-catalog-edit', 'chart-catalog-archive']) {
      assert.ok(targetsFor('planilla', 'ADMIN').includes(target), `ADMIN sees ${target}`);
      assert.ok(targetsFor('planilla', 'HEAD_COACH').includes(target), `HEAD_COACH sees ${target}`);
      assert.ok(!targetsFor('planilla', 'ASSISTANT_STATISTICIAN').includes(target), `no ${target} for the assistant`);
    }
    assert.ok(targetsFor('planilla', 'ASSISTANT_STATISTICIAN').includes('chart-catalog-code'));
    for (const role of UserRoleSchema.options) {
      assert.ok(targetsFor('live', role).includes('live-pad'), `${role} records live`);
    }
  });
});

describe('live tour', () => {
  it('walks the Planilla mode first: mode switch, chart pad and sheet, before the stats console', () => {
    const targets = getTour('live').steps.map((step) => step.target);
    const sheetSteps = ['live-mode', 'live-chart-pad', 'live-chart-sheet'];
    for (const target of sheetSteps) assert.ok(targets.includes(target), target);
    const firstStats = targets.indexOf('live-lineup');
    for (const target of sheetSteps) assert.ok(targets.indexOf(target) < firstStats, `${target} before stats steps`);
  });
});
