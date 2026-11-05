import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import type { UserRole } from '@/core/domain/entities/club.types';
import { hashPassword } from '../auth/password';
import { revokeUserSessions } from '../auth/session';
import { normalizeEmail } from '../auth/users';
import type { DbExecutor } from '../db/client';
import { users, type UserRow } from '../db/schema';
import type { CreateUserBody, UpdateUserBody } from './schemas';

/**
 * =============================================================================
 * HOOP - USER ADMINISTRATION (S1, S2, S4, S6)
 * Accounts are never deleted: they are deactivated. Every rule the admin screen
 * shows is enforced here, inside one transaction per change.
 * =============================================================================
 */

/** An account as the admin sees it: never includes password data. */
export interface ManagedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  mustChangePassword: boolean;
  /** ISO 8601. */
  createdAt: string;
}

export type UserAdminError = 'EMAIL_TAKEN' | 'USER_NOT_FOUND' | 'SELF_DEACTIVATION' | 'SELF_ROLE_CHANGE' | 'LAST_ADMIN';

export type UserAdminResult = { ok: true; user: ManagedUser } | { ok: false; error: UserAdminError };

const fail = (error: UserAdminError): UserAdminResult => ({ ok: false, error });

export function toManagedUser(row: UserRow): ManagedUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    active: row.active,
    mustChangePassword: row.mustChangePassword,
    createdAt: row.createdAt.toISOString(),
  };
}

const EMAIL_UNIQUE_CONSTRAINT = 'users_email_key';

/** A unique violation of the email index, raised directly by pg or wrapped by drizzle. */
function isEmailTaken(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    const { code, constraint } = current as Error & { code?: unknown; constraint?: unknown };
    if (code === '23505' && constraint === EMAIL_UNIQUE_CONSTRAINT) return true;
  }
  return false;
}

/** Every account, sorted by name. */
export async function listUsers(db: DbExecutor): Promise<ManagedUser[]> {
  const rows = await db.select().from(users).orderBy(asc(users.name), asc(users.email));
  return rows.map(toManagedUser);
}

/** A new active account that must replace its temporary password at the next login (S2). */
export async function createUser(
  db: DbExecutor,
  { name, email, role, temporaryPassword }: CreateUserBody
): Promise<UserAdminResult> {
  const passwordHash = await hashPassword(temporaryPassword);
  try {
    const [row] = await db
      .insert(users)
      .values({
        id: randomUUID(),
        email: normalizeEmail(email),
        name,
        role,
        passwordHash,
        active: true,
        mustChangePassword: true,
      })
      .returning();
    return { ok: true, user: toManagedUser(row) };
  } catch (error) {
    if (isEmailTaken(error)) return fail('EMAIL_TAKEN');
    throw error;
  }
}

/**
 * Edits name, email, role or active state (S4, S6). An admin cannot deactivate
 * or change the role of their own account, and the last active ADMIN is never
 * deactivated or demoted. Deactivating closes every session of the account.
 *
 * The active ADMIN rows are locked (in id order, before the target row) when
 * the role or the active state may change, so two concurrent changes cannot
 * both see "another admin remains" and leave the club without one.
 */
export async function updateUser(
  db: DbExecutor,
  actor: { id: string },
  userId: string,
  patch: UpdateUserBody
): Promise<UserAdminResult> {
  try {
    return await db.transaction(async (tx) => {
      const mayLeaveAdmins = patch.role !== undefined || patch.active !== undefined;
      const activeAdmins = mayLeaveAdmins
        ? await tx
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.role, 'ADMIN'), eq(users.active, true)))
            .orderBy(asc(users.id))
            .for('no key update')
        : [];

      const [target] = await tx.select().from(users).where(eq(users.id, userId)).for('no key update');
      if (!target) return fail('USER_NOT_FOUND');

      const deactivating = patch.active === false && target.active;
      const changingRole = patch.role !== undefined && patch.role !== target.role;
      if (target.id === actor.id && deactivating) return fail('SELF_DEACTIVATION');
      if (target.id === actor.id && changingRole) return fail('SELF_ROLE_CHANGE');

      const leavesAdmins = target.role === 'ADMIN' && target.active && (deactivating || changingRole);
      if (leavesAdmins && !activeAdmins.some((admin) => admin.id !== target.id)) return fail('LAST_ADMIN');

      const [row] = await tx
        .update(users)
        .set({
          ...(patch.name !== undefined && { name: patch.name }),
          ...(patch.email !== undefined && { email: normalizeEmail(patch.email) }),
          ...(patch.role !== undefined && { role: patch.role }),
          ...(patch.active !== undefined && { active: patch.active }),
          updatedAt: new Date(),
        })
        .where(eq(users.id, target.id))
        .returning();
      if (deactivating) await revokeUserSessions(tx, target.id);
      return { ok: true, user: toManagedUser(row) };
    });
  } catch (error) {
    if (isEmailTaken(error)) return fail('EMAIL_TAKEN');
    throw error;
  }
}

/**
 * Sets a new temporary password (S2): the account must change it at the next
 * login and every one of its sessions closes, including the caller's own when
 * an admin resets their own password.
 */
export async function resetUserPassword(
  db: DbExecutor,
  userId: string,
  temporaryPassword: string
): Promise<UserAdminResult> {
  const passwordHash = await hashPassword(temporaryPassword);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(users)
      .set({ passwordHash, mustChangePassword: true, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    if (!row) return fail('USER_NOT_FOUND');
    await revokeUserSessions(tx, row.id);
    return { ok: true, user: toManagedUser(row) };
  });
}
