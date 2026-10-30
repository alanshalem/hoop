import 'server-only';
import { inArray, sql } from 'drizzle-orm';
import type { UserRole } from '@/core/domain/entities/club.types';
import { createSeedState } from '@/core/infrastructure/mocks/seed-data';
import { hashPassword, verifyPassword } from '../auth/password';
import { normalizeEmail } from '../auth/users';
import type { SyncRecordKind } from '../sync/record-kinds';
import { parseEventData, parseRecordData } from '../sync/records';
import { insertEventsIfNew, upsertRecordsLww, type EventWrite, type RecordWrite } from '../sync/repository';
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
  recordsWritten: number;
  eventsInserted: number;
}

function validRecord(kind: SyncRecordKind, entity: { id: string }, now: Date): RecordWrite {
  const parsed = parseRecordData(kind, entity.id, entity);
  if (!parsed.ok) throw new Error(`Seed ${kind} ${entity.id} is invalid: ${parsed.reason}`);
  return { kind, id: entity.id, data: parsed.value, updatedAt: now, deleted: false };
}

/**
 * Loads the shared demo club (`createSeedState`) and the demo users.
 *
 * Idempotent: users are upserted by id (an existing hash is kept when it still
 * matches the demo password), records go through the same last-write-wins
 * upsert as sync with `updatedAt = now` (re-running later restores the demo
 * entities; entities created by users are untouched), and events are
 * append-only (existing event ids are never rewritten).
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
        stored && (await verifyPassword(demoPassword, stored)) ? stored : await hashPassword(demoPassword);
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
    ...seed.divisions.map((division) => validRecord('division', division, now)),
    ...seed.teams.map((team) => validRecord('team', team, now)),
    ...seed.players.map((player) => validRecord('player', player, now)),
    ...seed.matches.map((match) => validRecord('match', match, now)),
  ];

  const events: EventWrite[] = seed.matches.flatMap((match) =>
    match.events.map((event) => {
      const parsed = parseEventData(event.id, match.id, event);
      if (!parsed.ok) throw new Error(`Seed event ${event.id} is invalid: ${parsed.reason}`);
      return { id: event.id, matchId: match.id, data: parsed.value, deleted: false };
    })
  );

  return db.transaction(async (tx) => {
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
    const writtenRecords = await upsertRecordsLww(tx, records);
    const insertedEvents = await insertEventsIfNew(tx, events);

    return {
      accounts: userRows.map(({ email, name, role }) => ({ email, name, role })),
      recordsWritten: writtenRecords.length,
      eventsInserted: insertedEvents.length,
    };
  });
}
