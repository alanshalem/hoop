import { cookies } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { AUTH_MESSAGES } from '@/server/auth/messages';
import { changeOwnPassword } from '@/server/auth/password-change';
import { passwordChangeErrorResponse } from '@/server/auth/password-change-response';
import { PasswordChangeBodySchema } from '@/server/auth/password-schema';
import { SESSION_COOKIE_NAME } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import { INTERNAL_ERROR_MESSAGE, jsonError, jsonOk } from '@/server/http/json';
import { logServerError } from '@/server/http/log-server-error';
import { isJsonRequest, readJsonBody } from '@/server/http/read-json';
import { isSameOriginRequest } from '@/server/http/same-origin';
import { MAX_USER_BODY_BYTES } from '@/server/users/schemas';

/**
 * POST /api/auth/password  { currentPassword, newPassword } -> 200 { user } (S3, S5).
 * The logged-in user replaces their own password (new one: 8 to 256 characters):
 * `mustChangePassword` clears and every other session of the user is deleted;
 * the current session and its cookie stay valid.
 * 403 when a present `Origin` is not this host, 415 if not JSON, 401 without a
 * session, 400 for a malformed body, 400 `WRONG_CURRENT_PASSWORD` when the
 * current password does not match, 400 `SAME_PASSWORD` when the new password
 * equals the current one (nothing changes in either case), 429 `TOO_MANY_ATTEMPTS`
 * for 15 minutes after 5 wrong current passwords within 15 minutes (a successful
 * change clears the counter).
 */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return jsonError(403, AUTH_MESSAGES.forbiddenOrigin);
  if (!isJsonRequest(request)) return jsonError(415, AUTH_MESSAGES.unsupportedMediaType);

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return jsonError(401, AUTH_MESSAGES.unauthenticated);

  try {
    const body = await readJsonBody(request, MAX_USER_BODY_BYTES);
    const parsed = body.ok ? PasswordChangeBodySchema.safeParse(body.value) : null;
    if (!parsed?.success) return jsonError(400, AUTH_MESSAGES.invalidPasswordChangeBody);

    const outcome = await changeOwnPassword(getDb(), token, parsed.data);
    return outcome.ok ? jsonOk({ user: outcome.user }) : passwordChangeErrorResponse(outcome.error);
  } catch (error) {
    unstable_rethrow(error);
    logServerError('auth/password', error);
    return jsonError(500, INTERNAL_ERROR_MESSAGE);
  }
}
