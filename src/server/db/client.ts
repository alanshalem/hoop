import 'server-only';
import { drizzle, type NodePgDatabase, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
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

export function createDatabase(connectionString: string): DatabaseConnection {
  const pool = new Pool({ connectionString, max: 10 });
  return { db: drizzle(pool, { schema }), pool };
}

// Kept on globalThis so dev hot reloads reuse the pool instead of leaking connections.
const globalForDb = globalThis as typeof globalThis & { hoopDb?: DatabaseConnection };

/**
 * Shared pooled connection for the Next.js server, created on first use from
 * `DATABASE_URL`.
 */
export function getDb(): Database {
  if (!globalForDb.hoopDb) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'DATABASE_URL is not set. Copy .env.example to .env.local and start the database with `npm run db:up`.'
      );
    }
    globalForDb.hoopDb = createDatabase(url);
  }
  return globalForDb.hoopDb.db;
}
