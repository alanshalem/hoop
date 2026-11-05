import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  TEMPORARY_PASSWORD_ALPHABET,
  TEMPORARY_PASSWORD_LENGTH,
  generateTemporaryPassword,
} from './temporary-password';

/** Fills each request with the next bytes of `bytes`, in order. */
function scriptedRandom(bytes: number[]) {
  let index = 0;
  return (target: Uint8Array) => {
    for (let i = 0; i < target.length; i++) target[i] = bytes[index++ % bytes.length];
  };
}

describe('generateTemporaryPassword (S2)', () => {
  it('builds 12 characters from an alphabet without look-alike characters', () => {
    assert.strictEqual(TEMPORARY_PASSWORD_LENGTH, 12);
    assert.doesNotMatch(TEMPORARY_PASSWORD_ALPHABET, /[0O1lI]/);
    assert.strictEqual(new Set(TEMPORARY_PASSWORD_ALPHABET).size, TEMPORARY_PASSWORD_ALPHABET.length);
    for (let run = 0; run < 50; run++) {
      const password = generateTemporaryPassword();
      assert.strictEqual(password.length, TEMPORARY_PASSWORD_LENGTH);
      for (const char of password) assert.ok(TEMPORARY_PASSWORD_ALPHABET.includes(char), `unexpected "${char}"`);
    }
  });

  it('fits the server password rule (8 to 256 characters)', () => {
    const password = generateTemporaryPassword();
    assert.ok(password.length >= 8 && password.length <= 256);
  });

  it('maps random bytes onto the alphabet', () => {
    const password = generateTemporaryPassword(scriptedRandom([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));
    assert.strictEqual(password, TEMPORARY_PASSWORD_ALPHABET.slice(0, 12));
  });

  it('skips the bytes that would bias the choice instead of wrapping them', () => {
    const size = TEMPORARY_PASSWORD_ALPHABET.length;
    const biased = 256 - (256 % size);
    const password = generateTemporaryPassword(scriptedRandom([255, biased, 0]));
    assert.strictEqual(password, TEMPORARY_PASSWORD_ALPHABET[0].repeat(12));
  });

  it('differs between calls', () => {
    const seen = new Set(Array.from({ length: 20 }, () => generateTemporaryPassword()));
    assert.strictEqual(seen.size, 20);
  });
});
