import 'server-only';
import { jsonError } from '../http/json';
import type { LoginError } from './authenticate';
import { AUTH_MESSAGES } from './messages';

/**
 * The refusal of a login (S1): the same generic 401 for every credential
 * failure (no user enumeration), 429 `TOO_MANY_ATTEMPTS` while the email or the
 * client IP is blocked.
 */
export function loginErrorResponse(error: LoginError): Response {
  switch (error) {
    case 'INVALID_CREDENTIALS':
      return jsonError(401, AUTH_MESSAGES.invalidCredentials);
    case 'TOO_MANY_ATTEMPTS':
      return jsonError(429, AUTH_MESSAGES.tooManyAttempts, error);
  }
}
