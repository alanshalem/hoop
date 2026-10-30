import type { User, UserRole } from '@/core/domain/entities/club.types';
import type { ApiResult } from '@/core/application/sync/sync-types';

/**
 * =============================================================================
 * HOOP OS - CLIENT AUTH SESSION (S10.8)
 * The session itself is an httpOnly cookie the browser never exposes; the
 * client only caches the public profile so the app also opens offline.
 * =============================================================================
 */

/** `GET /api/auth/me` user: never carries password or session data. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

/** Port implemented by the HTTP adapter (src/core/infrastructure/sync-api). */
export interface AuthApi {
  login(email: string, password: string): Promise<ApiResult<AuthUser>>;
  logout(): Promise<ApiResult<void>>;
  me(): Promise<ApiResult<AuthUser>>;
}

export const LOGIN_PATH = '/login';
export const HOME_PATH = '/';

/**
 * Club user for the authenticated account: name and role always come from the
 * server; the rest of a known user (dates, avatar) is kept.
 */
export function toClubUser(authUser: AuthUser, knownUsers: readonly User[], now: Date = new Date()): User {
  const known = knownUsers.find((user) => user.id === authUser.id);
  const timestamp = now.toISOString();
  return {
    ...(known ?? { createdAt: timestamp, updatedAt: timestamp }),
    id: authUser.id,
    email: authUser.email,
    name: authUser.name,
    role: authUser.role,
  };
}

/** Placeholder origin used only to check that `next` cannot leave the app. */
const APP_ORIGIN = 'http://hoop.local';

/** Browsers strip tabs and newlines from URLs and read `\` as `/`, so "/\t/evil.com" means "//evil.com". */
const UNSAFE_URL_CHARS = /[\x00-\x1F\x7F\\]/;

/**
 * Where to go after logging in: only same-origin app paths (a single leading
 * `/`, no control characters or backslashes), never back to the login screen.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || UNSAFE_URL_CHARS.test(next) || !/^\/(?![/\\])/.test(next)) return HOME_PATH;
  const url = new URL(next, APP_ORIGIN);
  // Dot segments normalize too: "/.//evil.com" resolves to the path "//evil.com",
  // which a full-page navigation reads as a protocol-relative URL.
  if (url.origin !== APP_ORIGIN || url.pathname.startsWith('//')) return HOME_PATH;
  const { pathname } = url;
  if (pathname === LOGIN_PATH || pathname.startsWith(`${LOGIN_PATH}/`)) return HOME_PATH;
  return `${pathname}${url.search}${url.hash}`;
}

/** Login URL that brings the user back to `currentPath` afterwards. */
export function loginRedirectPath(currentPath: string): string {
  const next = safeNextPath(currentPath);
  return next === HOME_PATH ? LOGIN_PATH : `${LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}
