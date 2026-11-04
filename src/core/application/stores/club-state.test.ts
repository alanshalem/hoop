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
import { makeChartCode, makeMatch, makeRivalTeam } from '@/core/testing/fixtures';

const NOW = new Date('2026-10-30T18:00:00.000Z');

describe('club store state', () => {
  it('starts from the seed with the live match and Primera selected', () => {
    const state = createInitialClubState(NOW);
    assert.strictEqual(state.activeMatchId, 'match-live-today');
    assert.strictEqual(state.activeDivisionId, 'div-primera');
    assert.strictEqual(state.currentUser.role, 'HEAD_COACH');
    assert.ok(state.users.length >= 5);
  });

  it('reseeds when the persisted version is older (S5.14)', () => {
    const legacy = { matches: [{ id: 'broken' }] };
    const migrated = migrateClubState(legacy, CLUB_STORE_VERSION - 1, NOW);
    assert.deepStrictEqual(migrated, createInitialClubState(NOW));
  });

  it('reseeds unversioned (version 0) storage', () => {
    const migrated = migrateClubState(undefined, 0, NOW);
    assert.ok(migrated.matches.some((m) => m.id === 'match-live-today'));
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

  it('starts with the seed rival teams (S14)', () => {
    assert.deepStrictEqual(createInitialClubState(NOW).rivalTeams, createSeedState(NOW).rivalTeams);
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

  it('keeps persisted data of the current version', () => {
    const persisted = createInitialClubState(NOW);
    persisted.activeMatchId = 'match-past-1';
    assert.strictEqual(
      migrateClubState(persisted, CLUB_STORE_VERSION, NOW).activeMatchId,
      'match-past-1'
    );
  });
});
