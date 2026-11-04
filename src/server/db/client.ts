import 'server-only';
import { drizzle, type NodePgDatabase, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import { logServerError } from '../http/log-server-error';
import * as schema from './schema';

export type Schema = typeof schema;
export type Database = NodePgDatabase<Schema>;

/**
 * A database handle or an open transaction. Data-access functions take this,
 * so callers decide whether several writes share one transaction.
 */
export type DbExecutor = PgDatabase<NodePgQueryResultHKT, Schema>;

export interface DatabaseConnection {
  db: Database;
  pool: Pool;
}

/**
 * Connections per server instance (S4). Serverless hosting runs many small
 * instances at once and Supabase's free pooler has few connections, so each
 * instance keeps a small pool. `DATABASE_POOL_MAX` overrides it.
 */
export const DEFAULT_POOL_MAX = 3;
/** Idle connections close soon, so a frozen serverless instance holds none for long. */
export const POOL_IDLE_TIMEOUT_MS = 10_000;

/** `DATABASE_POOL_MAX` as a pool size; unset or empty means DEFAULT_POOL_MAX. */
export function readPoolMax(value: string | undefined): number {
  if (value === undefined || value === '') return DEFAULT_POOL_MAX;
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new Error(`DATABASE_POOL_MAX must be a positive integer (got "${value}").`);
  }
  return Number(value);
}

/**
 * Opens a lazy pool (no connection until the first query). Nothing keeps session
 * state between statements (the sync write lock is transaction-scoped), so the
 * URL may point at a transaction-mode pooler such as Supabase's.
 */
export function createDatabase(
  connectionString: string,
  { max = DEFAULT_POOL_MAX }: { max?: number } = {}
): DatabaseConnection {
  const pool = new Pool({ connectionString, max, idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS });
  // A pooler or the database may drop an idle connection; without a listener that error kills the process.
  pool.on('error', (error) => logServerError('db/pool idle client', error));
  return { db: drizzle(pool, { schema }), pool };
}

// One pool per server instance: kept on globalThis so warm serverless invocations
// and dev hot reloads reuse it instead of opening new connections.
const globalForDb = globalThis as typeof globalThis & { hoopDb?: DatabaseConnection };

/**
 * Shared pooled connection for the Next.js server, created on first use from
 * `DATABASE_URL` (size: `DATABASE_POOL_MAX`).
 */
export function getDb(): Database {
  if (!globalForDb.hoopDb) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'DATABASE_URL is not set. Copy .env.example to .env.local and start the database with `npm run db:up`.'
      );
    }
    globalForDb.hoopDb = createDatabase(url, { max: readPoolMax(process.env.DATABASE_POOL_MAX) });
  }
  return globalForDb.hoopDb.db;
}
