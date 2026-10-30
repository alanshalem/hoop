import { unstable_rethrow } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/current-user';
import { AUTH_MESSAGES } from '@/server/auth/messages';
import { getDb } from '@/server/db/client';
import { INTERNAL_ERROR_MESSAGE, jsonError, jsonOk } from '@/server/http/json';
import { isJsonRequest, readJsonBody } from '@/server/http/read-json';
import { MAX_PUSH_BODY_BYTES, parsePushBody } from '@/server/sync/api-schema';
import { SYNC_MESSAGES } from '@/server/sync/messages';
import { applyPush } from '@/server/sync/push';

/**
 * POST /api/sync/push
 *   { records: [{ kind, id, data, updatedAt, deleted }], events: [{ id, matchId, data, deleted }] }
 *   -> 200 { accepted: string[], rejected: [{ id, reason: 'INVALID' | 'FORBIDDEN' | 'STALE' }], cursor: string }
 * 401 without a session, 415 if not JSON, 413 over 500 records / 2000 events / 8 MiB,
 * 400 for malformed JSON or envelopes. Per-item problems never fail the request.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError(401, AUTH_MESSAGES.unauthenticated);
    if (!isJsonRequest(request)) return jsonError(415, AUTH_MESSAGES.unsupportedMediaType);

    const body = await readJsonBody(request, MAX_PUSH_BODY_BYTES);
    if (!body.ok) {
      return body.error === 'TOO_LARGE'
        ? jsonError(413, SYNC_MESSAGES.payloadTooLarge)
        : jsonError(400, SYNC_MESSAGES.invalidBody);
    }
    const parsed = parsePushBody(body.value);
    if (!parsed.ok) {
      return jsonError(parsed.status, parsed.status === 413 ? SYNC_MESSAGES.payloadTooLarge : SYNC_MESSAGES.invalidBody);
    }

    return jsonOk(await applyPush(getDb(), user, parsed.value));
  } catch (error) {
    unstable_rethrow(error);
    console.error('[sync/push] failed', error);
    return jsonError(500, INTERNAL_ERROR_MESSAGE);
  }
}
