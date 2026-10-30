import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { DrizzleQueryError } from 'drizzle-orm';
import { formatServerError, logServerError } from './log-server-error';

const EMAIL = 'fbalbi@camg.com.ar';
const HASH = 'scrypt$131072$8$1$c2FsdA$aGFzaA';

function pgError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code, detail: `Key (email)=(${EMAIL}) already exists.` });
}

function drizzleError(): DrizzleQueryError {
  return new DrizzleQueryError(
    'insert into "users" ("id", "email", "password_hash") values ($1, $2, $3)',
    ['u-1', EMAIL, HASH],
    pgError('duplicate key value violates unique constraint "users_email_unique"', '23505')
  );
}

describe('formatServerError', () => {
  it('keeps the error name, the pg code and the query text, but never the params', () => {
    const line = formatServerError('auth/login', drizzleError());

    assert.strictEqual(
      line,
      '[auth/login] failed: DrizzleQueryError code=23505 Failed query: insert into "users" ("id", "email", "password_hash") values ($1, $2, $3)'
    );
    assert.ok(!line.includes('scrypt$'));
    assert.ok(!line.includes(EMAIL));
  });

  it('reads the code from the error itself when it has one', () => {
    assert.strictEqual(
      formatServerError('sync/push', pgError('connection terminated', '57P01')),
      '[sync/push] failed: Error code=57P01 connection terminated'
    );
  });

  it('strips params even when the message is not a drizzle error', () => {
    const error = new TypeError(`bad input\nparams: ${EMAIL},${HASH}`);
    assert.strictEqual(formatServerError('db:seed', error), '[db:seed] failed: TypeError bad input');
  });

  it('describes non-Error values by type only', () => {
    assert.strictEqual(formatServerError('auth/me', `leak ${EMAIL}`), '[auth/me] failed: string');
    assert.strictEqual(formatServerError('auth/me', null), '[auth/me] failed: null');
    assert.strictEqual(formatServerError('auth/me', { password: HASH }), '[auth/me] failed: object');
  });
});

describe('logServerError', () => {
  it('writes one sanitized line to console.error', (t) => {
    const errorLog = t.mock.method(console, 'error', () => undefined);
    logServerError('auth/login', drizzleError());

    assert.strictEqual(errorLog.mock.callCount(), 1);
    const args = errorLog.mock.calls[0].arguments;
    assert.strictEqual(args.length, 1);
    const [line] = args;
    assert.strictEqual(typeof line, 'string');
    assert.ok(!String(line).includes('scrypt$'));
    assert.ok(!String(line).includes(EMAIL));
    mock.restoreAll();
  });
});
