import { unstable_rethrow } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/current-user';
import { AUTH_MESSAGES } from '@/server/auth/messages';
import { getDb } from '@/server/db/client';
import { INTERNAL_ERROR_MESSAGE, jsonError, jsonOk } from '@/server/http/json';
import { parseSinceCursor } from '@/server/sync/api-schema';
import { SYNC_MESSAGES } from '@/server/sync/messages';
import { pullChanges } from '@/server/sync/pull';

/**
 * GET /api/sync/pull?since=<cursor>
 *   -> 200 { records: [{ kind, id, data, updatedAt, deleted }], events: [{ id, matchId, data, deleted }],
 *            cursor: string, hasMore: boolean }
 * Changes with seq > since in seq order, at most 1000 per page; while `hasMore`,
 * pull again with `since=cursor`. No `since` = full snapshot. 401 without a
 * session, 400 for a malformed cursor.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError(401, AUTH_MESSAGES.unauthenticated);

    const since = parseSinceCursor(new URL(request.url).searchParams.get('since'));
    if (!since.ok) return jsonError(400, SYNC_MESSAGES.invalidCursor);

    return jsonOk(await pullChanges(getDb(), since.value));
  } catch (error) {
    unstable_rethrow(error);
    console.error('[sync/pull] failed', error);
    return jsonError(500, INTERNAL_ERROR_MESSAGE);
  }
}
