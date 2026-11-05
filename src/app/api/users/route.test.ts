import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AUTH_MESSAGES } from '@/server/auth/messages';
import { POST } from './route';

/**
 * Route-level checks for the guards, which answer before the session cookie is
 * read (cookies() needs a Next.js request scope); the service rules are covered
 * by src/server/users/service.db.test.ts.
 */

const BODY = JSON.stringify({ name: 'Ana', email: 'ana@camg.com.ar', role: 'HEAD_COACH', temporaryPassword: 'temporal1' });

function create(headers: Record<string, string>): Request {
  return new Request('http://localhost:3000/api/users', { method: 'POST', body: BODY, headers });
}

async function assertError(response: Response, status: number, error: string): Promise<void> {
  assert.strictEqual(response.status, status);
  assert.strictEqual(response.headers.get('cache-control'), 'no-store');
  assert.deepStrictEqual(await response.json(), { error });
}

describe('POST /api/users (guards)', () => {
  it('answers 403 when the Origin does not match the host', async () => {
    const response = await POST(
      create({ 'content-type': 'application/json', origin: 'http://evil.example', host: 'localhost:3000' })
    );
    await assertError(response, 403, AUTH_MESSAGES.forbiddenOrigin);
  });

  it('answers 415 unless the request is JSON', async () => {
    await assertError(await POST(create({ 'content-type': 'text/plain' })), 415, AUTH_MESSAGES.unsupportedMediaType);
  });
});
