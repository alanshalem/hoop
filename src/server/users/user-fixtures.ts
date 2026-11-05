import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, like } from 'drizzle-orm';
import type { UserRole } from '@/core/domain/entities/club.types';
import { hashPassword } from '../auth/password';
import type { DbExecutor } from '../db/client';
import { sessions, users } from '../db/schema';

/** The password of every account inserted by the fixtures. */
export const FIXTURE_PASSWORD = 'secret-1922';

/**
 * Account helpers shared by the user administration DB tests. Every row gets an
 * id (and email) starting with `prefix`, so `removeAll` cleans up after the file.
 */
export function createUserFixtures(db: () => DbExecutor, prefix: string) {
  let passwordHash: Promise<string> | undefined;

  async function insertUser(
    role: UserRole,
    overrides: { active?: boolean; name?: string; mustChangePassword?: boolean } = {}
  ) {
    const id = `${prefix}-${randomUUID()}`;
    const row = {
      id,
      email: `${id}@test.camg.com.ar`,
      name: overrides.name ?? `Usuario ${id}`,
      role,
      passwordHash: await (passwordHash ??= hashPassword(FIXTURE_PASSWORD)),
      active: overrides.active ?? true,
      mustChangePassword: overrides.mustChangePassword ?? false,
    };
    await db().insert(users).values(row);
    return { id, email: row.email, name: row.name, role, mustChangePassword: row.mustChangePassword };
  }

  async function storedUser(id: string) {
    const [row] = await db().select().from(users).where(eq(users.id, id));
    return row;
  }

  async function sessionCount(userId: string): Promise<number> {
    return (await db().select().from(sessions).where(eq(sessions.userId, userId))).length;
  }

  /**
   * Runs `body` while the given users are the only active admins of the test
   * database: every other active admin is deactivated and restored afterwards.
   */
  async function withOnlyAdmins(ids: string[], body: () => Promise<void>): Promise<void> {
    const others = await db()
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, 'ADMIN'), eq(users.active, true)));
    const otherIds = others.map((row) => row.id).filter((id) => !ids.includes(id));
    if (otherIds.length > 0) await db().update(users).set({ active: false }).where(inArray(users.id, otherIds));
    try {
      await body();
    } finally {
      if (otherIds.length > 0) await db().update(users).set({ active: true }).where(inArray(users.id, otherIds));
    }
  }

  /** Deletes every account of `prefix` (by id, and by email for accounts created through the service). */
  async function removeAll(): Promise<void> {
    await db().delete(users).where(like(users.id, `${prefix}%`));
    await db().delete(users).where(like(users.email, `${prefix}%`));
  }

  return { insertUser, storedUser, sessionCount, withOnlyAdmins, removeAll };
}
