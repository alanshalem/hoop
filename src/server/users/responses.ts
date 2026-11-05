import 'server-only';
import { jsonError } from '../http/json';
import { USER_MESSAGES } from './messages';
import type { UserAdminError } from './service';

const ERROR_RESPONSES: Record<UserAdminError, { status: number; message: string }> = {
  EMAIL_TAKEN: { status: 409, message: USER_MESSAGES.emailTaken },
  USER_NOT_FOUND: { status: 404, message: USER_MESSAGES.userNotFound },
  SELF_DEACTIVATION: { status: 409, message: USER_MESSAGES.selfDeactivation },
  SELF_ROLE_CHANGE: { status: 409, message: USER_MESSAGES.selfRoleChange },
  LAST_ADMIN: { status: 409, message: USER_MESSAGES.lastAdmin },
  // The acting admin was deactivated or demoted after the session check (S6).
  ACTOR_NOT_ALLOWED: { status: 403, message: USER_MESSAGES.forbidden },
};

/** The refusal of a user administration change, with its error code as `reason`. */
export function userAdminErrorResponse(error: UserAdminError): Response {
  const { status, message } = ERROR_RESPONSES[error];
  return jsonError(status, message, error);
}
