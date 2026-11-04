import type { AuthApi } from '@/core/application/auth/auth-session';
import type { ApiResult, SyncApi } from '@/core/application/sync/sync-types';
import {
  parseAuthUser,
  parseErrorMessage,
  parsePullPage,
  parsePushResult,
  parseRejectionReason,
} from './sync-api-schemas';

/**
 * =============================================================================
 * HOOP - HTTP ADAPTERS FOR THE AUTH AND SYNC API
 * Same-origin `fetch`: the `hoop_session` httpOnly cookie travels on its own and
 * the client never sees a token. Failures come back as values, never throws.
 * =============================================================================
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

/** Upper bound for one API call, so a hung server cannot stall sync or logout. */
const REQUEST_TIMEOUT_MS = 15_000;

async function request<T>(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  parse: (body: unknown) => T | null
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...init,
    });
  } catch {
    return { ok: false, error: 'NETWORK' };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON (proxy error page, empty body): handled by the status checks below.
  }

  if (response.status === 401) {
    return { ok: false, error: 'UNAUTHORIZED', status: 401, message: parseErrorMessage(body) };
  }
  if (response.status === 409 && parseRejectionReason(body) === 'EPOCH_MISMATCH') {
    return { ok: false, error: 'EPOCH_MISMATCH', status: 409, message: parseErrorMessage(body) };
  }
  if (!response.ok) {
    return { ok: false, error: 'HTTP', status: response.status, message: parseErrorMessage(body) };
  }
  const value = parse(body);
  return value === null ? { ok: false, error: 'INVALID_RESPONSE', status: response.status } : { ok: true, value };
}

const postJson = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: JSON_HEADERS,
  body: JSON.stringify(body),
});

export function createHttpSyncApi(fetchImpl: typeof fetch = (...args) => fetch(...args)): SyncApi {
  return {
    push: (payload, epoch) => request(fetchImpl, '/api/sync/push', postJson({ ...payload, epoch }), parsePushResult),
    pull: (since) =>
      request(
        fetchImpl,
        since === null ? '/api/sync/pull' : `/api/sync/pull?since=${encodeURIComponent(since)}`,
        { method: 'GET' },
        parsePullPage
      ),
  };
}

export function createHttpAuthApi(fetchImpl: typeof fetch = (...args) => fetch(...args)): AuthApi {
  return {
    login: (email, password) => request(fetchImpl, '/api/auth/login', postJson({ email, password }), parseAuthUser),
    // The route requires a JSON content type (cross-site forms cannot send it).
    logout: () => request(fetchImpl, '/api/auth/logout', postJson({}), () => undefined),
    me: () => request(fetchImpl, '/api/auth/me', { method: 'GET' }, parseAuthUser),
  };
}
