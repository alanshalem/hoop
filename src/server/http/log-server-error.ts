import 'server-only';

/**
 * Server error logging that never leaks data.
 *
 * Errors from drizzle (`DrizzleQueryError`) embed the bound query parameters in
 * their message ("Failed query: ...\nparams: ...") and keep them on `.params`,
 * so logging the error object would print password hashes, emails and synced
 * payloads. Only the error name, the Postgres error `code` (on the error or its
 * `cause`) and the message up to "params:" are kept; the query text itself only
 * holds `$n` placeholders. The `cause` is never printed.
 */

const PARAMS_MARKER = /\bparams:/i;
const MAX_MESSAGE_LENGTH = 500;

function readCode(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('code' in value)) return null;
  const { code } = value;
  return typeof code === 'string' || typeof code === 'number' ? String(code) : null;
}

function sanitizeMessage(message: string): string {
  const marker = message.search(PARAMS_MARKER);
  const withoutParams = marker === -1 ? message : message.slice(0, marker);
  return withoutParams.replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE_LENGTH);
}

/** One log line for `error`: `[context] failed: <name> [code=<code>] <message without params>`. */
export function formatServerError(context: string, error: unknown): string {
  const prefix = `[${context}] failed:`;
  if (!(error instanceof Error)) return `${prefix} ${error === null ? 'null' : typeof error}`;

  const code = readCode(error) ?? readCode(error.cause);
  // Some libraries (drizzle) leave `name` as the generic 'Error'; the class name says more.
  const name = error.name === 'Error' && error.constructor.name ? error.constructor.name : error.name;
  const parts = [prefix, name];
  if (code) parts.push(`code=${code}`);
  const message = sanitizeMessage(error.message);
  if (message) parts.push(message);
  return parts.join(' ');
}

/** Logs a server failure for operators without printing query params, causes or payloads. */
export function logServerError(context: string, error: unknown): void {
  console.error(formatServerError(context, error));
}
