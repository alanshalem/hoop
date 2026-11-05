import 'server-only';
import { eq, inArray } from 'drizzle-orm';
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
  /** The demo accounts as stored after the seed (an existing account keeps its profile). */
  accounts: { email: string; name: string; role: UserRole }[];
  /** Emails of missing demo accounts not created because another account already uses them. */
  skippedAccounts: string[];
  recordsInserted: number;
  eventsInserted: number;
}

/**
 * Loads the shared demo club (`createSeedState`) and the demo users.
 *
 * Idempotent: a missing demo user is inserted, while an existing one (by id)
 * keeps its name, email, role, `active` and `mustChangePassword`; only its
 * password is reset to the demo one (an existing hash is kept when it still
 * matches the demo password with the current cost). A missing demo user whose
 * email another account already uses is skipped and reported. Records and
 * events are insert-only: an id that already exists is never rewritten, so
 * re-running the seed cannot overwrite user edits or resurrect a deleted
 * (tombstoned) entity. Only demo entities missing from the database are added.
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
    for (const row of userRows.filter((row) => existingHashes.has(row.id))) {
      await tx.update(users).set({ passwordHash: row.passwordHash, updatedAt: now }).where(eq(users.id, row.id));
    }
    const missing = userRows.filter((row) => !existingHashes.has(row.id));
    // Without a conflict target, an email already used by another account skips the row instead of failing.
    if (missing.length > 0) await tx.insert(users).values(missing).onConflictDoNothing();
    const insertedRecords = await insertRecordsIfNew(tx, records);
    const insertedEvents = await insertEventsIfNew(tx, events);

    const stored = await tx
      .select({ id: users.id, email: users.email, name: users.name, role: users.role })
      .from(users)
      .where(inArray(users.id, userRows.map((row) => row.id)));
    const storedById = new Map(stored.map(({ id, ...account }) => [id, account]));

    return {
      accounts: userRows.flatMap((row) => storedById.get(row.id) ?? []),
      skippedAccounts: userRows.filter((row) => !storedById.has(row.id)).map((row) => row.email),
      recordsInserted: insertedRecords.length,
      eventsInserted: insertedEvents.length,
    };
  });
}
