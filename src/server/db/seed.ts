import 'server-only';
import { inArray, sql } from 'drizzle-orm';
import type { UserRole } from '@/core/domain/entities/club.types';
import { createSeedState } from '@/core/infrastructure/mocks/seed-data';
import { hashPassword, needsRehash, verifyPassword } from '../auth/password';
import { normalizeEmail } from '../auth/users';
import { parseEventData, validRecordWrite } from '../sync/records';
import {
  insertEventsIfNew,
  insertRecordsIfNew,
  lockSyncWrites,
  type EventWrite,
  type RecordWrite,
} from '../sync/repository';
import type { Database } from './client';
import { users } from './schema';

/** Documented default for `SEED_DEMO_PASSWORD` (see .env.example). */
export const DEFAULT_SEED_DEMO_PASSWORD = 'camg1922';

export interface SeedOptions {
  now: Date;
  demoPassword: string;
}

export interface SeedSummary {
  accounts: { email: string; name: string; role: UserRole }[];
  recordsInserted: number;
  eventsInserted: number;
}

/**
 * Loads the shared demo club (`createSeedState`) and the demo users.
 *
 * Idempotent: users are upserted by id (an existing hash is kept when it still
 * matches the demo password with the current cost), while records and events
 * are insert-only: an id that already exists is never rewritten, so re-running
 * the seed cannot overwrite user edits or resurrect a deleted (tombstoned)
 * entity. Only demo entities missing from the database are added.
 */
export async function seedDatabase(db: Database, { now, demoPassword }: SeedOptions): Promise<SeedSummary> {
  const seed = createSeedState(now);

  const existing = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(inArray(users.id, seed.users.map((user) => user.id)));
  const existingHashes = new Map(existing.map((row) => [row.id, row.passwordHash]));

  const userRows = await Promise.all(
    seed.users.map(async (user) => {
      const stored = existingHashes.get(user.id);
      const passwordHash =
        stored && !needsRehash(stored) && (await verifyPassword(demoPassword, stored))
          ? stored
          : await hashPassword(demoPassword);
      return {
        id: user.id,
        email: normalizeEmail(user.email),
        name: user.name,
        role: user.role,
        passwordHash,
        createdAt: new Date(user.createdAt),
        updatedAt: now,
      };
    })
  );

  const records: RecordWrite[] = [
    ...seed.divisions.map((division) => validRecordWrite('division', division, now)),
    ...seed.teams.map((team) => validRecordWrite('team', team, now)),
    ...seed.players.map((player) => validRecordWrite('player', player, now)),
    ...seed.matches.map((match) => validRecordWrite('match', match, now)),
    ...seed.rivalTeams.map((team) => validRecordWrite('rivalTeam', team, now)),
  ];

  const events: EventWrite[] = seed.matches.flatMap((match) =>
    match.events.map((event) => {
      const parsed = parseEventData(event.id, match.id, event);
      if (!parsed.ok) throw new Error(`Seed event ${event.id} is invalid: ${parsed.reason}`);
      return { id: event.id, matchId: match.id, data: parsed.value, deleted: false };
    })
  );

  return db.transaction(async (tx) => {
    // Seq values must commit in order, like sync pushes (see ../sync/repository.ts).
    await lockSyncWrites(tx);
    await tx
      .insert(users)
      .values(userRows)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: sql`excluded.email`,
          name: sql`excluded.name`,
          role: sql`excluded.role`,
          passwordHash: sql`excluded.password_hash`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
    const insertedRecords = await insertRecordsIfNew(tx, records);
    const insertedEvents = await insertEventsIfNew(tx, events);

    return {
      accounts: userRows.map(({ email, name, role }) => ({ email, name, role })),
      recordsInserted: insertedRecords.length,
      eventsInserted: insertedEvents.length,
    };
  });
}
