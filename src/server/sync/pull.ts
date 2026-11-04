import 'server-only';
import type { Database } from '../db/client';
import { readDataEpoch } from './epoch';
import type { SyncRecordKind } from '@/core/application/sync/record-kinds';
import { listEventsSince, listRecordsSince } from './repository';

export const PULL_PAGE_SIZE = 1000;

export interface PulledRecord {
  kind: SyncRecordKind;
  id: string;
  data: Record<string, unknown>;
  /** ISO 8601 (UTC) client change time used for last-write-wins. */
  updatedAt: string;
  deleted: boolean;
  /** Live match records (S13.1): field -> ISO change time. Null: every field changed at `updatedAt`. */
  fieldVersions: Record<string, string> | null;
}

export interface PulledEvent {
  id: string;
  matchId: string;
  data: Record<string, unknown>;
  deleted: boolean;
}

export interface PullResult {
  records: PulledRecord[];
  events: PulledEvent[];
  /** Seq of the last item returned (or `since` when nothing changed), as text. */
  cursor: string;
  /** More changes remain after `cursor`: pull again with `since=cursor`. */
  hasMore: boolean;
  /** Data epoch of this page (S1, L5); pushes must send it back. */
  epoch: string;
}

/**
 * Everything (records and events, tombstones included) with seq > `since`,
 * in seq order, at most `limit` items per page, with the data epoch. Both
 * tables and the epoch are read in one repeatable-read snapshot so a concurrent
 * commit cannot fall between them.
 */
export async function pullChanges(db: Database, since: number, limit: number = PULL_PAGE_SIZE): Promise<PullResult> {
  const [recordRows, eventRows, epoch] = await db.transaction(
    (tx) =>
      Promise.all([listRecordsSince(tx, since, limit + 1), listEventsSince(tx, since, limit + 1), readDataEpoch(tx)]),
    { isolationLevel: 'repeatable read', accessMode: 'read only' }
  );

  // Both lists are sorted by seq (unique across tables): merge them and keep the first `limit`.
  const merged = [
    ...recordRows.map((row) => ({ seq: row.seq, record: row })),
    ...eventRows.map((row) => ({ seq: row.seq, event: row })),
  ].sort((a, b) => a.seq - b.seq);
  const page = merged.slice(0, limit);

  const records: PulledRecord[] = [];
  const events: PulledEvent[] = [];
  for (const item of page) {
    if ('record' in item) {
      const { kind, id, data, updatedAt, deleted, fieldVersions } = item.record;
      records.push({ kind, id, data, updatedAt: updatedAt.toISOString(), deleted, fieldVersions });
    } else {
      const { id, matchId, data, deleted } = item.event;
      events.push({ id, matchId, data, deleted });
    }
  }

  return {
    records,
    events,
    cursor: String(page.at(-1)?.seq ?? since),
    hasMore: merged.length > limit,
    epoch,
  };
}
