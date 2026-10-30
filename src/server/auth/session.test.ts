import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  generateSessionToken,
  getSessionExpiry,
  hashSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from './session';

const NOW = new Date('2026-10-30T18:00:00.000Z');

describe('session tokens', () => {
  it('generates 32 random bytes encoded as base64url', () => {
    const token = generateSessionToken();
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.strictEqual(Buffer.from(token, 'base64url').length, 32);
    assert.notStrictEqual(generateSessionToken(), token);
  });

  it('hashes tokens with SHA-256 (hex), deterministically', () => {
    assert.strictEqual(
      hashSessionToken('abc'),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
    const token = generateSessionToken();
    assert.strictEqual(hashSessionToken(token), hashSessionToken(token));
    assert.notStrictEqual(hashSessionToken(token), token);
  });

  it('expires sessions 30 days after creation', () => {
    assert.strictEqual(getSessionExpiry(NOW).toISOString(), '2026-11-29T18:00:00.000Z');
  });
});

describe('session cookie', () => {
  it('is named hoop_session', () => {
    assert.strictEqual(SESSION_COOKIE_NAME, 'hoop_session');
  });

  it('is httpOnly, sameSite lax, path / and expires with the session', () => {
    const expiresAt = getSessionExpiry(NOW);
    assert.deepStrictEqual(sessionCookieOptions(expiresAt, false), {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      expires: expiresAt,
    });
  });

  it('is secure in production', () => {
    assert.strictEqual(sessionCookieOptions(getSessionExpiry(NOW), true).secure, true);
  });
});
