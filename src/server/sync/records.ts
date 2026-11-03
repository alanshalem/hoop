import 'server-only';
import type { z } from 'zod';
import { ChartCodeRecordSchema } from '@/core/domain/entities/chart.types';
import { DivisionSchema, PlayerSchema, TeamSchema } from '@/core/domain/entities/club.types';
import { MatchSchema, PlayByPlayEventSchema } from '@/core/domain/entities/match.types';
import type { SyncRecordKind } from './record-kinds';

/**
 * Match records never embed events: events travel only through `match_events`.
 * Zod strips unknown keys, so an incoming `events` array is dropped.
 */
export const MatchRecordSchema = MatchSchema.omit({ events: true });

export const RECORD_DATA_SCHEMAS = {
  division: DivisionSchema,
  team: TeamSchema,
  player: PlayerSchema,
  match: MatchRecordSchema,
  chartCode: ChartCodeRecordSchema,
} satisfies Record<SyncRecordKind, z.ZodType>;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: string };

type JsonObject = Record<string, unknown>;

/** Validates a record payload with its domain schema; `data.id` must match the record id. */
export function parseRecordData(kind: SyncRecordKind, id: string, data: unknown): ParseResult<JsonObject> {
  const result = RECORD_DATA_SCHEMAS[kind].safeParse(data);
  if (!result.success) return { ok: false, reason: `invalid ${kind}: ${result.error.issues[0]?.message ?? 'unknown'}` };
  if (result.data.id !== id) return { ok: false, reason: `${kind} data id does not match record id` };
  return { ok: true, value: result.data };
}

/** Validates an event payload; `data.id` and `data.matchId` must match the envelope. */
export function parseEventData(id: string, matchId: string, data: unknown): ParseResult<JsonObject> {
  const result = PlayByPlayEventSchema.safeParse(data);
  if (!result.success) return { ok: false, reason: `invalid event: ${result.error.issues[0]?.message ?? 'unknown'}` };
  if (result.data.id !== id || result.data.matchId !== matchId) {
    return { ok: false, reason: 'event data does not match its id or match id' };
  }
  return { ok: true, value: result.data };
}
