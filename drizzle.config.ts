import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config. Run through the npm scripts (`db:generate`, `db:migrate`),
 * which preload scripts/server-runtime.mjs to read `.env.local` / `.env`.
 */
const url = process.env.DATABASE_URL;

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
  // `generate` only diffs the schema; commands that connect need DATABASE_URL.
  ...(url ? { dbCredentials: { url } } : {}),
});
