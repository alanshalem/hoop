import 'server-only';
import { eq, ne } from 'drizzle-orm';
import { normalizeEmail } from '../auth/users';
import type { Database } from '../db/client';
import { matchEvents, sessions, syncRecords, users } from '../db/schema';
import { rotateDataEpoch } from '../sync/epoch';
import type { SyncRecordKind } from '../sync/record-kinds';
import { validRecordWrite } from '../sync/records';
import {
  insertRecordsIfNew,
  lockSyncWrites,
  notifySyncChanged,
  readCurrentCursor,
  type RecordWrite,
} from '../sync/repository';
import type { ActaImport } from './acta-parser';

/**
 * =============================================================================
 * HOOP OS - REPLACE ALL DATA WITH THE MATCH REPORTS (S1, S2)
 * One transaction under the sync write lock: every record, event, session and
 * account except the kept administrator is deleted, the data epoch rotates (so
 * no browser can push old data back, L5) and the report records are inserted.
 * `sync_seq` continues: new rows get higher seqs than anything clients hold.
 * =============================================================================
 */

/** The only account kept by the wipe (L2); its password is never changed. */
export const KEPT_ACCOUNT_EMAIL = 'admin@camg.com.ar';

export interface WipeImportOptions {
  now: Date;
  keepEmail?: string;
}

export interface WipeImportSummary {
  keptAccount: string;
  deleted: { users: number; sessions: number; records: number; events: number };
  inserted: Partial<Record<SyncRecordKind, number>>;
  /** The new data epoch. */
  epoch: string;
  /** Sync cursor after the import (also sent as the `hoop_sync` notification). */
  cursor: string;
}

/** The import as validated record writes (same schemas as a push), in dependency order. */
export function actaImportRecords(data: ActaImport, now: Date): RecordWrite[] {
  return [
    validRecordWrite('division', data.division, now),
    validRecordWrite('team', data.team, now),
    ...data.coaches.map((coach) => validRecordWrite('coach', coach, now)),
    ...data.players.map((player) => validRecordWrite('player', player, now)),
    ...data.rivalTeams.map((team) => validRecordWrite('rivalTeam', team, now)),
    ...data.matches.map((match) => validRecordWrite('match', match, now)),
  ];
}

/**
 * Wipes the server data and loads the reports. Throws, changing nothing, when
 * the kept account does not exist or a record is invalid.
 */
export async function wipeAndImportActas(
  db: Database,
  data: ActaImport,
  { now, keepEmail = KEPT_ACCOUNT_EMAIL }: WipeImportOptions
): Promise<WipeImportSummary> {
  const keptAccount = normalizeEmail(keepEmail);
  const records = actaImportRecords(data, now);

  return db.transaction(async (tx) => {
    await lockSyncWrites(tx);
    const [kept] = await tx.select({ id: users.id }).from(users).where(eq(users.email, keptAccount));
    if (!kept) throw new Error(`The account ${keptAccount} does not exist: nothing was changed.`);

    const events = await tx.delete(matchEvents);
    const deletedRecords = await tx.delete(syncRecords);
    const deletedSessions = await tx.delete(sessions);
    const deletedUsers = await tx.delete(users).where(ne(users.id, kept.id));
    const epoch = await rotateDataEpoch(tx);

    const inserted: WipeImportSummary['inserted'] = {};
    for (const row of await insertRecordsIfNew(tx, records)) inserted[row.kind] = (inserted[row.kind] ?? 0) + 1;
    const cursor = await readCurrentCursor(tx);
    await notifySyncChanged(tx, cursor);

    return {
      keptAccount,
      deleted: {
        users: deletedUsers.rowCount ?? 0,
        sessions: deletedSessions.rowCount ?? 0,
        records: deletedRecords.rowCount ?? 0,
        events: events.rowCount ?? 0,
      },
      inserted,
      epoch,
      cursor,
    };
  });
}
