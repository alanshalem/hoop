import type { UserRole } from '@/core/domain/entities/club.types';
import type { AccountApiResult } from '@/core/application/auth/auth-session';

/**
 * =============================================================================
 * HOOP - USER ADMINISTRATION (S1, S2, S4, S6)
 * The admin screen talks to `/api/users` directly: accounts are not club data
 * and never travel through the sync engine. The server enforces every guard
 * (own account, last admin, unique email) and explains refusals in Spanish.
 * =============================================================================
 */

/** An account as the admin sees it (`GET /api/users`); never carries password data. */
export interface ManagedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /** False once deactivated: it stays listed but cannot log in (S4). */
  active: boolean;
  /** True until the account replaces its temporary password (S2, S3). */
  mustChangePassword: boolean;
  /** ISO 8601. */
  createdAt: string;
}

export interface NewUserInput {
  name: string;
  email: string;
  role: UserRole;
  temporaryPassword: string;
}

/** Fields `PATCH /api/users/[id]` may change; only the ones present are sent. */
export type UserPatch = Partial<Pick<ManagedUser, 'name' | 'email' | 'role' | 'active'>>;

/** Typed refusals of the user administration API (`reason`). */
export type UserAdminReason = 'EMAIL_TAKEN' | 'USER_NOT_FOUND' | 'SELF_DEACTIVATION' | 'SELF_ROLE_CHANGE' | 'LAST_ADMIN';

/** Port implemented by the HTTP adapter (src/core/infrastructure/sync-api). */
export interface UsersApi {
  list(): Promise<AccountApiResult<ManagedUser[]>>;
  /** The new account is active and must change the temporary password (S2). */
  create(input: NewUserInput): Promise<AccountApiResult<ManagedUser>>;
  update(id: string, patch: UserPatch): Promise<AccountApiResult<ManagedUser>>;
  /** Sets a new temporary password and closes every session of the account (S2). */
  resetPassword(id: string, temporaryPassword: string): Promise<AccountApiResult<ManagedUser>>;
}
