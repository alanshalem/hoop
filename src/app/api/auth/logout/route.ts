import { cookies } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { revokeSession, SESSION_COOKIE_NAME } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import { INTERNAL_ERROR_MESSAGE, jsonError, jsonOk } from '@/server/http/json';

/**
 * POST /api/auth/logout -> 200 { ok: true }. Deletes the session row and clears
 * the cookie. Idempotent: calling it without a session also succeeds.
 */
export async function POST(): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  // The cookie is cleared even if revoking fails, so the browser is logged out either way.
  cookieStore.delete({ name: SESSION_COOKIE_NAME, path: '/' });

  if (!token) return jsonOk({ ok: true });
  try {
    await revokeSession(getDb(), token);
    return jsonOk({ ok: true });
  } catch (error) {
    unstable_rethrow(error);
    console.error('[auth/logout] failed', error);
    return jsonError(500, INTERNAL_ERROR_MESSAGE);
  }
}
