import 'server-only';
import { and, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { DbExecutor } from '../db/client';
import { authThrottles } from '../db/schema';
import { normalizeEmail } from './users';

/**
 * =============================================================================
 * HOOP - PASSWORD ATTEMPT THROTTLING (S1, S2, S3)
 * Failure counters live in Postgres, so every serverless instance shares them.
 * A key's window starts at its first failure and lasts 15 minutes; reaching the
 * limit inside it blocks the key for 15 minutes from that failure. Callers refuse
 * a blocked key before verifying any password, so a block counts nothing more.
 * =============================================================================
 */

/** Length of a counting window and of a block. */
export const THROTTLE_WINDOW_MS = 15 * 60 * 1000;

/** Failures per window that block a key. */
export const THROTTLE_LIMITS = { loginEmail: 5, loginIp: 20, passwordChange: 5 } as const;

export const throttleKey = {
  loginEmail: (email: string) => `login-email:${normalizeEmail(email)}`,
  loginIp: (ip: string) => `login-ip:${ip}`,
  passwordChange: (userId: string) => `password-user:${userId}`,
};

export interface ThrottleState {
  /** Failures in the current window. */
  failures: number;
  /** Set once the failures reached the limit; the key is blocked while it is in the future. */
  blockedUntil: Date | null;
}

/** True while any of `keys` is blocked. */
export async function isThrottled(db: DbExecutor, keys: readonly string[], now: Date = new Date()): Promise<boolean> {
  if (keys.length === 0) return false;
  const [row] = await db
    .select({ key: authThrottles.key })
    .from(authThrottles)
    .where(and(inArray(authThrottles.key, [...keys]), gt(authThrottles.blockedUntil, now)))
    .limit(1);
  return row !== undefined;
}

/**
 * Counts one failure for `key` in a single upsert, so concurrent failures are
 * all counted: an expired window restarts at 1, otherwise the count grows, and
 * reaching `limit` blocks the key until `now` + 15 minutes. Then deletes the
 * rows whose window and block both ended (they no longer change anything).
 */
export async function recordFailure(
  db: DbExecutor,
  key: string,
  limit: number,
  now: Date = new Date()
): Promise<ThrottleState> {
  const windowStartCutoff = new Date(now.getTime() - THROTTLE_WINDOW_MS);
  const blockedUntil = new Date(now.getTime() + THROTTLE_WINDOW_MS);
  const expired = sql`${authThrottles.windowStart} <= ${windowStartCutoff.toISOString()}::timestamptz`;
  const failures = sql`CASE WHEN ${expired} THEN 1 ELSE ${authThrottles.failures} + 1 END`;

  const [state] = await db
    .insert(authThrottles)
    .values({ key, failures: 1, windowStart: now, blockedUntil: limit <= 1 ? blockedUntil : null })
    .onConflictDoUpdate({
      target: authThrottles.key,
      set: {
        failures,
        windowStart: sql`CASE WHEN ${expired} THEN ${now.toISOString()}::timestamptz ELSE ${authThrottles.windowStart} END`,
        blockedUntil: sql`CASE
          WHEN ${failures} >= ${limit} THEN ${blockedUntil.toISOString()}::timestamptz
          WHEN ${expired} THEN NULL
          ELSE ${authThrottles.blockedUntil} END`,
      },
    })
    .returning({ failures: authThrottles.failures, blockedUntil: authThrottles.blockedUntil });

  await db
    .delete(authThrottles)
    .where(
      and(
        lte(authThrottles.windowStart, windowStartCutoff),
        or(isNull(authThrottles.blockedUntil), lte(authThrottles.blockedUntil, now))
      )
    );
  return state;
}

/** Forgets the failures of `key` (after a success or an admin password reset). */
export async function clearThrottle(db: DbExecutor, key: string): Promise<void> {
  await db.delete(authThrottles).where(eq(authThrottles.key, key));
}
