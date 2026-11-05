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
import { MAX_USER_BODY_BYTES, UpdateUserBodySchema } from '@/server/users/schemas';
import { updateUser } from '@/server/users/service';

/**
 * PATCH /api/users/[id]  { name?, email?, role?, active? } (at least one) -> 200 { user } (S4, S6).
 * `active: false` deactivates the account (it stays listed, cannot log in and every
 * session closes); `active: true` reactivates it.
 * 403 when a present `Origin` is not this host, 415 if not JSON, 401 without a session,
 * 403 `PASSWORD_CHANGE_REQUIRED` while the caller must change a temporary password,
 * 403 without `MANAGE_USERS`, 400 for a malformed body, 404 `USER_NOT_FOUND`,
 * 409 `EMAIL_TAKEN`, 409 `SELF_DEACTIVATION` / `SELF_ROLE_CHANGE` (the admin's own
 * account), 409 `LAST_ADMIN` (the last active ADMIN cannot be deactivated or demoted),
 * 403 `ACTOR_NOT_ALLOWED` when the caller stopped being an active admin after the session check.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isSameOriginRequest(request)) return jsonError(403, AUTH_MESSAGES.forbiddenOrigin);
  if (!isJsonRequest(request)) return jsonError(415, AUTH_MESSAGES.unsupportedMediaType);
  try {
    const actor = await getCurrentUser();
    const refusal = userManagementRefusal(actor);
    if (refusal || !actor) return refusal ?? jsonError(401, AUTH_MESSAGES.unauthenticated);

    const body = await readJsonBody(request, MAX_USER_BODY_BYTES);
    const parsed = body.ok ? UpdateUserBodySchema.safeParse(body.value) : null;
    if (!parsed?.success) return jsonError(400, USER_MESSAGES.invalidUpdateBody);

    const { id } = await params;
    const outcome = await updateUser(getDb(), actor, id, parsed.data);
    return outcome.ok ? jsonOk({ user: outcome.user }) : userAdminErrorResponse(outcome.error);
  } catch (error) {
    unstable_rethrow(error);
    logServerError('users/update', error);
    return jsonError(500, INTERNAL_ERROR_MESSAGE);
  }
}
