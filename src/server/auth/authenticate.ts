import 'server-only';
import { and, eq } from 'drizzle-orm';
import type { DbExecutor } from '../db/client';
import { users } from '../db/schema';
import { getDummyPasswordHash, hashPassword, needsRehash, verifyPassword } from './password';
import { THROTTLE_LIMITS, clearThrottle, isThrottled, recordFailure, throttleKey } from './throttle';
import { findUserByEmail, toPublicUser, type PublicUser } from './users';

export type LoginError = 'INVALID_CREDENTIALS' | 'TOO_MANY_ATTEMPTS';

export type LoginResult = { ok: true; user: PublicUser } | { ok: false; error: LoginError };

export interface LoginAttempt {
  email: string;
  password: string;
  /** Client address for the per-IP limit; null skips it. */
  ip: string | null;
}

/**
 * Login with password throttling (S1). While the email (5 failures) or the
 * client IP (20 failures) is blocked, it refuses before checking anything, the
 * same for unknown emails, so a block reveals nothing about the account. A
 * failure counts for both keys; a success clears the email counter only, so a
 * valid account cannot reset the counter of the IP it guesses from.
 */
export async function attemptLogin(
  db: DbExecutor,
  { email, password, ip }: LoginAttempt,
  now: Date = new Date()
): Promise<LoginResult> {
  const emailKey = throttleKey.loginEmail(email);
  const ipKey = ip === null ? null : throttleKey.loginIp(ip);
  if (await isThrottled(db, ipKey ? [emailKey, ipKey] : [emailKey], now)) {
    return { ok: false, error: 'TOO_MANY_ATTEMPTS' };
  }

  const user = await authenticateUser(db, email, password);
  if (!user) {
    await recordFailure(db, emailKey, THROTTLE_LIMITS.loginEmail, now);
    if (ipKey) await recordFailure(db, ipKey, THROTTLE_LIMITS.loginIp, now);
    return { ok: false, error: 'INVALID_CREDENTIALS' };
  }
  await clearThrottle(db, emailKey);
  return { ok: true, user };
}

/**
 * Checks email + password. Unknown emails still run a full scrypt verification
 * against a dummy hash, so both failure paths cost the same time. A deactivated
 * account fails like a wrong password, after the same verification (S4).
 *
 * After a successful check, a hash written with other cost parameters (an
 * older release) is replaced by one with the current cost.
 */
export async function authenticateUser(
  db: DbExecutor,
  email: string,
  password: string
): Promise<PublicUser | null> {
  const user = await findUserByEmail(db, email);
  const passwordHash = user?.passwordHash ?? (await getDummyPasswordHash());
  const valid = await verifyPassword(password, passwordHash);
  if (!user || !valid || !user.active) return null;

  if (needsRehash(user.passwordHash)) {
    // Guarded by the old hash, so a password change that raced this login is not overwritten.
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
      .where(and(eq(users.id, user.id), eq(users.passwordHash, user.passwordHash)));
  }
  return toPublicUser(user);
}
