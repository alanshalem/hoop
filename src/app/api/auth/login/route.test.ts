import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AUTH_MESSAGES } from '@/server/auth/messages';
import { POST } from './route';

/**
 * Route-level checks for the paths that answer before the session cookie is
 * touched (cookies() needs a Next.js request scope, so success paths are
 * covered by the database tests and the smoke run instead).
 */

const LOGIN_URL = 'http://localhost:3000/api/auth/login';
const VALID = JSON.stringify({ email: 'fbalbi@camg.com.ar', password: 'camg1922' });

function login(body: string, headers: Record<string, string>): Request {
  return new Request(LOGIN_URL, { method: 'POST', body, headers });
}

async function assertError(response: Response, status: number, error: string): Promise<void> {
  assert.strictEqual(response.status, status);
  assert.strictEqual(response.headers.get('cache-control'), 'no-store');
  assert.deepStrictEqual(await response.json(), { error });
}

describe('POST /api/auth/login (guards)', () => {
  it('answers 415 for text/plain, form-encoded or missing content types', async () => {
    const contentTypes: Record<string, string>[] = [
      { 'content-type': 'text/plain' },
      { 'content-type': 'application/x-www-form-urlencoded' },
      {},
    ];
    for (const headers of contentTypes) {
      await assertError(await POST(login(VALID, headers)), 415, AUTH_MESSAGES.unsupportedMediaType);
    }
  });

  it('answers 400 for malformed JSON, a bad email, an empty or a 257-character password', async () => {
    const json = { 'content-type': 'application/json' };
    for (const body of [
      '{',
      JSON.stringify({ email: 'not-an-email', password: 'camg1922' }),
      JSON.stringify({ email: 'fbalbi@camg.com.ar', password: '' }),
      JSON.stringify({ email: 'fbalbi@camg.com.ar', password: 'x'.repeat(257) }),
    ]) {
      await assertError(await POST(login(body, json)), 400, AUTH_MESSAGES.invalidBody);
    }
  });

  it('answers 403 when the Origin does not match the host', async () => {
    const response = await POST(
      login(VALID, { 'content-type': 'application/json', origin: 'http://evil.example', host: 'localhost:3000' })
    );
    await assertError(response, 403, AUTH_MESSAGES.forbiddenOrigin);
  });

  it('checks the Origin before the body, so a cross-site form post also gets 403', async () => {
    const response = await POST(
      login('email=a', { 'content-type': 'text/plain', origin: 'http://evil.example', host: 'localhost:3000' })
    );
    await assertError(response, 403, AUTH_MESSAGES.forbiddenOrigin);
  });

  it('still validates the body of a same-origin request', async () => {
    const response = await POST(
      login('{', { 'content-type': 'application/json', origin: 'http://localhost:3000', host: 'localhost:3000' })
    );
    await assertError(response, 400, AUTH_MESSAGES.invalidBody);
  });
});
