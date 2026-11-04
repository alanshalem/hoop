import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  CLUB_STORE_VERSION,
  createInitialClubState,
  mergePersistedClubState,
  migrateClubState,
  selectChartCatalog,
  selectRivalRoster,
  type ClubDataState,
} from './club-state';
import { CHART_CATALOG } from '@/core/domain/entities/chart.types';
import { createSeedState } from '@/core/infrastructure/mocks/seed-data';
import { makeChartCode, makeClubData, makeCoach, makeMatch, makeRivalTeam } from '@/core/testing/fixtures';

const EMPTY_COLLECTIONS = { users: [], ...makeClubData() };

const NOW = new Date('2026-10-30T18:00:00.000Z');

describe('club store state', () => {
  it('starts without club data or selection: the data comes from the server (S1, L5)', () => {
    const state = createInitialClubState(NOW);
    const { currentUser, activeDivisionId, activeMatchId, ...collections } = state;
    assert.deepStrictEqual(collections, EMPTY_COLLECTIONS);
    assert.strictEqual(activeDivisionId, '');
    assert.strictEqual(activeMatchId, '');
    assert.strictEqual(currentUser.role, 'ASSISTANT_STATISTICIAN', 'the placeholder user has the fewest permissions');
    assert.strictEqual(currentUser.createdAt, NOW.toISOString());
  });

  it('drops storage of an older version, demo seed included, instead of keeping it (S1, L5)', () => {
    assert.strictEqual(CLUB_STORE_VERSION, 4);
    const legacy = { matches: [{ id: 'broken' }] };
    assert.deepStrictEqual(migrateClubState(legacy, CLUB_STORE_VERSION - 1, NOW), createInitialClubState(NOW));
    const seeded = { ...createSeedState(NOW), activeDivisionId: 'div-primera', activeMatchId: 'match-live-today' };
    const migrated = migrateClubState(seeded, 3, NOW);
    assert.deepStrictEqual(migrated, createInitialClubState(NOW));
    assert.deepStrictEqual(migrated.players, []);
  });

  it('drops unversioned (version 0) storage', () => {
    const migrated = migrateClubState(undefined, 0, NOW);
    assert.deepStrictEqual(migrated.matches, []);
  });

  it('starts without chart code records (built-in catalog)', () => {
    assert.deepStrictEqual(createInitialClubState(NOW).chartCodes, []);
  });

  it('rehydrates data persisted before chart codes existed with its data and no chart codes (S9, L9)', () => {
    const older: Partial<ClubDataState> = { ...createInitialClubState(NOW), activeMatchId: 'match-past-1' };
    delete older.chartCodes;
    const current = { ...createInitialClubState(NOW), chartCodes: [makeChartCode()] };
    const rehydrated = mergePersistedClubState(older, current);
    assert.deepStrictEqual(rehydrated, { ...older, chartCodes: [] });
  });

  it('rehydrates persisted chart codes and keeps the current state without storage', () => {
    const chartCodes = [makeChartCode({ archived: true })];
    const persisted = { ...createInitialClubState(NOW), chartCodes };
    assert.deepStrictEqual(mergePersistedClubState(persisted, createInitialClubState(NOW)).chartCodes, chartCodes);
    const current = createInitialClubState(NOW);
    assert.strictEqual(mergePersistedClubState(undefined, current), current);
  });

  it('selects the resolved chart catalog, stable while the records keep their reference', () => {
    assert.deepStrictEqual(selectChartCatalog({ chartCodes: [] }), CHART_CATALOG);
    const chartCodes = [makeChartCode({ symbol: 'PE', label: 'Pase errado' })];
    const catalog = selectChartCatalog({ chartCodes });
    assert.strictEqual(catalog.TURNOVER[0].label, 'Pase errado');
    assert.strictEqual(selectChartCatalog({ chartCodes }), catalog);
    assert.notStrictEqual(selectChartCatalog({ chartCodes: [...chartCodes] }), catalog);
  });

  it('rehydrates data persisted before rival teams existed with its data and no rival teams (S14, L18)', () => {
    const older: Partial<ClubDataState> = { ...createInitialClubState(NOW), activeMatchId: 'match-past-1' };
    delete older.rivalTeams;
    const current = { ...createInitialClubState(NOW), rivalTeams: [makeRivalTeam()] };
    const rehydrated = mergePersistedClubState(older, current);
    assert.deepStrictEqual(rehydrated, { ...older, rivalTeams: [] });
  });

  it('rehydrates persisted rival teams', () => {
    const rivalTeams = [makeRivalTeam({ name: 'Quimsa' })];
    const persisted = { ...createInitialClubState(NOW), rivalTeams };
    assert.deepStrictEqual(mergePersistedClubState(persisted, createInitialClubState(NOW)).rivalTeams, rivalTeams);
  });

  it('selects the rival roster of a match by division and rival name, empty when none (S14)', () => {
    const team = makeRivalTeam({ divisionId: 'div-test', name: 'Obras Sanitarias' });
    const other = makeRivalTeam({ id: 'rival-other', divisionId: 'div-other', name: 'Obras Sanitarias', players: [] });
    const state = { rivalTeams: [other, team] };
    assert.strictEqual(selectRivalRoster(state, makeMatch({ rivalTeamName: 'obras sanitarias' })), team.players);
    const none = selectRivalRoster(state, makeMatch({ rivalTeamName: 'Boca Juniors' }));
    assert.deepStrictEqual(none, []);
    assert.strictEqual(selectRivalRoster({ rivalTeams: [] }, makeMatch()), none, 'the empty roster is one stable value');
  });

  it('starts without coaches (S5)', () => {
    assert.deepStrictEqual(createInitialClubState(NOW).coaches, []);
  });

  it('rehydrates data persisted before coaches existed with its data and no coaches (S5)', () => {
    const older: Partial<ClubDataState> = { ...createInitialClubState(NOW), activeMatchId: 'match-past-1' };
    delete older.coaches;
    const current = { ...createInitialClubState(NOW), coaches: [makeCoach()] };
    const rehydrated = mergePersistedClubState(older, current);
    assert.deepStrictEqual(rehydrated, { ...older, coaches: [] });
  });

  it('rehydrates persisted coaches', () => {
    const coaches = [makeCoach({ name: 'ROSSI, L.M.', role: 'ASSISTANT' })];
    const persisted = { ...createInitialClubState(NOW), coaches };
    assert.deepStrictEqual(mergePersistedClubState(persisted, createInitialClubState(NOW)).coaches, coaches);
  });

  it('keeps persisted data of the current version', () => {
    const persisted = createInitialClubState(NOW);
    persisted.activeMatchId = 'match-past-1';
    assert.strictEqual(
      migrateClubState(persisted, CLUB_STORE_VERSION, NOW).activeMatchId,
      'match-past-1'
    );
  });
});
