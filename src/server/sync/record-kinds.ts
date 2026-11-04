import 'server-only';

/**
 * Entity kinds stored as last-write-wins rows in `sync_records`.
 * Play-by-play events are not a record kind: they live in `match_events`.
 */
export const SYNC_RECORD_KINDS = ['division', 'team', 'player', 'match', 'chartCode', 'rivalTeam'] as const;
export type SyncRecordKind = (typeof SYNC_RECORD_KINDS)[number];
