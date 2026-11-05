import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { UserRoleSchema } from '@/core/domain/entities/club.types';
import type { AuthUser } from '@/core/application/auth/auth-session';

/** v2: the cached user carries `mustChangePassword`. */
export const AUTH_STORE_VERSION = 2;

interface AuthPersistedData {
  /** Last authenticated profile, so the app opens offline. Never a token. */
  user: AuthUser | null;
}

export interface AuthStoreState extends AuthPersistedData {
  setUser: (user: AuthUser) => void;
  clearUser: () => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** A v1 profile: the public user before `mustChangePassword` existed. */
function v1User(value: unknown): AuthUser | null {
  if (!isRecord(value)) return null;
  const { id, email, name, role, mustChangePassword } = value;
  if (typeof id !== 'string' || typeof email !== 'string' || typeof name !== 'string') return null;
  const parsedRole = UserRoleSchema.safeParse(role);
  if (!parsedRole.success) return null;
  return { id, email, name, role: parsedRole.data, mustChangePassword: mustChangePassword === true };
}

/**
 * A v1 cached user stays logged in, without the flag unless it already had it:
 * the next `/api/auth/me` brings the real value. An unknown profile shape means
 * logging in again.
 */
export function migrateAuthState(persisted: unknown, version: number): AuthPersistedData {
  if (version === AUTH_STORE_VERSION) return persisted as AuthPersistedData;
  if (version === 1 && isRecord(persisted)) return { user: v1User(persisted.user) };
  return { user: null };
}

export const useAuthStore = create<AuthStoreState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      clearUser: () => set({ user: null }),
    }),
    {
      name: 'hoop-auth-storage',
      version: AUTH_STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): AuthPersistedData => ({ user: state.user }),
      migrate: migrateAuthState,
    }
  )
);
