'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  LOGIN_PATH,
  loginRedirectPath,
  mustChangePasswordAt,
  passwordChangeRedirectPath,
  toClubUser,
  type AuthUser,
} from '@/core/application/auth/auth-session';
import { useAuthStore } from '@/core/application/stores/useAuthStore';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { ClubCrest } from '@/presentation/atoms/ClubCrest/ClubCrest';
import { authApi, getSyncCoordinator } from './sync-runtime';
import { useHydrated } from './useHydrated';
import styles from './SessionProvider.module.css';

const sameUser = (a: AuthUser, b: AuthUser) =>
  a.id === b.id &&
  a.email === b.email &&
  a.name === b.name &&
  a.role === b.role &&
  a.mustChangePassword === b.mustChangePassword;

const currentPath = () => `${window.location.pathname}${window.location.search}`;

/**
 * Client session for every route (S10.8), mounted once in the root layout:
 * - without a cached user, any page other than /login redirects to /login;
 * - with a cached user the app works offline; online, /api/auth/me confirms it
 *   (a 401 clears it and sends the user to /login);
 * - while the user must replace a temporary password, every page other than
 *   /login and /account/password redirects there and sync stays off (S3);
 * - the authenticated user becomes the club store's `currentUser`;
 * - while a user is logged in, the tab coordinator runs the sync engine in one
 *   tab only (S13.3), on sync data claimed by that user (another user's
 *   unsynced changes are discarded first).
 */
export function SessionProvider() {
  const hydrated = useHydrated();
  const user = useAuthStore((state) => state.user);
  const pathname = usePathname();
  const router = useRouter();
  const userId = user?.id ?? null;
  const mustChangePassword = user?.mustChangePassword ?? false;
  const needsLogin = hydrated && !user && pathname !== LOGIN_PATH;
  const needsPasswordChange = hydrated && mustChangePasswordAt(user, pathname);

  useEffect(() => {
    if (!user) return;
    const club = useClubStore.getState();
    club.setCurrentUser(toClubUser(user, club.users));
  }, [user]);

  useEffect(() => {
    // The server refuses sync until the temporary password is replaced (S3).
    if (!userId || mustChangePassword || !useAuthStore.getState().user) return;
    const coordinator = getSyncCoordinator();
    coordinator.start();
    return () => coordinator.stop();
  }, [userId, mustChangePassword]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const validateSession = async () => {
      const result = await authApi.me();
      if (cancelled) return;
      const auth = useAuthStore.getState();
      if (result.ok) {
        if (!auth.user || !sameUser(auth.user, result.value)) auth.setUser(result.value);
      } else if (result.error === 'UNAUTHORIZED') {
        auth.clearUser();
      }
      // Network or server errors keep the cached user: the app keeps working offline.
    };
    void validateSession();
    window.addEventListener('online', validateSession);
    return () => {
      cancelled = true;
      window.removeEventListener('online', validateSession);
    };
  }, [userId]);

  useEffect(() => {
    if (needsLogin) router.replace(loginRedirectPath(currentPath()));
  }, [needsLogin, router]);

  useEffect(() => {
    if (needsPasswordChange) router.replace(passwordChangeRedirectPath(currentPath()));
  }, [needsPasswordChange, router]);

  if (!needsLogin && !needsPasswordChange) return null;
  return (
    <div className={styles.curtain} role="status" aria-live="polite">
      <ClubCrest size={72} eager />
      <p className={styles.message}>
        {needsLogin ? 'Redirigiendo al inicio de sesión...' : 'Redirigiendo al cambio de contraseña...'}
      </p>
    </div>
  );
}
