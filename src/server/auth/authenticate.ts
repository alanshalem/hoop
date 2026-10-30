import 'server-only';
import { and, eq } from 'drizzle-orm';
import type { DbExecutor } from '../db/client';
import { users } from '../db/schema';
import { getDummyPasswordHash, hashPassword, needsRehash, verifyPassword } from './password';
import { findUserByEmail, toPublicUser, type PublicUser } from './users';

/**
 * Checks email + password. Unknown emails still run a full scrypt verification
 * against a dummy hash, so both failure paths cost the same time.
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
  if (!user || !valid) return null;

  if (needsRehash(user.passwordHash)) {
    // Guarded by the old hash, so a password change that raced this login is not overwritten.
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
      .where(and(eq(users.id, user.id), eq(users.passwordHash, user.passwordHash)));
  }
  return toPublicUser(user);
}
