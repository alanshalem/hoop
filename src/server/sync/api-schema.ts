import 'server-only';
import { z } from 'zod';
import { SYNC_RECORD_KINDS } from './record-kinds';

/**
 * =============================================================================
 * HOOP OS - SYNC API REQUEST SCHEMAS
 * Envelopes are validated here (a malformed envelope fails the whole request
 * with 400). Each `data` payload is validated per item against its domain
 * schema later (see ./records.ts), so one bad entity only rejects itself.
 * =============================================================================
 */

export const MAX_PUSH_RECORDS = 500;
export const MAX_PUSH_EVENTS = 2000;
/** Raw body cap for `POST /api/sync/push`, checked before parsing. */
export const MAX_PUSH_BODY_BYTES = 8 * 1024 * 1024;

const EntityIdSchema = z.string().min(1).max(200);

const PushRecordSchema = z.object({
  kind: z.enum(SYNC_RECORD_KINDS),
  id: EntityIdSchema,
  data: z.unknown(),
  /** Client change time, ISO 8601 with `Z` or an offset; compared for last-write-wins. */
  updatedAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
  deleted: z.boolean(),
});
export type PushRecordInput = z.output<typeof PushRecordSchema>;

const PushEventSchema = z.object({
  id: EntityIdSchema,
  matchId: EntityIdSchema,
  data: z.unknown(),
  deleted: z.boolean(),
});
export type PushEventInput = z.output<typeof PushEventSchema>;

export const PushBodySchema = z.object({
  records: z.array(PushRecordSchema).max(MAX_PUSH_RECORDS).default([]),
  events: z.array(PushEventSchema).max(MAX_PUSH_EVENTS).default([]),
});
export type PushBody = z.output<typeof PushBodySchema>;

/** Only the list shapes, so oversized batches answer 413 before their items are parsed. */
const PushBodyShapeSchema = z.object({
  records: z.array(z.unknown()).optional(),
  events: z.array(z.unknown()).optional(),
});

export type PushBodyParseResult = { ok: true; value: PushBody } | { ok: false; status: 400 | 413 };

export function parsePushBody(body: unknown): PushBodyParseResult {
  const shape = PushBodyShapeSchema.safeParse(body);
  if (!shape.success) return { ok: false, status: 400 };
  const { records = [], events = [] } = shape.data;
  if (records.length > MAX_PUSH_RECORDS || events.length > MAX_PUSH_EVENTS) return { ok: false, status: 413 };

  const parsed = PushBodySchema.safeParse(body);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, status: 400 };
}

const CURSOR_PATTERN = /^\d+$/;

/**
 * `since` query parameter of `GET /api/sync/pull`: a non-negative integer
 * string; missing or empty means 0 (full snapshot).
 */
export function parseSinceCursor(value: string | null): { ok: true; value: number } | { ok: false } {
  if (value === null || value === '') return { ok: true, value: 0 };
  if (!CURSOR_PATTERN.test(value)) return { ok: false };
  const since = Number(value);
  return Number.isSafeInteger(since) ? { ok: true, value: since } : { ok: false };
}
