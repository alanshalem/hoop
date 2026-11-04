import { z } from 'zod';
import { ChartCodeRecordSchema } from '@/core/domain/entities/chart.types';
import { DivisionSchema, PlayerSchema, TeamSchema, UserRoleSchema } from '@/core/domain/entities/club.types';
import { MatchSchema, PlayByPlayEventSchema } from '@/core/domain/entities/match.types';
import { CoachSchema } from '@/core/domain/entities/coach.types';
import { RivalTeamSchema } from '@/core/domain/entities/rival.types';
import type { AuthUser } from '@/core/application/auth/auth-session';
import { pickFieldVersions } from '@/core/application/sync/match-fields';
import {
  SYNC_RECORD_KINDS,
  type PullPage,
  type PushResult,
  type SyncEvent,
  type SyncRecord,
} from '@/core/application/sync/sync-types';

/**
 * =============================================================================
 * HOOP OS - SYNC API RESPONSE SCHEMAS
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
});

export const AuthUserResponseSchema = z.object({ user: AuthUserSchema });

export const ErrorResponseSchema = z.object({ error: z.string() });

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
});

/** Match records never carry events; zod strips an unexpected `events` key. */
const MatchRecordSchema = MatchSchema.omit({ events: true });

type PulledRecordEnvelope = z.infer<typeof PullEnvelopeSchema>['records'][number];

function parseRecord({ kind, id, data, updatedAt, deleted, fieldVersions }: PulledRecordEnvelope): SyncRecord | null {
  const base = { id, updatedAt, deleted };
  switch (kind) {
    case 'division': {
      const parsed = DivisionSchema.safeParse(data);
      return parsed.success ? { ...base, kind, data: parsed.data } : null;
    }
    case 'team': {
      const parsed = TeamSchema.safeParse(data);
      return parsed.success ? { ...base, kind, data: parsed.data } : null;
    }
    case 'player': {
      const parsed = PlayerSchema.safeParse(data);
      return parsed.success ? { ...base, kind, data: parsed.data } : null;
    }
    case 'chartCode': {
      const parsed = ChartCodeRecordSchema.safeParse(data);
      return parsed.success ? { ...base, kind, data: parsed.data } : null;
    }
    case 'rivalTeam': {
      const parsed = RivalTeamSchema.safeParse(data);
      return parsed.success ? { ...base, kind, data: parsed.data } : null;
    }
    case 'coach': {
      const parsed = CoachSchema.safeParse(data);
      return parsed.success ? { ...base, kind, data: parsed.data } : null;
    }
    case 'match': {
      const parsed = MatchRecordSchema.safeParse(data);
      if (!parsed.success) return null;
      return fieldVersions
        ? { ...base, kind, data: parsed.data, fieldVersions: pickFieldVersions(fieldVersions) }
        : { ...base, kind, data: parsed.data };
    }
  }
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

  return { records, events, cursor: envelope.data.cursor, hasMore: envelope.data.hasMore };
}

export function parsePushResult(body: unknown): PushResult | null {
  const parsed = PushResultSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

export function parseAuthUser(body: unknown): AuthUser | null {
  const parsed = AuthUserResponseSchema.safeParse(body);
  return parsed.success ? parsed.data.user : null;
}

export function parseErrorMessage(body: unknown): string | undefined {
  const parsed = ErrorResponseSchema.safeParse(body);
  return parsed.success ? parsed.data.error : undefined;
}

/** Cursor of an SSE `changed` event (`data: {"cursor":"<seq>"}`), or null. */
export function parseChangedEventData(data: string): string | null {
  try {
    const parsed = z.object({ cursor: CursorSchema }).safeParse(JSON.parse(data));
    return parsed.success ? parsed.data.cursor : null;
  } catch {
    return null;
  }
}
