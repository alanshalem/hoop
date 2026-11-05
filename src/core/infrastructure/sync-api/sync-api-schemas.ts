import { z } from 'zod';
import { UserRoleSchema } from '@/core/domain/entities/club.types';
import { PlayByPlayEventSchema } from '@/core/domain/entities/match.types';
import type { AuthUser } from '@/core/application/auth/auth-session';
import { pickFieldVersions } from '@/core/application/sync/match-fields';
import { SYNC_RECORD_KINDS, SYNC_RECORDS } from '@/core/application/sync/record-kinds';
import type { PullPage, PushResult, SyncEvent, SyncRecord } from '@/core/application/sync/sync-types';

/**
 * =============================================================================
 * HOOP - SYNC API RESPONSE SCHEMAS
 * Server responses are validated before they reach the stores. Envelopes must
 * match; each entity payload is validated with its domain schema and a bad item
 * is dropped instead of failing the whole pull.
 * =============================================================================
 */

const CursorSchema = z.string().regex(/^\d+$/);

export const AuthUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(1),
  name: z.string().min(1),
  role: UserRoleSchema,
  mustChangePassword: z.boolean(),
});

export const AuthUserResponseSchema = z.object({ user: AuthUserSchema });

export const ErrorResponseSchema = z.object({ error: z.string() });

/** Typed refusal of a whole request (409): the push was made in another data epoch. */
const RejectionResponseSchema = z.object({ reason: z.literal('EPOCH_MISMATCH') });

export const PushResultSchema = z.object({
  accepted: z.array(z.string()),
  rejected: z.array(z.object({ id: z.string(), reason: z.enum(['INVALID', 'FORBIDDEN', 'STALE']) })),
  cursor: CursorSchema,
});

const PullEnvelopeSchema = z.object({
  records: z.array(
    z.object({
      kind: z.enum(SYNC_RECORD_KINDS),
      id: z.string().min(1),
      data: z.unknown(),
      updatedAt: z.iso.datetime({ offset: true }),
      deleted: z.boolean(),
      /** Match records only (S13.1); null for rows written before field versions existed. */
      fieldVersions: z.record(z.string(), z.iso.datetime({ offset: true })).nullish(),
    })
  ),
  events: z.array(
    z.object({
      id: z.string().min(1),
      matchId: z.string().min(1),
      data: z.unknown(),
      deleted: z.boolean(),
    })
  ),
  cursor: CursorSchema,
  hasMore: z.boolean(),
  epoch: z.string().min(1),
});

type PulledRecordEnvelope = z.infer<typeof PullEnvelopeSchema>['records'][number];

/** Validates the data with its kind's schema (match records never carry events). */
function parseRecord({ kind, id, data, updatedAt, deleted, fieldVersions }: PulledRecordEnvelope): SyncRecord | null {
  const parsed = SYNC_RECORDS[kind].schema.safeParse(data);
  if (!parsed.success) return null;
  const record = { kind, id, data: parsed.data, updatedAt, deleted } as SyncRecord;
  if (record.kind === 'match' && fieldVersions) return { ...record, fieldVersions: pickFieldVersions(fieldVersions) };
  return record;
}

export function parsePullPage(body: unknown): PullPage | null {
  const envelope = PullEnvelopeSchema.safeParse(body);
  if (!envelope.success) return null;

  const records = envelope.data.records
    .map(parseRecord)
    .filter((record): record is SyncRecord => record !== null && record.data.id === record.id);
  const events = envelope.data.events.flatMap((event): SyncEvent[] => {
    const parsed = PlayByPlayEventSchema.safeParse(event.data);
    if (!parsed.success || parsed.data.id !== event.id) return [];
    return [{ id: event.id, matchId: event.matchId, data: parsed.data, deleted: event.deleted }];
  });

  const { cursor, hasMore, epoch } = envelope.data;
  return { records, events, cursor, hasMore, epoch };
}

export function parsePushResult(body: unknown): PushResult | null {
  const parsed = PushResultSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

export function parseAuthUser(body: unknown): AuthUser | null {
  const parsed = AuthUserResponseSchema.safeParse(body);
  return parsed.success ? parsed.data.user : null;
}

export function parseRejectionReason(body: unknown): 'EPOCH_MISMATCH' | undefined {
  const parsed = RejectionResponseSchema.safeParse(body);
  return parsed.success ? parsed.data.reason : undefined;
}

export function parseErrorMessage(body: unknown): string | undefined {
  const parsed = ErrorResponseSchema.safeParse(body);
  return parsed.success ? parsed.data.error : undefined;
}

