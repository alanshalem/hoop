import 'server-only';

/** Auth and sync responses depend on the session: never store them in shared caches. */
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export function jsonOk<T>(body: T, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

/**
 * Error responses carry a Spanish, user-facing message; `reason` is a typed
 * code for clients that must react to this refusal (e.g. `EPOCH_MISMATCH`).
 */
export function jsonError(status: number, error: string, reason?: string): Response {
  return Response.json(reason === undefined ? { error } : { error, reason }, { status, headers: NO_STORE });
}

export const INTERNAL_ERROR_MESSAGE = 'Error interno del servidor. Inténtalo de nuevo en unos minutos.';
