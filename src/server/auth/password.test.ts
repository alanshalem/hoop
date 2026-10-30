import { describe, it } from 'node:test';
import assert from 'node:assert';
import { randomBytes, scryptSync } from 'node:crypto';
import { hashPassword, needsRehash, verifyPassword } from './password';

/** A hash written with other cost parameters (e.g. by the T8 release, N = 2^14). */
function hashWithParams(password: string, N: number, r: number, p: number): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64, { N, r, p, maxmem: 2 * 128 * N * r });
  return ['scrypt', N, r, p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

describe('password hashing (scrypt)', () => {
  it('encodes the hash as scrypt$N$r$p$salt$hash', async () => {
    const encoded = await hashPassword('camg1922');
    const parts = encoded.split('$');

    assert.strictEqual(parts.length, 6);
    assert.deepStrictEqual(parts.slice(0, 4), ['scrypt', '131072', '8', '1']);
    assert.strictEqual(Buffer.from(parts[4], 'base64url').length, 16);
    assert.strictEqual(Buffer.from(parts[5], 'base64url').length, 64);
    assert.ok(!encoded.includes('camg1922'));
  });

  it('uses a random salt, so the same password hashes differently', async () => {
    const [first, second] = await Promise.all([hashPassword('camg1922'), hashPassword('camg1922')]);
    assert.notStrictEqual(first, second);
  });

  it('verifies the correct password', async () => {
    const encoded = await hashPassword('camg1922');
    assert.strictEqual(await verifyPassword('camg1922', encoded), true);
  });

  it('rejects a wrong password', async () => {
    const encoded = await hashPassword('camg1922');
    assert.strictEqual(await verifyPassword('camg1923', encoded), false);
    assert.strictEqual(await verifyPassword('', encoded), false);
  });

  it('rejects a tampered hash or salt', async () => {
    const encoded = await hashPassword('camg1922');
    const parts = encoded.split('$');

    const hash = Buffer.from(parts[5], 'base64url');
    hash[0] ^= 0xff;
    const tamperedHash = [...parts.slice(0, 5), hash.toString('base64url')].join('$');

    const salt = Buffer.from(parts[4], 'base64url');
    salt[0] ^= 0xff;
    const tamperedSalt = [...parts.slice(0, 4), salt.toString('base64url'), parts[5]].join('$');

    assert.strictEqual(await verifyPassword('camg1922', tamperedHash), false);
    assert.strictEqual(await verifyPassword('camg1922', tamperedSalt), false);
  });

  it('verifies hashes written with older, still-safe cost parameters', async () => {
    const legacy = hashWithParams('camg1922', 16384, 8, 1);
    assert.strictEqual(await verifyPassword('camg1922', legacy), true);
    assert.strictEqual(await verifyPassword('camg1923', legacy), false);
  });

  it('rejects tampered or unsafe cost parameters without throwing', async () => {
    const encoded = await hashPassword('camg1922');
    const parts = encoded.split('$');
    const withParams = (n: string, r: string, p: string) =>
      ['scrypt', n, r, p, parts[4], parts[5]].join('$');

    // Within bounds but not the parameters the key was derived with: a plain mismatch.
    assert.strictEqual(await verifyPassword('camg1922', withParams('16384', '8', '1')), false);
    // Out of bounds: refused before any key derivation.
    for (const [n, r, p] of [
      ['8192', '8', '1'], // below the minimum N
      ['131071', '8', '1'], // N not a power of two
      ['1073741824', '8', '1'], // huge N (memory DoS)
      ['524288', '8', '1'], // 512 MiB: over the memory cap
      ['131072', '64', '1'], // r too large
      ['131072', '0', '1'],
      ['131072', '8', '0'],
      ['131072', '8', '17'], // p too large (CPU DoS)
      ['131072', '8', 'x'],
      ['0x20000', '8', '1'],
      ['131072.0', '8', '1'],
    ]) {
      assert.strictEqual(await verifyPassword('camg1922', withParams(n, r, p)), false, `${n}$${r}$${p}`);
    }
  });

  it('flags hashes whose parameters differ from the current ones for rehashing', async () => {
    assert.strictEqual(needsRehash(await hashPassword('camg1922')), false);
    assert.strictEqual(needsRehash(hashWithParams('camg1922', 16384, 8, 1)), true);
    assert.strictEqual(needsRehash(hashWithParams('camg1922', 131072, 8, 2)), true);
    assert.strictEqual(needsRehash('not-a-hash'), true);
  });

  it('rejects malformed encodings without throwing', async () => {
    const encoded = await hashPassword('camg1922');
    const parts = encoded.split('$');

    for (const malformed of [
      '',
      'camg1922',
      'scrypt$16384$8$1$onlysalt',
      ['bcrypt', ...parts.slice(1)].join('$'),
      [...parts.slice(0, 5), ''].join('$'),
      [...parts, 'extra'].join('$'),
    ]) {
      assert.strictEqual(await verifyPassword('camg1922', malformed), false, malformed);
    }
  });
});
