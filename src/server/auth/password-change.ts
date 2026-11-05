import 'server-only';
import { and, eq } from 'drizzle-orm';
import type { DbExecutor } from '../db/client';
import { users } from '../db/schema';
import { hashPassword, verifyPassword } from './password';
import type { PasswordChangeBody } from './password-schema';
import { revokeUserSessions, validateSessionToken } from './session';
import { toPublicUser, type PublicUser } from './users';

export type PasswordChangeResult =
  | { ok: true; user: PublicUser }
  | { ok: false; error: 'UNAUTHENTICATED' | 'WRONG_CURRENT_PASSWORD' };

/**
 * Self-service password change for the owner of `sessionToken` (S3, S5): checks
 * the current password, stores the new one, clears `mustChangePassword` and
 * closes every other session of the user (the current one stays open).
 */
export async function changeOwnPassword(
  db: DbExecutor,
  sessionToken: string,
  { currentPassword, newPassword }: PasswordChangeBody
): Promise<PasswordChangeResult> {
  const sessionUser = await validateSessionToken(db, sessionToken);
  if (!sessionUser) return { ok: false, error: 'UNAUTHENTICATED' };

  const [stored] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);
  if (!stored || !(await verifyPassword(currentPassword, stored.passwordHash))) {
    return { ok: false, error: 'WRONG_CURRENT_PASSWORD' };
  }

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
    return { ok: true, user: toPublicUser(updated) } as const;
  });
}
