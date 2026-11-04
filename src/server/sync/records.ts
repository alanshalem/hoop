import 'server-only';
import { PlayByPlayEventSchema } from '@/core/domain/entities/match.types';
import { SYNC_RECORDS, type SyncRecordKind } from '@/core/application/sync/record-kinds';
import type { RecordWrite } from './repository';

export type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: string };

type JsonObject = Record<string, unknown>;

/**
 * Validates a record payload with its kind's schema, shared with the client (match
 * records never embed events); `data.id` must match the record id.
 */
export function parseRecordData(kind: SyncRecordKind, id: string, data: unknown): ParseResult<JsonObject> {
  const result = SYNC_RECORDS[kind].schema.safeParse(data);
  if (!result.success) return { ok: false, reason: `invalid ${kind}: ${result.error.issues[0]?.message ?? 'unknown'}` };
  if (result.data.id !== id) return { ok: false, reason: `${kind} data id does not match record id` };
  return { ok: true, value: result.data };
}

/**
 * A server-side record write (seed, report import) at `now`, validated like a
 * push; throws when the entity does not match its domain schema.
 */
export function validRecordWrite(kind: SyncRecordKind, entity: { id: string }, now: Date): RecordWrite {
  const parsed = parseRecordData(kind, entity.id, entity);
  if (!parsed.ok) throw new Error(`${kind} ${entity.id} is invalid: ${parsed.reason}`);
  return { kind, id: entity.id, data: parsed.value, updatedAt: now, deleted: false, fieldVersions: null };
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
