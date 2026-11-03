import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ChartEntrySchema } from '@/core/domain/entities/chart.types';
import { RivalTeamSchema, type RivalTeam } from '@/core/domain/entities/rival.types';
import { findRivalTeam } from './rival-teams';
import { makeRivalTeam } from '@/core/testing/fixtures';

const player = (id: string, dorsal: number, firstName = 'Juan', lastName = 'Pérez') => ({
  id,
  dorsal,
  firstName,
  lastName,
});

describe('RivalTeamSchema (S14, L18)', () => {
  it('accepts a rival team and trims its name and player names', () => {
    const parsed = RivalTeamSchema.parse({
      id: 'rival-1',
      clubId: 'club-1',
      divisionId: 'div-1',
      name: '  Obras Sanitarias ',
      players: [player('rp-1', 0, ' Juan ', ' Pérez '), player('rp-2', 99)],
    });
    assert.deepStrictEqual(parsed, {
      id: 'rival-1',
      clubId: 'club-1',
      divisionId: 'div-1',
      name: 'Obras Sanitarias',
      players: [player('rp-1', 0), player('rp-2', 99)],
    });
  });

  it('accepts a team without players', () => {
    assert.ok(RivalTeamSchema.safeParse(makeRivalTeam({ players: [] })).success);
  });

  it('rejects a name that is blank or longer than 60 characters', () => {
    for (const name of ['', '   ', 'x'.repeat(61)]) {
      assert.strictEqual(RivalTeamSchema.safeParse(makeRivalTeam({ name })).success, false, JSON.stringify(name));
    }
    assert.ok(RivalTeamSchema.safeParse(makeRivalTeam({ name: 'x'.repeat(60) })).success);
  });

  it('rejects ids, club or division that are empty', () => {
    for (const overrides of [{ id: '' }, { clubId: '' }, { divisionId: '' }]) {
      assert.strictEqual(RivalTeamSchema.safeParse(makeRivalTeam(overrides)).success, false, JSON.stringify(overrides));
    }
  });

  it('rejects dorsals outside 0-99 or not integer', () => {
    for (const dorsal of [-1, 100, 2.5]) {
      const team = makeRivalTeam({ players: [player('rp-1', dorsal)] });
      assert.strictEqual(RivalTeamSchema.safeParse(team).success, false, String(dorsal));
    }
  });

  it('rejects player names that are blank or longer than 40 characters', () => {
    for (const [firstName, lastName] of [
      ['', 'Pérez'],
      ['Juan', '  '],
      ['x'.repeat(41), 'Pérez'],
      ['Juan', 'x'.repeat(41)],
    ]) {
      const team = makeRivalTeam({ players: [player('rp-1', 5, firstName, lastName)] });
      assert.strictEqual(RivalTeamSchema.safeParse(team).success, false, `${firstName} ${lastName}`);
    }
  });

  it('rejects repeated player ids and repeated dorsals within a team', () => {
    const sameId = makeRivalTeam({ players: [player('rp-1', 5), player('rp-1', 6)] });
    const sameDorsal = makeRivalTeam({ players: [player('rp-1', 5), player('rp-2', 5)] });
    assert.strictEqual(RivalTeamSchema.safeParse(sameId).success, false);
    assert.strictEqual(RivalTeamSchema.safeParse(sameDorsal).success, false);
  });
});

describe('ChartEntrySchema rival player (S14)', () => {
  it('accepts an optional non-empty rivalPlayerId', () => {
    assert.ok(ChartEntrySchema.safeParse({ category: 'POINTS_ALLOWED', code: 'CUT', points: 2 }).success);
    assert.deepStrictEqual(
      ChartEntrySchema.parse({ category: 'POINTS_ALLOWED', code: 'CUT', points: 2, rivalPlayerId: 'rp-1' }),
      { category: 'POINTS_ALLOWED', code: 'CUT', points: 2, rivalPlayerId: 'rp-1' }
    );
    assert.strictEqual(
      ChartEntrySchema.safeParse({ category: 'POINTS_ALLOWED', code: 'CUT', rivalPlayerId: '' }).success,
      false
    );
  });
});

describe('findRivalTeam (S14, L18)', () => {
  const obras = makeRivalTeam({ id: 'rival-obras', divisionId: 'div-primera', name: 'Obras Sanitarias' });
  const obrasU19 = makeRivalTeam({ id: 'rival-obras-u19', divisionId: 'div-u19', name: 'Obras Sanitarias' });
  const penarol = makeRivalTeam({ id: 'rival-penarol', divisionId: 'div-primera', name: 'Peñarol' });
  const teams: RivalTeam[] = [obrasU19, obras, penarol];

  it('finds the team of the division by its exact name', () => {
    assert.strictEqual(findRivalTeam(teams, 'div-primera', 'Obras Sanitarias'), obras);
    assert.strictEqual(findRivalTeam(teams, 'div-u19', 'Obras Sanitarias'), obrasU19);
  });

  it('ignores case, accents and surrounding spaces', () => {
    assert.strictEqual(findRivalTeam(teams, 'div-primera', '  OBRAS sanitárias '), obras);
    assert.strictEqual(findRivalTeam(teams, 'div-primera', 'penarol'), penarol);
  });

  it('returns undefined for another division or an unknown name', () => {
    assert.strictEqual(findRivalTeam(teams, 'div-u17', 'Obras Sanitarias'), undefined);
    assert.strictEqual(findRivalTeam(teams, 'div-primera', 'Obras'), undefined);
    assert.strictEqual(findRivalTeam([], 'div-primera', 'Obras Sanitarias'), undefined);
  });
});
