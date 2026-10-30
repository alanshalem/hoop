import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AUTH_MESSAGES } from '@/server/auth/messages';
import { POST } from './route';

/**
 * Route-level checks for the guards, which answer before the session cookie is
 * touched (cookies() needs a Next.js request scope).
 */

function logout(headers: Record<string, string>): Request {
  return new Request('http://localhost:3000/api/auth/logout', { method: 'POST', headers });
}

async function assertError(response: Response, status: number, error: string): Promise<void> {
  assert.strictEqual(response.status, status);
  assert.strictEqual(response.headers.get('cache-control'), 'no-store');
  assert.deepStrictEqual(await response.json(), { error });
}

describe('POST /api/auth/logout (guards)', () => {
  it('answers 415 unless the request is JSON', async () => {
    const contentTypes: Record<string, string>[] = [
      { 'content-type': 'text/plain' },
      { 'content-type': 'application/x-www-form-urlencoded' },
      {},
    ];
    for (const headers of contentTypes) {
      await assertError(await POST(logout(headers)), 415, AUTH_MESSAGES.unsupportedMediaType);
    }
  });

  it('answers 403 when the Origin does not match the host', async () => {
    for (const origin of ['http://evil.example', 'http://localhost:4000', 'null']) {
      const response = await POST(logout({ 'content-type': 'application/json', origin, host: 'localhost:3000' }));
      await assertError(response, 403, AUTH_MESSAGES.forbiddenOrigin);
    }
  });
});
