import 'server-only';
import { eq } from 'drizzle-orm';
import type { UserRole } from '@/core/domain/entities/club.types';
import type { DbExecutor } from '../db/client';
import { users, type UserRow } from '../db/schema';

/**
 * The user as exposed outside the server: never includes password data.
 */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export function toPublicUser(row: UserRow): PublicUser {
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findUserByEmail(db: DbExecutor, email: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.email, normalizeEmail(email))).limit(1);
  return row ?? null;
}
