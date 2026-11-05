import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AUTH_MESSAGES } from '@/server/auth/messages';
import { POST } from './route';

/**
 * Route-level checks for the guards, which answer before the session cookie is
 * read (cookies() needs a Next.js request scope); the change itself is covered
 * by src/server/auth/password-change.db.test.ts.
 */

const BODY = JSON.stringify({ currentPassword: 'old-password', newPassword: 'new-password' });

function change(headers: Record<string, string>, body = BODY): Request {
  return new Request('http://localhost:3000/api/auth/password', { method: 'POST', body, headers });
}

async function assertError(response: Response, status: number, error: string): Promise<void> {
  assert.strictEqual(response.status, status);
  assert.strictEqual(response.headers.get('cache-control'), 'no-store');
  assert.deepStrictEqual(await response.json(), { error });
}

describe('POST /api/auth/password (guards)', () => {
  it('answers 403 when the Origin does not match the host', async () => {
    const response = await POST(
      change({ 'content-type': 'application/json', origin: 'http://evil.example', host: 'localhost:3000' })
    );
    await assertError(response, 403, AUTH_MESSAGES.forbiddenOrigin);
  });

  it('answers 415 unless the request is JSON', async () => {
    for (const headers of [{ 'content-type': 'text/plain' }, {}] as Record<string, string>[]) {
      await assertError(await POST(change(headers)), 415, AUTH_MESSAGES.unsupportedMediaType);
    }
  });
});
