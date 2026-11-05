import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AUTH_MESSAGES } from '@/server/auth/messages';
import { PATCH } from './route';

/**
 * Route-level checks for the guards, which answer before the session cookie is
 * read (cookies() needs a Next.js request scope).
 */

const CONTEXT = { params: Promise.resolve({ id: 'user-1' }) };

function patch(headers: Record<string, string>): Request {
  return new Request('http://localhost:3000/api/users/user-1', {
    method: 'PATCH',
    body: JSON.stringify({ active: false }),
    headers,
  });
}

async function assertError(response: Response, status: number, error: string): Promise<void> {
  assert.strictEqual(response.status, status);
  assert.strictEqual(response.headers.get('cache-control'), 'no-store');
  assert.deepStrictEqual(await response.json(), { error });
}

describe('PATCH /api/users/[id] (guards)', () => {
  it('answers 403 when the Origin does not match the host', async () => {
    const response = await PATCH(
      patch({ 'content-type': 'application/json', origin: 'http://evil.example', host: 'localhost:3000' }),
      CONTEXT
    );
    await assertError(response, 403, AUTH_MESSAGES.forbiddenOrigin);
  });

  it('answers 415 unless the request is JSON', async () => {
    await assertError(
      await PATCH(patch({ 'content-type': 'text/plain' }), CONTEXT),
      415,
      AUTH_MESSAGES.unsupportedMediaType
    );
  });
});
