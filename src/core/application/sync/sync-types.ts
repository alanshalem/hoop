import type { PlayByPlayEvent } from '@/core/domain/entities/match.types';
import type { MatchField, MatchFieldVersions } from './match-fields';
import type { SyncRecordDataByKind, SyncRecordKind } from './record-kinds';

/**
 * =============================================================================
 * HOOP - CLIENT SYNC TYPES (S10.7)
 * Local-first: every write lands in the club store first, then travels through
 * a persisted outbox to `POST /api/sync/push`. Pulls merge server changes back.
 * =============================================================================
 */

// Record kinds, their data and the synced club data: see ./record-kinds.ts.

type ByKind<Extra, MatchExtra = unknown> = {
  [K in SyncRecordKind]: { kind: K; id: string; data: SyncRecordDataByKind[K]; deleted: boolean } & Extra &
    (K extends 'match' ? MatchExtra : unknown);
}[SyncRecordKind];

/**
 * A local record change; a removal (`deleted`) carries the last known data.
 * A match edit lists its changed fields; without them (a new match) every field changed.
 */
export type RecordChange = ByKind<unknown, { changedFields?: MatchField[] }>;

/**
 * A record as pushed to or pulled from the server; `updatedAt` is ISO 8601 (LWW).
 * Live match records carry per-field versions (S13.1); without them every field
 * changed at `updatedAt`.
 */
export type SyncRecord = ByKind<{ updatedAt: string }, { fieldVersions?: MatchFieldVersions }>;

export interface SyncEvent {
  id: string;
  matchId: string;
  data: PlayByPlayEvent;
  deleted: boolean;
}

export type EventChange = SyncEvent;

export interface ClubDiff {
  records: RecordChange[];
  events: EventChange[];
}

/**
 * `kind:id` -> ISO `updatedAt` of the last version applied or written locally.
 * Matches also keep one entry per field, `match:<id>#<field>` (see ./match-fields.ts).
 */
export type VersionMap = Record<string, string>;

export type OutboxRecordEntry = SyncRecord & {
  /** Local revision: a push result only settles the revision it sent. */
  rev: number;
};

export interface OutboxEventEntry extends SyncEvent {
  rev: number;
  /** Set once the event was included in a push (it may have reached the server). */
  attempted: boolean;
}

/** Pending changes, persisted in the browser until the server answers for them. */
export interface Outbox {
  /** Keyed by `kind:id`: only the latest change of a record is kept. */
  records: Record<string, OutboxRecordEntry>;
  /** Keyed by event id. */
  events: Record<string, OutboxEventEntry>;
  nextRev: number;
}

// -----------------------------------------------------------------------------
// SERVER CONTRACT (see src/app/api/sync/**)
// -----------------------------------------------------------------------------

export interface PushPayload {
  records: SyncRecord[];
  events: SyncEvent[];
}

export type PushRejectReason = 'INVALID' | 'FORBIDDEN' | 'STALE';

export interface PushResult {
  accepted: string[];
  rejected: { id: string; reason: PushRejectReason }[];
  /** Latest server seq. Never used as the pull cursor; only to detect a server reset. */
  cursor: string;
}

export interface PulledChanges {
  records: SyncRecord[];
  events: SyncEvent[];
}

export interface PullPage extends PulledChanges {
  cursor: string;
  hasMore: boolean;
  /**
   * Server data epoch (S1, L5): changes when the server data is replaced. Local
   * data, cursor and outbox of another epoch are dropped, never pushed.
   */
  epoch: string;
}

/** `EPOCH_MISMATCH`: the push was refused because the server data was replaced (409). */
export type ApiError = 'UNAUTHORIZED' | 'NETWORK' | 'HTTP' | 'INVALID_RESPONSE' | 'EPOCH_MISMATCH';

export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ApiError; status?: number; message?: string };

/** Port implemented by the HTTP adapter (src/core/infrastructure/sync-api). */
export interface SyncApi {
  /** `epoch`: the data epoch the pushed changes were made in (see `PullPage.epoch`). */
  push(payload: PushPayload, epoch: string): Promise<ApiResult<PushResult>>;
  /** `since: null` asks for the full snapshot. */
  pull(since: string | null): Promise<ApiResult<PullPage>>;
}

// -----------------------------------------------------------------------------
// SYNC STORE
// -----------------------------------------------------------------------------

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

/** User whose session produced the local sync data (outbox, cursor, versions). */
export interface SyncOwner {
  id: string;
  name: string;
}

/** Persisted across reloads. */
export interface SyncPersistedData {
  /** `null` until a user claims this device's sync data (see `resolveSyncOwnership`). */
  owner: SyncOwner | null;
  /** Last pull cursor; `null` until the first sync of this device. */
  cursor: string | null;
  versions: VersionMap;
  outbox: Outbox;
  lastSyncedAt: string | null;
  /** Server data epoch of `cursor`, `versions` and `outbox`; `null` until the first pull. */
  epoch: string | null;
}

export interface SyncStoreData extends SyncPersistedData {
  status: SyncStatus;
  lastError: string | null;
}
