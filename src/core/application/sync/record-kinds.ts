import type { z } from 'zod';
// Relative imports (not `@/`): src/server/db/schema.ts builds the Postgres enum from
// this module and drizzle-kit loads it outside the Next.js resolver.
import { ChartCodeRecordSchema } from '../../domain/entities/chart.types';
import { DivisionSchema, PlayerSchema, TeamSchema } from '../../domain/entities/club.types';
import { CoachSchema } from '../../domain/entities/coach.types';
import { MatchSchema, type Match } from '../../domain/entities/match.types';
import { RivalTeamSchema } from '../../domain/entities/rival.types';

/**
 * Match records never embed events: events travel only as append-only event items.
 * Zod strips unknown keys, so an incoming `events` array is dropped.
 */
export const MatchRecordSchema = MatchSchema.omit({ events: true });

/**
 * =============================================================================
 * HOOP - SYNC RECORD KINDS (shared by client and server)
 * Every entity kind synced as a last-write-wins record, in one table: its key in
 * the club data and the schema that validates its payload on both sides.
 * `match` is the only kind with events (`hasEvents`): its play-by-play travels
 * separately, it merges field by field (S13.1) and its scoreboard is derived.
 * The key order is the Postgres `sync_record_kind` enum order: append new kinds.
 * =============================================================================
 */
export const SYNC_RECORDS = {
  division: { collectionKey: 'divisions', schema: DivisionSchema },
  team: { collectionKey: 'teams', schema: TeamSchema },
  player: { collectionKey: 'players', schema: PlayerSchema },
  match: { collectionKey: 'matches', schema: MatchRecordSchema, hasEvents: true },
  /** Club edits of the chart catalog (S9); empty means the built-in catalog. */
  chartCode: { collectionKey: 'chartCodes', schema: ChartCodeRecordSchema },
  /** Rival teams and their players, per division (S14). */
  rivalTeam: { collectionKey: 'rivalTeams', schema: RivalTeamSchema },
  /** Coaches without login, assigned to division teams (S5). */
  coach: { collectionKey: 'coaches', schema: CoachSchema },
} as const satisfies Record<string, { collectionKey: string; schema: z.ZodType<{ id: string }>; hasEvents?: true }>;

type SyncRecords = typeof SYNC_RECORDS;

export type SyncRecordKind = keyof SyncRecords;

/** Entity kinds synced as records (mirrors the server `sync_records.kind`). */
export const SYNC_RECORD_KINDS = Object.keys(SYNC_RECORDS) as [SyncRecordKind, ...SyncRecordKind[]];

export type SyncRecordDataByKind = { [K in SyncRecordKind]: z.output<SyncRecords[K]['schema']> };

/** Match metadata as synced: events travel only as append-only event items. */
export type MatchRecord = SyncRecordDataByKind['match'];

/** Entity kept in the club data per kind: a kind with events also holds its play-by-play. */
export type SyncEntityByKind = {
  [K in SyncRecordKind]: SyncRecords[K] extends { hasEvents: true } ? Match : SyncRecordDataByKind[K];
};

/** The part of the club data that is synced with the server. */
export type SyncableClubData = {
  [K in SyncRecordKind as SyncRecords[K]['collectionKey']]: SyncEntityByKind[K][];
};

/** Builds club data from one entity list per kind. */
export function clubDataFrom(list: <K extends SyncRecordKind>(kind: K) => SyncEntityByKind[K][]): SyncableClubData {
  return Object.fromEntries(
    SYNC_RECORD_KINDS.map((kind) => [SYNC_RECORDS[kind].collectionKey, list(kind)])
  ) as SyncableClubData;
}

/** The entity list of one kind. */
export function entitiesOf<K extends SyncRecordKind>(data: SyncableClubData, kind: K): SyncEntityByKind[K][] {
  return data[SYNC_RECORDS[kind].collectionKey] as SyncEntityByKind[K][];
}

/** Club data without any synced record. */
export function createEmptyClubData(): SyncableClubData {
  return clubDataFrom(() => []);
}

/** Only the synced collections of a larger state (such as the club store). */
export function pickSyncableClubData(state: SyncableClubData): SyncableClubData {
  return clubDataFrom((kind) => entitiesOf(state, kind));
}
