import 'server-only';

/**
 * Requiring JSON also blocks cross-site HTML form posts (they cannot send this type).
 */
export function isJsonRequest(request: Request): boolean {
  return request.headers.get('content-type')?.toLowerCase().startsWith('application/json') ?? false;
}

export type ReadJsonResult = { ok: true; value: unknown } | { ok: false; error: 'TOO_LARGE' | 'INVALID_JSON' };

/**
 * Reads and parses a JSON body without ever buffering more than `maxBytes`:
 * a larger declared `Content-Length` is refused up front, and a streamed body
 * is cancelled as soon as it grows past the limit.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<ReadJsonResult> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, error: 'TOO_LARGE' };
  if (!request.body) return { ok: false, error: 'INVALID_JSON' };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return { ok: false, error: 'TOO_LARGE' };
    }
    chunks.push(value);
  }

  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return { ok: true, value };
  } catch {
    return { ok: false, error: 'INVALID_JSON' };
  }
}
