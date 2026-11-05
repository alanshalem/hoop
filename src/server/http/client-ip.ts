import 'server-only';

/** Longer than any textual IP address (IPv6 with an embedded IPv4 is 45 characters). */
const MAX_IP_LENGTH = 64;

/**
 * The client address for per-IP limits (S1): the first `x-forwarded-for` entry,
 * which Vercel sets to the connecting client. Null without one; outside such a
 * proxy the header is whatever the client sent, so it is only a best effort.
 */
export function clientIp(headers: Headers): string | null {
  const first = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return first && first.length <= MAX_IP_LENGTH ? first : null;
}
