import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  generateSessionToken,
  getSessionExpiry,
  hashSessionToken,
  resolveSessionCookieSecure,
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

describe('SESSION_COOKIE_SECURE override', () => {
  it('defaults to secure in production only', () => {
    assert.strictEqual(resolveSessionCookieSecure({ NODE_ENV: 'production' }), true);
    assert.strictEqual(resolveSessionCookieSecure({ NODE_ENV: 'development' }), false);
    assert.strictEqual(resolveSessionCookieSecure({ NODE_ENV: 'test' }), false);
    assert.strictEqual(resolveSessionCookieSecure({}), false);
  });

  it('lets "false" turn Secure off in production (plain http on the LAN)', () => {
    assert.strictEqual(resolveSessionCookieSecure({ NODE_ENV: 'production', SESSION_COOKIE_SECURE: 'false' }), false);
  });

  it('lets "true" force Secure outside production', () => {
    assert.strictEqual(resolveSessionCookieSecure({ NODE_ENV: 'development', SESSION_COOKIE_SECURE: 'true' }), true);
  });

  it('ignores case and surrounding spaces', () => {
    assert.strictEqual(resolveSessionCookieSecure({ NODE_ENV: 'production', SESSION_COOKIE_SECURE: ' FALSE ' }), false);
    assert.strictEqual(resolveSessionCookieSecure({ NODE_ENV: 'development', SESSION_COOKIE_SECURE: 'True' }), true);
  });

  it('falls back to the default for empty or unknown values', () => {
    for (const value of ['', '0', 'no', 'off', 'yes']) {
      assert.strictEqual(resolveSessionCookieSecure({ NODE_ENV: 'production', SESSION_COOKIE_SECURE: value }), true, value);
      assert.strictEqual(resolveSessionCookieSecure({ NODE_ENV: 'development', SESSION_COOKIE_SECURE: value }), false, value);
    }
  });
});
