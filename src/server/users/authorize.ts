import 'server-only';
import { can } from '@/core/domain/rules/permissions';
import { AUTH_MESSAGES } from '../auth/messages';
import { passwordChangeRefusal } from '../auth/password-change-gate';
import type { PublicUser } from '../auth/users';
import { jsonError } from '../http/json';
import { USER_MESSAGES } from './messages';

/**
 * 401 without a session, 403 `PASSWORD_CHANGE_REQUIRED` while the account still
 * holds a temporary password (S3), 403 without `MANAGE_USERS` (S1), else null.
 */
export function userManagementRefusal(user: PublicUser | null): Response | null {
  if (!user) return jsonError(401, AUTH_MESSAGES.unauthenticated);
  const passwordRefusal = passwordChangeRefusal(user);
  if (passwordRefusal) return passwordRefusal;
  if (!can(user.role, 'MANAGE_USERS')) return jsonError(403, USER_MESSAGES.forbidden);
  return null;
}
