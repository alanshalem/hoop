import 'server-only';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
// Relative imports (not `@/`): drizzle-kit loads this file outside the Next.js resolver.
import { UserRoleSchema } from '../../core/domain/entities/club.types';
import { SYNC_RECORD_KINDS } from '../../core/application/sync/record-kinds';

/**
 * =============================================================================
 * HOOP - DATABASE SCHEMA (PostgreSQL, Drizzle)
 * Change it, then run `npm run db:generate` to create the next SQL migration.
 * =============================================================================
 */

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/**
 * Single global change sequence. Every accepted write to `sync_records` or
 * `match_events` takes the next value, so clients pull with one cursor.
 */
export const syncSeq = pgSequence('sync_seq');

const seq = () =>
  bigint('seq', { mode: 'number' })
    .notNull()
    .default(sql`nextval('sync_seq')`);

export const userRole = pgEnum('user_role', UserRoleSchema.enum);
export const syncRecordKind = pgEnum('sync_record_kind', SYNC_RECORD_KINDS);

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    role: userRole('role').notNull(),
    passwordHash: text('password_hash').notNull(),
    /** Deactivated accounts stay listed but cannot log in or use a session (S4). */
    active: boolean('active').notNull().default(true),
    /** Set by the admin's temporary passwords; sync is refused until the user picks a new one (S2, S3). */
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('users_email_key').on(table.email),
    check('users_email_lowercase', sql`${table.email} = lower(${table.email})`),
  ]
);

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 (hex) of the session token; the raw token only lives in the cookie. */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)]
);

export const syncRecords = pgTable(
  'sync_records',
  {
    kind: syncRecordKind('kind').notNull(),
    id: text('id').notNull(),
    /** Entity validated with the domain zod schema. Matches never embed events. */
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    /** Client change time; last-write-wins compares this value. */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    deleted: boolean('deleted').notNull().default(false),
    /**
     * Live match records only: field -> ISO time of its last change, merged field
     * by field (S13.1). NULL (other kinds, tombstones, older rows) means every
     * field changed at `updated_at`.
     */
    fieldVersions: jsonb('field_versions').$type<Record<string, string>>(),
    seq: seq(),
  },
  (table) => [
    primaryKey({ columns: [table.kind, table.id] }),
    index('sync_records_seq_idx').on(table.seq),
  ]
);

export const matchEvents = pgTable(
  'match_events',
  {
    id: text('id').primaryKey(),
    matchId: text('match_id').notNull(),
    /** Play-by-play event validated with PlayByPlayEventSchema. */
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    deleted: boolean('deleted').notNull().default(false),
    seq: seq(),
  },
  (table) => [
    index('match_events_seq_idx').on(table.seq),
    index('match_events_match_id_idx').on(table.matchId),
  ]
);

/**
 * Server-wide sync settings by key. `data_epoch` identifies the current server
 * data: replacing the data (report import) rotates it, pulls return it and a
 * push made on other data is refused (S1, L5). The migration creates it.
 */
export const syncMeta = pgTable('sync_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type SyncRecordRow = typeof syncRecords.$inferSelect;
export type MatchEventRow = typeof matchEvents.$inferSelect;
