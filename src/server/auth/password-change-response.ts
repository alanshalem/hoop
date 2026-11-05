import 'server-only';
import { jsonError } from '../http/json';
import { AUTH_MESSAGES } from './messages';
import type { PasswordChangeError } from './password-change';

/**
 * The refusal of an own password change (S3, S5): 401 when the session ended,
 * else 400 with the error code as `reason`.
 */
export function passwordChangeErrorResponse(error: PasswordChangeError): Response {
  switch (error) {
    case 'UNAUTHENTICATED':
      return jsonError(401, AUTH_MESSAGES.unauthenticated);
    case 'SAME_PASSWORD':
      return jsonError(400, AUTH_MESSAGES.samePassword, error);
    case 'WRONG_CURRENT_PASSWORD':
      return jsonError(400, AUTH_MESSAGES.wrongCurrentPassword, error);
  }
}
