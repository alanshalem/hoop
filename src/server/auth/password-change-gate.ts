import 'server-only';
import { jsonError } from '../http/json';
import { AUTH_MESSAGES } from './messages';
import type { PublicUser } from './users';

/**
 * 403 `PASSWORD_CHANGE_REQUIRED` for an account that still holds a temporary
 * password (S3), else null. Used by the sync API and the user administration
 * API (`/api/users`); login, `/api/auth/me`,
 * `/api/auth/password` and logout keep working so the user can change it.
 */
export function passwordChangeRefusal(user: Pick<PublicUser, 'mustChangePassword'>): Response | null {
  return user.mustChangePassword
    ? jsonError(403, AUTH_MESSAGES.passwordChangeRequired, 'PASSWORD_CHANGE_REQUIRED')
    : null;
}
