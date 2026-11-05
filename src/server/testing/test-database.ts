import 'server-only';
import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';
import { createDatabase, type DatabaseConnection } from '../db/client';

/**
 * Opens the database used by `*.db.test.ts` (run with `npm run test:db`):
 * `TEST_DATABASE_URL`, or `DATABASE_URL` with `_test` appended to the database
 * name, so integration tests never touch the development data. The database is
 * created if missing and migrated to the latest schema.
 *
 * With `name`, the file gets a database of its own (`<test database>_<name>`),
 * for tests that change state other files rely on, such as which admins are
 * active. Give each such file its own name.
 */
export async function openTestDatabase({ name }: { name?: string } = {}): Promise<DatabaseConnection> {
  const url = resolveTestDatabaseUrl();
  if (name !== undefined) url.pathname = `${url.pathname}_${name}`;
  await ensureDatabaseExists(url);
  const connection = createDatabase(url.toString());
  await migrate(connection.db, { migrationsFolder: path.resolve(process.cwd(), 'drizzle') });
  return connection;
}

function resolveTestDatabaseUrl(): URL {
  if (process.env.TEST_DATABASE_URL) return new URL(process.env.TEST_DATABASE_URL);
  if (!process.env.DATABASE_URL) {
    throw new Error('Set TEST_DATABASE_URL or DATABASE_URL to run the DB tests (see .env.example).');
  }
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `${url.pathname}_test`;
  return url;
}

async function ensureDatabaseExists(url: URL): Promise<void> {
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Unsupported test database name: ${name}`);

  const maintenance = new URL(url);
  maintenance.pathname = '/postgres';
  const client = new Client({ connectionString: maintenance.toString() });
  await client.connect();
  try {
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (found.rowCount === 0) await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
}
