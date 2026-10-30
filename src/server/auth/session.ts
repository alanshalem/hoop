import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { DbExecutor } from '../db/client';
import { sessions, users } from '../db/schema';
import { toPublicUser, type PublicUser } from './users';

/**
 * =============================================================================
 * HOOP OS - DATABASE SESSIONS
 * The cookie holds a random 32-byte token; the database stores only its
 * SHA-256, so a leaked sessions table cannot be replayed as cookies.
 * =============================================================================
 */

export const SESSION_COOKIE_NAME = 'hoop_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const TOKEN_BYTES = 32;

export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function getSessionExpiry(now: Date): Date {
  return new Date(now.getTime() + SESSION_TTL_MS);
}

export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: '/';
  expires: Date;
}

export function sessionCookieOptions(
  expiresAt: Date,
  isProduction: boolean = process.env.NODE_ENV === 'production'
): SessionCookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: isProduction, path: '/', expires: expiresAt };
}

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

export async function createSession(db: DbExecutor, userId: string, now: Date = new Date()): Promise<CreatedSession> {
  const token = generateSessionToken();
  const expiresAt = getSessionExpiry(now);
  await db.insert(sessions).values({ id: hashSessionToken(token), userId, expiresAt, createdAt: now });
  return { token, expiresAt };
}

/**
 * Returns the session owner, or null when the token is unknown or expired.
 * Expired rows are deleted on sight.
 */
export async function validateSessionToken(
  db: DbExecutor,
  token: string,
  now: Date = new Date()
): Promise<PublicUser | null> {
  const id = hashSessionToken(token);
  const [row] = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id))
    .limit(1);

  if (!row) return null;
  if (row.expiresAt.getTime() <= now.getTime()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  return toPublicUser(row.user);
}

export async function revokeSession(db: DbExecutor, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashSessionToken(token)));
}
