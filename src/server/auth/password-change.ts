import 'server-only';
import { and, eq } from 'drizzle-orm';
import type { DbExecutor } from '../db/client';
import { users } from '../db/schema';
import { hashPassword, verifyPassword } from './password';
import type { PasswordChangeBody } from './password-schema';
import { revokeUserSessions, validateSessionToken } from './session';
import { THROTTLE_LIMITS, clearThrottle, isThrottled, recordFailure, throttleKey } from './throttle';
import { toPublicUser, type PublicUser } from './users';

export type PasswordChangeError = 'UNAUTHENTICATED' | 'WRONG_CURRENT_PASSWORD' | 'SAME_PASSWORD' | 'TOO_MANY_ATTEMPTS';

export type PasswordChangeResult = { ok: true; user: PublicUser } | { ok: false; error: PasswordChangeError };

/**
 * Self-service password change for the owner of `sessionToken` (S3, S5): checks
 * the current password, stores the new one, clears `mustChangePassword` and
 * closes every other session of the user (the current one stays open). Keeping
 * the current password is refused, so a temporary password cannot stay in use.
 *
 * After 5 wrong current passwords within 15 minutes the user is refused for 15
 * minutes before any check (S2); a successful change clears the counter.
 */
export async function changeOwnPassword(
  db: DbExecutor,
  sessionToken: string,
  { currentPassword, newPassword }: PasswordChangeBody
): Promise<PasswordChangeResult> {
  const sessionUser = await validateSessionToken(db, sessionToken);
  if (!sessionUser) return { ok: false, error: 'UNAUTHENTICATED' };

  const throttle = throttleKey.passwordChange(sessionUser.id);
  if (await isThrottled(db, [throttle])) return { ok: false, error: 'TOO_MANY_ATTEMPTS' };

  const [stored] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);
  if (!stored || !(await verifyPassword(currentPassword, stored.passwordHash))) {
    await recordFailure(db, throttle, THROTTLE_LIMITS.passwordChange);
    return { ok: false, error: 'WRONG_CURRENT_PASSWORD' };
  }
  if (newPassword === currentPassword) return { ok: false, error: 'SAME_PASSWORD' };

  const passwordHash = await hashPassword(newPassword);
  return db.transaction(async (tx) => {
    // Guarded by the verified hash: a reset or another change in between makes this one fail.
    const [updated] = await tx
      .update(users)
      .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
      .where(and(eq(users.id, sessionUser.id), eq(users.passwordHash, stored.passwordHash), eq(users.active, true)))
      .returning();
    if (!updated) return { ok: false, error: 'WRONG_CURRENT_PASSWORD' } as const;

    await revokeUserSessions(tx, updated.id, sessionToken);
    await clearThrottle(tx, throttle);
    return { ok: true, user: toPublicUser(updated) } as const;
  });
}
