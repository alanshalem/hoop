import { cookies } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { authenticateUser } from '@/server/auth/authenticate';
import { LoginBodySchema } from '@/server/auth/login-schema';
import { AUTH_MESSAGES } from '@/server/auth/messages';
import { createSession, revokeSession, SESSION_COOKIE_NAME, sessionCookieOptions } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import { INTERNAL_ERROR_MESSAGE, jsonError, jsonOk } from '@/server/http/json';
import { logServerError } from '@/server/http/log-server-error';
import { isJsonRequest } from '@/server/http/read-json';
import { isSameOriginRequest } from '@/server/http/same-origin';

/**
 * POST /api/auth/login  { email, password } -> 200 { user } + `hoop_session` cookie.
 * Any credential failure answers the same generic 401 (no user enumeration).
 * 403 when a present `Origin` is not this host, 415 if not JSON, 400 for a malformed body.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return jsonError(403, AUTH_MESSAGES.forbiddenOrigin);
  if (!isJsonRequest(request)) return jsonError(415, AUTH_MESSAGES.unsupportedMediaType);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, AUTH_MESSAGES.invalidBody);
  }

  const parsed = LoginBodySchema.safeParse(body);
  if (!parsed.success) return jsonError(400, AUTH_MESSAGES.invalidBody);

  const cookieStore = await cookies();
  try {
    const db = getDb();
    const user = await authenticateUser(db, parsed.data.email, parsed.data.password);
    if (!user) return jsonError(401, AUTH_MESSAGES.invalidCredentials);

    const previousToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (previousToken) await revokeSession(db, previousToken);

    const session = await createSession(db, user.id);
    cookieStore.set(SESSION_COOKIE_NAME, session.token, sessionCookieOptions(session.expiresAt));
    return jsonOk({ user });
  } catch (error) {
    unstable_rethrow(error);
    logServerError('auth/login', error);
    return jsonError(500, INTERNAL_ERROR_MESSAGE);
  }
}
