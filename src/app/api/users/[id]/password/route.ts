import { unstable_rethrow } from 'next/navigation';
import { AUTH_MESSAGES } from '@/server/auth/messages';
import { getCurrentUser } from '@/server/auth/current-user';
import { getDb } from '@/server/db/client';
import { INTERNAL_ERROR_MESSAGE, jsonError, jsonOk } from '@/server/http/json';
import { logServerError } from '@/server/http/log-server-error';
import { isJsonRequest, readJsonBody } from '@/server/http/read-json';
import { isSameOriginRequest } from '@/server/http/same-origin';
import { userManagementRefusal } from '@/server/users/authorize';
import { USER_MESSAGES } from '@/server/users/messages';
import { userAdminErrorResponse } from '@/server/users/responses';
import { MAX_USER_BODY_BYTES, ResetPasswordBodySchema } from '@/server/users/schemas';
import { resetUserPassword } from '@/server/users/service';

/**
 * POST /api/users/[id]/password  { temporaryPassword } -> 200 { user } (S2).
 * Sets a new temporary password (8 to 256 characters): the account must change it
 * at its next login and EVERY session of the account is deleted. When an admin
 * resets their own password this includes the session making the request, so the
 * admin is logged out and logs in again with the temporary password.
 * 403 when a present `Origin` is not this host, 415 if not JSON, 401 without a session,
 * 403 without `MANAGE_USERS`, 400 for a malformed body, 404 `USER_NOT_FOUND`.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isSameOriginRequest(request)) return jsonError(403, AUTH_MESSAGES.forbiddenOrigin);
  if (!isJsonRequest(request)) return jsonError(415, AUTH_MESSAGES.unsupportedMediaType);
  try {
    const refusal = userManagementRefusal(await getCurrentUser());
    if (refusal) return refusal;

    const body = await readJsonBody(request, MAX_USER_BODY_BYTES);
    const parsed = body.ok ? ResetPasswordBodySchema.safeParse(body.value) : null;
    if (!parsed?.success) return jsonError(400, USER_MESSAGES.invalidResetBody);

    const { id } = await params;
    const outcome = await resetUserPassword(getDb(), id, parsed.data.temporaryPassword);
    return outcome.ok ? jsonOk({ user: outcome.user }) : userAdminErrorResponse(outcome.error);
  } catch (error) {
    unstable_rethrow(error);
    logServerError('users/reset-password', error);
    return jsonError(500, INTERNAL_ERROR_MESSAGE);
  }
}
