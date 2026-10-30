import { unstable_rethrow } from 'next/navigation';
import { getCurrentSession } from '@/server/auth/current-user';
import { AUTH_MESSAGES } from '@/server/auth/messages';
import { validateSessionToken } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import { INTERNAL_ERROR_MESSAGE, jsonError } from '@/server/http/json';
import { logServerError } from '@/server/http/log-server-error';
import { getSyncChangeListener } from '@/server/sync/listener';
import { createSyncEventStream, SSE_HEADERS } from '@/server/sync/sse';

/**
 * GET /api/sync/stream -> 200 text/event-stream (401 without a session).
 *   `event: changed` + `data: {"cursor":"<seq>"}` after every committed push with writes,
 *   `: heartbeat` every 25 s. The stream ends when the client disconnects or,
 *   at a heartbeat, when the session is no longer valid.
 * Reads the session cookie, so it always runs at request time (Node.js runtime,
 * the only one with Cache Components).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await getCurrentSession();
    if (!session) return jsonError(401, AUTH_MESSAGES.unauthenticated);

    const db = getDb();
    const listener = getSyncChangeListener();
    const stream = createSyncEventStream({
      subscribe: (onChange) => listener.subscribe(onChange),
      signal: request.signal,
      isSessionValid: async () => (await validateSessionToken(db, session.token)) !== null,
    });
    return new Response(stream, { headers: SSE_HEADERS });
  } catch (error) {
    unstable_rethrow(error);
    logServerError('sync/stream', error);
    return jsonError(500, INTERNAL_ERROR_MESSAGE);
  }
}
