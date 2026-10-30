import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AUTH_MESSAGES } from '@/server/auth/messages';
import { POST } from './route';

/**
 * Route-level check for the Origin guard, which answers before the session
 * cookie is read (cookies() needs a Next.js request scope).
 */

describe('POST /api/sync/push (guards)', () => {
  it('answers 403 when the Origin does not match the host, before reading the session', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/sync/push', {
        method: 'POST',
        body: JSON.stringify({ records: [], events: [] }),
        headers: { 'content-type': 'application/json', origin: 'http://evil.example', host: 'localhost:3000' },
      })
    );
    assert.strictEqual(response.status, 403);
    assert.strictEqual(response.headers.get('cache-control'), 'no-store');
    assert.deepStrictEqual(await response.json(), { error: AUTH_MESSAGES.forbiddenOrigin });
  });
});
