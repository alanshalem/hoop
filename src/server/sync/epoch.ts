import 'server-only';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { DbExecutor } from '../db/client';
import { syncMeta } from '../db/schema';

/**
 * =============================================================================
 * HOOP - SERVER DATA EPOCH (S1, L5)
 * Identifies the current server data. Replacing it (the report import wipes
 * every record) rotates the epoch; pulls return it and a push must carry it, so
 * a browser that still holds the old data or an old outbox can never write it
 * back: its push is refused and it reloads a snapshot.
 * =============================================================================
 */

const DATA_EPOCH_KEY = 'data_epoch';

/** The current epoch. The migration that creates `sync_meta` stores the first one. */
export async function readDataEpoch(db: DbExecutor): Promise<string> {
  const [row] = await db.select({ value: syncMeta.value }).from(syncMeta).where(eq(syncMeta.key, DATA_EPOCH_KEY));
  if (!row) throw new Error('The sync data epoch is missing: run `npm run db:migrate`.');
  return row.value;
}

/**
 * Starts a new epoch and returns it. Call it inside the transaction that
 * replaces the data, after `lockSyncWrites`, so no push lands in between.
 */
export async function rotateDataEpoch(tx: DbExecutor): Promise<string> {
  const epoch = randomUUID();
  await tx
    .insert(syncMeta)
    .values({ key: DATA_EPOCH_KEY, value: epoch })
    .onConflictDoUpdate({ target: syncMeta.key, set: { value: epoch } });
  return epoch;
}
