import { cookies } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { AUTH_MESSAGES } from '@/server/auth/messages';
import { revokeSession, SESSION_COOKIE_NAME } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import { INTERNAL_ERROR_MESSAGE, jsonError, jsonOk } from '@/server/http/json';
import { logServerError } from '@/server/http/log-server-error';
import { isJsonRequest } from '@/server/http/read-json';
import { isSameOriginRequest } from '@/server/http/same-origin';

/**
 * POST /api/auth/logout (Content-Type: application/json, no body needed) -> 200 { ok: true }.
 * Deletes the session row and clears the cookie. Idempotent: calling it without
 * a session also succeeds. 403 when a present `Origin` is not this host, 415 if
 * not JSON, so a cross-site page cannot log the user out.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return jsonError(403, AUTH_MESSAGES.forbiddenOrigin);
  if (!isJsonRequest(request)) return jsonError(415, AUTH_MESSAGES.unsupportedMediaType);

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  // The cookie is cleared even if revoking fails, so the browser is logged out either way.
  cookieStore.delete({ name: SESSION_COOKIE_NAME, path: '/' });

  if (!token) return jsonOk({ ok: true });
  try {
    await revokeSession(getDb(), token);
    return jsonOk({ ok: true });
  } catch (error) {
    unstable_rethrow(error);
    logServerError('auth/logout', error);
    return jsonError(500, INTERNAL_ERROR_MESSAGE);
  }
}
