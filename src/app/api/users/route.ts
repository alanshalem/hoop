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
import { CreateUserBodySchema, MAX_USER_BODY_BYTES } from '@/server/users/schemas';
import { createUser, listUsers } from '@/server/users/service';

/**
 * GET /api/users
 *   -> 200 { users: [{ id, email, name, role, active, mustChangePassword, createdAt }] } sorted by name (S1).
 * Never returns password data. 401 without a session, 403 without `MANAGE_USERS` (ADMIN only).
 */
export async function GET(): Promise<Response> {
  try {
    const refusal = userManagementRefusal(await getCurrentUser());
    if (refusal) return refusal;
    return jsonOk({ users: await listUsers(getDb()) });
  } catch (error) {
    unstable_rethrow(error);
    logServerError('users/list', error);
    return jsonError(500, INTERNAL_ERROR_MESSAGE);
  }
}

/**
 * POST /api/users  { name, email, role, temporaryPassword } -> 201 { user } (S2, S6).
 * The account starts active and must change the temporary password at its next login.
 * 403 when a present `Origin` is not this host, 415 if not JSON, 401 without a session,
 * 403 without `MANAGE_USERS`, 400 for a malformed body (name 2-60 characters, valid email,
 * known role, password 8-256), 409 `EMAIL_TAKEN` when the email (any case) is in use.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return jsonError(403, AUTH_MESSAGES.forbiddenOrigin);
  if (!isJsonRequest(request)) return jsonError(415, AUTH_MESSAGES.unsupportedMediaType);
  try {
    const refusal = userManagementRefusal(await getCurrentUser());
    if (refusal) return refusal;

    const body = await readJsonBody(request, MAX_USER_BODY_BYTES);
    const parsed = body.ok ? CreateUserBodySchema.safeParse(body.value) : null;
    if (!parsed?.success) return jsonError(400, USER_MESSAGES.invalidCreateBody);

    const outcome = await createUser(getDb(), parsed.data);
    return outcome.ok ? jsonOk({ user: outcome.user }, 201) : userAdminErrorResponse(outcome.error);
  } catch (error) {
    unstable_rethrow(error);
    logServerError('users/create', error);
    return jsonError(500, INTERNAL_ERROR_MESSAGE);
  }
}
