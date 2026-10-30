import 'server-only';
import type { DbExecutor } from '../db/client';
import { getDummyPasswordHash, verifyPassword } from './password';
import { findUserByEmail, toPublicUser, type PublicUser } from './users';

/**
 * Checks email + password. Unknown emails still run a full scrypt verification
 * against a dummy hash, so both failure paths cost the same time.
 */
export async function authenticateUser(
  db: DbExecutor,
  email: string,
  password: string
): Promise<PublicUser | null> {
  const user = await findUserByEmail(db, email);
  const passwordHash = user?.passwordHash ?? (await getDummyPasswordHash());
  const valid = await verifyPassword(password, passwordHash);
  return user && valid ? toPublicUser(user) : null;
}
