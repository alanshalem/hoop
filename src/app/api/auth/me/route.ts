import { unstable_rethrow } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/current-user';
import { AUTH_MESSAGES } from '@/server/auth/messages';
import { INTERNAL_ERROR_MESSAGE, jsonError, jsonOk } from '@/server/http/json';

/**
 * GET /api/auth/me -> 200 { user } (id, email, name, role) or 401.
 * Reads the session cookie, so it always runs at request time.
 */
export async function GET(): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError(401, AUTH_MESSAGES.unauthenticated);
    return jsonOk({ user });
  } catch (error) {
    unstable_rethrow(error);
    console.error('[auth/me] failed', error);
    return jsonError(500, INTERNAL_ERROR_MESSAGE);
  }
}
