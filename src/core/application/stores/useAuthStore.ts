import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthUser } from '@/core/application/auth/auth-session';

export const AUTH_STORE_VERSION = 1;

interface AuthPersistedData {
  /** Last authenticated profile, so the app opens offline. Never a token. */
  user: AuthUser | null;
}

export interface AuthStoreState extends AuthPersistedData {
  setUser: (user: AuthUser) => void;
  clearUser: () => void;
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
      // An unknown profile shape means logging in again.
      migrate: (persisted, version): AuthPersistedData =>
        version === AUTH_STORE_VERSION ? (persisted as AuthPersistedData) : { user: null },
    }
  )
);
