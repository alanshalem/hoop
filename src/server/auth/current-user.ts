import 'server-only';
import { cookies } from 'next/headers';
import { getDb } from '../db/client';
import { SESSION_COOKIE_NAME, validateSessionToken } from './session';
import type { PublicUser } from './users';

/**
 * Data Access Layer entry point: the user of the current request, or null.
 *
 * Reads the `hoop_session` cookie, so it is request-time data under Cache
 * Components: call it from Route Handlers, Server Actions, or a component
 * rendered inside `<Suspense>`. Never call it from a `use cache` scope. It is
 * deliberately not cached (`use cache: private` would keep serving a revoked
 * session from the browser cache after logout).
 */
export async function getCurrentUser(): Promise<PublicUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return validateSessionToken(getDb(), token);
}
