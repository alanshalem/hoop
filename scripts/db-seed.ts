/**
 * `npm run db:seed` - loads the demo club and demo users into PostgreSQL.
 * Safe to run repeatedly. Prints the demo accounts; never prints hashes.
 */
import { USER_ROLE_LABELS } from '@/core/domain/entities/club.types';
import { createDatabase } from '@/server/db/client';
import { DEFAULT_SEED_DEMO_PASSWORD, seedDatabase } from '@/server/db/seed';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env.local, then run `npm run db:up`.');
    process.exitCode = 1;
    return;
  }

  const usesDefaultPassword = !process.env.SEED_DEMO_PASSWORD;
  const demoPassword = process.env.SEED_DEMO_PASSWORD || DEFAULT_SEED_DEMO_PASSWORD;

  const { db, pool } = createDatabase(url);
  try {
    const summary = await seedDatabase(db, { now: new Date(), demoPassword });
    console.log(`Seed complete: ${summary.recordsWritten} records written, ${summary.eventsInserted} new events.`);
    console.log(
      usesDefaultPassword
        ? 'Demo accounts (password: the documented default from .env.example):'
        : 'Demo accounts (password: the value of SEED_DEMO_PASSWORD):'
    );
    for (const account of summary.accounts) {
      console.log(`  ${account.email.padEnd(28)} ${account.role.padEnd(24)} ${USER_ROLE_LABELS[account.role]}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exitCode = 1;
});
