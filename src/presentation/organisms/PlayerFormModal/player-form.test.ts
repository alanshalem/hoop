import { describe, it } from 'node:test';
import assert from 'node:assert';
import { makePlayer } from '@/core/testing/fixtures';
import { optionalNumber, PlayerFormSchema, toPlayerFormData, toPlayerInput, type PlayerFormData } from './player-form';

const filled: PlayerFormData = {
  firstName: 'Facundo',
  lastName: 'Campazzo',
  dorsal: 7,
  heightCm: 181,
  weightKg: undefined,
  position: 'PG',
  license: '1234567',
  dominantHand: 'RIGHT',
  status: 'ACTIVE',
  teamId: 'team-own',
  medicalNote: '',
};

describe('player form (S4)', () => {
  it('turns an empty number input into undefined, never NaN', () => {
    assert.strictEqual(optionalNumber(''), undefined);
    assert.strictEqual(optionalNumber(null), undefined);
    assert.strictEqual(optionalNumber('190'), 190);
  });

  it('accepts a player without height, position or license', () => {
    const result = PlayerFormSchema.safeParse({ ...filled, heightCm: undefined, position: '', license: '  ' });
    assert.ok(result.success);
    assert.strictEqual(result.data.heightCm, undefined);
    assert.strictEqual(result.data.license, '');
  });

  it('keeps the height limits and the license length when given', () => {
    const tall = PlayerFormSchema.safeParse({ ...filled, heightCm: 241 });
    assert.strictEqual(tall.success, false);
    assert.strictEqual(tall.error?.issues[0]?.message, 'Máximo 240 cm');
    const license = PlayerFormSchema.safeParse({ ...filled, license: 'x'.repeat(21) });
    assert.strictEqual(license.success, false);
    assert.strictEqual(license.error?.issues[0]?.message, 'Máximo 20 caracteres');
  });

  it('stores empty height, position and license as absent', () => {
    const input = toPlayerInput({ ...filled, heightCm: undefined, position: '', license: '' }, 'club-test');
    assert.strictEqual(input.heightCm, undefined);
    assert.strictEqual(input.position, undefined);
    assert.strictEqual(input.license, undefined);
    assert.strictEqual(input.medicalNote, undefined);
    assert.strictEqual(input.clubId, 'club-test');
  });

  it('stores the given height, position and license', () => {
    const input = toPlayerInput(filled, 'club-test');
    assert.deepStrictEqual(
      [input.heightCm, input.position, input.license, input.teamId],
      [181, 'PG', '1234567', 'team-own']
    );
  });

  it('loads a player without height, position or license as empty fields', () => {
    const player = makePlayer({ heightCm: undefined, position: undefined });
    const data = toPlayerFormData(player, '');
    assert.strictEqual(data.heightCm, undefined);
    assert.strictEqual(data.position, '');
    assert.strictEqual(data.license, '');
    assert.strictEqual(toPlayerFormData(makePlayer({ license: '123' }), '').license, '123');
  });

  it('starts a new player with empty height, position and license on the given team', () => {
    const data = toPlayerFormData(null, 'team-x');
    assert.deepStrictEqual([data.heightCm, data.position, data.license, data.teamId], [undefined, '', '', 'team-x']);
  });
});
