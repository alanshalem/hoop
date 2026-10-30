import { describe, it } from 'node:test';
import assert from 'node:assert';
import { hashPassword, verifyPassword } from './password';

describe('password hashing (scrypt)', () => {
  it('encodes the hash as scrypt$N$r$p$salt$hash', async () => {
    const encoded = await hashPassword('camg1922');
    const parts = encoded.split('$');

    assert.strictEqual(parts.length, 6);
    assert.deepStrictEqual(parts.slice(0, 4), ['scrypt', '16384', '8', '1']);
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

  it('rejects tampered or unsafe cost parameters without throwing', async () => {
    const encoded = await hashPassword('camg1922');
    const parts = encoded.split('$');
    const withParams = (n: string, r: string, p: string) =>
      ['scrypt', n, r, p, parts[4], parts[5]].join('$');

    assert.strictEqual(await verifyPassword('camg1922', withParams('8192', '8', '1')), false);
    assert.strictEqual(await verifyPassword('camg1922', withParams('16383', '8', '1')), false);
    assert.strictEqual(await verifyPassword('camg1922', withParams('1073741824', '8', '1')), false);
    assert.strictEqual(await verifyPassword('camg1922', withParams('16384', '0', '1')), false);
    assert.strictEqual(await verifyPassword('camg1922', withParams('16384', '8', 'x')), false);
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
