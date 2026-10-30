import 'server-only';

/**
 * CSRF guard for cookie-authenticated mutations (login, logout, sync push).
 *
 * Browsers send `Origin` on cross-site POSTs, so when it is present its host
 * must be the host this request was addressed to: the first `X-Forwarded-Host`
 * (behind a reverse proxy, as Next.js Server Actions do), else `Host`, else the
 * request URL. A missing `Origin` is allowed (non-browser clients); an opaque
 * `Origin: null` or a malformed one is rejected. Together with the JSON
 * content-type requirement (which a cross-site HTML form cannot send) this
 * blocks forged requests.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin === null) return true;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  return originHost !== '' && originHost === requestHost(request);
}

function requestHost(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwarded || request.headers.get('host')?.trim() || new URL(request.url).host;
  return host.toLowerCase();
}
