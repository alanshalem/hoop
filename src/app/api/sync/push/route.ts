import { unstable_rethrow } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/current-user';
import { AUTH_MESSAGES } from '@/server/auth/messages';
import { passwordChangeRefusal } from '@/server/auth/password-change-gate';
import { getDb } from '@/server/db/client';
import { INTERNAL_ERROR_MESSAGE, jsonError, jsonOk } from '@/server/http/json';
import { logServerError } from '@/server/http/log-server-error';
import { isJsonRequest, readJsonBody } from '@/server/http/read-json';
import { isSameOriginRequest } from '@/server/http/same-origin';
import { MAX_PUSH_BODY_BYTES, parsePushBody } from '@/server/sync/api-schema';
import { SYNC_MESSAGES } from '@/server/sync/messages';
import { applyPush } from '@/server/sync/push';

/**
 * POST /api/sync/push
 *   { records: [{ kind, id, data, updatedAt, deleted, fieldVersions? }], events: [{ id, matchId, data, deleted }],
 *     epoch: string }
 *   -> 200 { accepted: string[], rejected: [{ id, reason: 'INVALID' | 'FORBIDDEN' | 'STALE' }], cursor: string }
 *   -> 409 { error, reason: 'EPOCH_MISMATCH' } when `epoch` (the data epoch of the last pull) is missing or
 *      not the current one: the server data was replaced, nothing is written and the client reloads a snapshot.
 * Live match records merge field by field with `fieldVersions` (field or group -> ISO
 * time; `game-state` versions status, quarter and clock together, and legacy per-field
 * versions of a group fold into it; omitted = every field at `updatedAt`); other
 * records use last-write-wins. Events
 * whose match is neither stored live nor accepted earlier in the batch are INVALID.
 * 403 when a present `Origin` is not this host (checked first), 401 without a session,
 * 403 `PASSWORD_CHANGE_REQUIRED` while the account holds a temporary password, 415 if not JSON, 413 over 500 records / 2000 events / 8 MiB, 400 for malformed JSON
 * or envelopes. Per-item problems never fail the request; a record whose `updatedAt`
 * is more than 5 minutes ahead of the server clock is rejected as INVALID (a skewed
 * clock would otherwise win every future last-write-wins comparison).
 */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return jsonError(403, AUTH_MESSAGES.forbiddenOrigin);
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError(401, AUTH_MESSAGES.unauthenticated);
    const pendingChange = passwordChangeRefusal(user);
    if (pendingChange) return pendingChange;
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

    const outcome = await applyPush(getDb(), user, parsed.value);
    if (!outcome.ok) return jsonError(409, SYNC_MESSAGES.epochMismatch, outcome.reason);
    return jsonOk(outcome.value);
  } catch (error) {
    unstable_rethrow(error);
    logServerError('sync/push', error);
    return jsonError(500, INTERNAL_ERROR_MESSAGE);
  }
}
