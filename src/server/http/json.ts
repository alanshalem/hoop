import 'server-only';

/** Auth and sync responses depend on the session: never store them in shared caches. */
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export function jsonOk<T>(body: T, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

/** Error responses carry a Spanish, user-facing message. */
export function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: NO_STORE });
}

export const INTERNAL_ERROR_MESSAGE = 'Error interno del servidor. Inténtalo de nuevo en unos minutos.';
