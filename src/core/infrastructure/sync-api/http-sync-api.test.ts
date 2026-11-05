import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createHttpAuthApi, createHttpSyncApi, createHttpUsersApi } from './http-sync-api';
import { toMatchRecord } from '@/core/application/sync/sync-records';
import { makeChartCode, makeCoach, makeDivision, makeEvent, makeMatch, makeRivalTeam } from '@/core/testing/fixtures';

interface Call {
  url: string;
  init: RequestInit | undefined;
}

function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const call = { url: String(input), init };
    calls.push(call);
    return respond(call);
  };
  return { fetchImpl, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const USER = { id: 'user-admin-1', email: 'admin@camg.com.ar', name: 'Admin', role: 'ADMIN', mustChangePassword: false };

describe('http sync api', () => {
  it('pulls the full snapshot without `since` and pages with it', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({ records: [], events: [], cursor: '0', hasMore: false, epoch: 'epoch-1' }));
    const api = createHttpSyncApi(fetchImpl);
    await api.pull(null);
    await api.pull('120');
    assert.deepStrictEqual(calls.map((c) => c.url), ['/api/sync/pull', '/api/sync/pull?since=120']);
    assert.strictEqual(calls[0].init?.cache, 'no-store');
  });

  it('validates pulled data with the domain schemas and drops invalid items', async () => {
    const event = makeEvent({ id: 'ev-1' });
    const { fetchImpl } = fakeFetch(() =>
      json({
        records: [
          { kind: 'division', id: 'div-test', data: makeDivision(), updatedAt: '2026-10-30T18:00:00.000Z', deleted: false },
          { kind: 'match', id: 'm-test', data: { ...makeMatch(), events: [event] }, updatedAt: '2026-10-30T18:00:00.000Z', deleted: false },
          { kind: 'player', id: 'p-bad', data: { id: 'p-bad' }, updatedAt: '2026-10-30T18:00:00.000Z', deleted: false },
        ],
        events: [
          { id: 'ev-1', matchId: 'm-test', data: event, deleted: false },
          { id: 'ev-bad', matchId: 'm-test', data: { id: 'ev-bad' }, deleted: true },
        ],
        cursor: '42',
        hasMore: true,
        epoch: 'epoch-1',
      })
    );
    const result = await createHttpSyncApi(fetchImpl).pull('1');
    assert.ok(result.ok);
    assert.deepStrictEqual(result.value.records.map((r) => r.id), ['div-test', 'm-test']);
    assert.ok(!('events' in result.value.records[1].data), 'match records never carry events');
    assert.deepStrictEqual(result.value.events.map((e) => e.id), ['ev-1']);
    assert.strictEqual(result.value.cursor, '42');
    assert.strictEqual(result.value.hasMore, true);
  });

  it('accepts a valid chartCode record and drops an invalid one (S9)', async () => {
    const valid = makeChartCode({ category: 'OFFENSE', code: 'CUSTOM_zone', symbol: 'Z', label: 'Zona', order: 4 });
    const badSymbol = makeChartCode({ code: 'TRAVELLING', symbol: 'ABCD' });
    const { fetchImpl } = fakeFetch(() =>
      json({
        records: [
          { kind: 'chartCode', id: valid.id, data: valid, updatedAt: '2026-10-30T18:00:00.000Z', deleted: false },
          { kind: 'chartCode', id: badSymbol.id, data: badSymbol, updatedAt: '2026-10-30T18:00:00.000Z', deleted: false },
        ],
        events: [],
        cursor: '7',
        hasMore: false,
        epoch: 'epoch-1',
      })
    );
    const result = await createHttpSyncApi(fetchImpl).pull('1');
    assert.ok(result.ok);
    assert.deepStrictEqual(result.value.records, [
      { kind: 'chartCode', id: valid.id, data: valid, updatedAt: '2026-10-30T18:00:00.000Z', deleted: false },
    ]);
  });

  it('accepts a valid rivalTeam record and drops an invalid one (S14)', async () => {
    const valid = makeRivalTeam();
    const repeatedDorsal = makeRivalTeam({
      id: 'rival-bad',
      players: [
        { id: 'rp-1', dorsal: 5, firstName: 'Juan', lastName: 'Pérez' },
        { id: 'rp-2', dorsal: 5, firstName: 'Diego', lastName: 'García' },
      ],
    });
    const T = '2026-10-30T18:00:00.000Z';
    const { fetchImpl } = fakeFetch(() =>
      json({
        records: [
          { kind: 'rivalTeam', id: valid.id, data: valid, updatedAt: T, deleted: false },
          { kind: 'rivalTeam', id: repeatedDorsal.id, data: repeatedDorsal, updatedAt: T, deleted: false },
        ],
        events: [],
        cursor: '8',
        hasMore: false,
        epoch: 'epoch-1',
      })
    );
    const result = await createHttpSyncApi(fetchImpl).pull('1');
    assert.ok(result.ok);
    assert.deepStrictEqual(result.value.records, [
      { kind: 'rivalTeam', id: valid.id, data: valid, updatedAt: T, deleted: false },
    ]);
  });

  it('accepts a valid coach record and drops an invalid one (S5)', async () => {
    const valid = makeCoach();
    const invalid = makeCoach({ id: 'coach-bad', name: 'A' });
    const T = '2026-10-30T18:00:00.000Z';
    const { fetchImpl } = fakeFetch(() =>
      json({
        records: [
          { kind: 'coach', id: valid.id, data: valid, updatedAt: T, deleted: false },
          { kind: 'coach', id: invalid.id, data: invalid, updatedAt: T, deleted: false },
        ],
        events: [],
        cursor: '9',
        hasMore: false,
        epoch: 'epoch-1',
      })
    );
    const result = await createHttpSyncApi(fetchImpl).pull('1');
    assert.ok(result.ok);
    assert.deepStrictEqual(result.value.records, [
      { kind: 'coach', id: valid.id, data: valid, updatedAt: T, deleted: false },
    ]);
  });

  it('keeps the known field versions of pulled match records (S13.1)', async () => {
    const T = '2026-10-30T18:00:00.000Z';
    const { fetchImpl } = fakeFetch(() =>
      json({
        records: [
          { kind: 'match', id: 'm-test', data: toMatchRecord(makeMatch()), updatedAt: T, deleted: false, fieldVersions: { status: T, unknownField: T } },
          { kind: 'match', id: 'm-legacy', data: toMatchRecord(makeMatch({ id: 'm-legacy' })), updatedAt: T, deleted: false, fieldVersions: null },
          { kind: 'division', id: 'div-test', data: makeDivision(), updatedAt: T, deleted: false, fieldVersions: null },
        ],
        events: [],
        cursor: '7',
        hasMore: false,
        epoch: 'epoch-1',
      })
    );
    const result = await createHttpSyncApi(fetchImpl).pull('1');
    assert.ok(result.ok);
    const [match, legacy, division] = result.value.records;
    assert.deepStrictEqual(match.kind === 'match' && match.fieldVersions, { 'game-state': T }, 'a legacy per-field version folds into its group');
    assert.ok(!('fieldVersions' in legacy), 'no field versions means every field changed at updatedAt');
    assert.ok(!('fieldVersions' in division));
  });

  it('posts the push batch as JSON and parses the result', async () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      json({ accepted: ['m-test'], rejected: [{ id: 'ev-1', reason: 'STALE' }], cursor: '77' })
    );
    const payload = {
      records: [{ kind: 'match' as const, id: 'm-test', data: toMatchRecord(makeMatch()), updatedAt: '2026-10-30T18:00:00.000Z', deleted: false }],
      events: [],
    };
    const result = await createHttpSyncApi(fetchImpl).push(payload, 'epoch-1');
    assert.deepStrictEqual(result, {
      ok: true,
      value: { accepted: ['m-test'], rejected: [{ id: 'ev-1', reason: 'STALE' }], cursor: '77' },
    });
    assert.strictEqual(calls[0].url, '/api/sync/push');
    assert.strictEqual(calls[0].init?.method, 'POST');
    assert.strictEqual(new Headers(calls[0].init?.headers).get('Content-Type'), 'application/json');
    assert.deepStrictEqual(JSON.parse(String(calls[0].init?.body)), { ...payload, epoch: 'epoch-1' });
  });

  it('returns the data epoch of a pull and refuses a pull without one (S1)', async () => {
    const page = { records: [], events: [], cursor: '3', hasMore: false };
    const withEpoch = await createHttpSyncApi(fakeFetch(() => json({ ...page, epoch: 'epoch-9' })).fetchImpl).pull('1');
    assert.ok(withEpoch.ok);
    assert.strictEqual(withEpoch.value.epoch, 'epoch-9');
    const without = await createHttpSyncApi(fakeFetch(() => json(page)).fetchImpl).pull('1');
    assert.deepStrictEqual(without, { ok: false, error: 'INVALID_RESPONSE', status: 200 });
  });

  it('maps a push refused for another data epoch to EPOCH_MISMATCH (S1)', async () => {
    const payload = { records: [], events: [] };
    const refused = await createHttpSyncApi(
      fakeFetch(() => json({ error: 'Datos reemplazados', reason: 'EPOCH_MISMATCH' }, 409)).fetchImpl
    ).push(payload, 'epoch-old');
    assert.deepStrictEqual(refused, { ok: false, error: 'EPOCH_MISMATCH', status: 409, message: 'Datos reemplazados' });
    const conflict = await createHttpSyncApi(fakeFetch(() => json({ error: 'Otro' }, 409)).fetchImpl).push(payload, 'e');
    assert.deepStrictEqual(conflict, { ok: false, error: 'HTTP', status: 409, message: 'Otro' });
  });

  it('maps 401, HTTP errors, network failures and malformed bodies', async () => {
    const unauthorized = await createHttpSyncApi(fakeFetch(() => json({ error: 'No' }, 401)).fetchImpl).pull(null);
    assert.deepStrictEqual(unauthorized, { ok: false, error: 'UNAUTHORIZED', status: 401, message: 'No' });

    const tooLarge = await createHttpSyncApi(fakeFetch(() => json({ error: 'Demasiados' }, 413)).fetchImpl).pull(null);
    assert.deepStrictEqual(tooLarge, { ok: false, error: 'HTTP', status: 413, message: 'Demasiados' });

    const offline = await createHttpSyncApi(
      fakeFetch(() => Promise.reject(new TypeError('Failed to fetch'))).fetchImpl
    ).pull(null);
    assert.deepStrictEqual(offline, { ok: false, error: 'NETWORK' });

    const malformed = await createHttpSyncApi(fakeFetch(() => json({ cursor: 5 })).fetchImpl).pull(null);
    assert.deepStrictEqual(malformed, { ok: false, error: 'INVALID_RESPONSE', status: 200 });
  });
});

describe('request timeout', () => {
  it('bounds every API request with an abort signal so a hung server cannot block sync or logout', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({ records: [], events: [], cursor: '0', hasMore: false, epoch: 'epoch-1' }));
    await createHttpSyncApi(fetchImpl).pull(null);
    await createHttpAuthApi(fetchImpl).logout();
    assert.strictEqual(calls.length, 2);
    for (const call of calls) assert.ok(call.init?.signal instanceof AbortSignal, call.url);
  });

  it('maps an aborted request to NETWORK', async () => {
    const { fetchImpl } = fakeFetch(() => Promise.reject(new DOMException('timed out', 'TimeoutError')));
    assert.deepStrictEqual(await createHttpAuthApi(fetchImpl).logout(), { ok: false, error: 'NETWORK' });
  });
});

describe('http auth api', () => {
  it('logs in with JSON credentials and returns the public user', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({ user: USER }));
    const result = await createHttpAuthApi(fetchImpl).login('admin@camg.com.ar', 'camg1922');
    assert.deepStrictEqual(result, { ok: true, value: USER });
    assert.strictEqual(calls[0].url, '/api/auth/login');
    assert.deepStrictEqual(JSON.parse(String(calls[0].init?.body)), { email: 'admin@camg.com.ar', password: 'camg1922' });
  });

  it('returns the generic server message on bad credentials', async () => {
    const { fetchImpl } = fakeFetch(() => json({ error: 'Email o contraseña incorrectos' }, 401));
    const result = await createHttpAuthApi(fetchImpl).login('x@y.z', 'nope');
    assert.deepStrictEqual(result, {
      ok: false,
      error: 'UNAUTHORIZED',
      status: 401,
      message: 'Email o contraseña incorrectos',
    });
  });

  it('returns the message and reason of a blocked login (S1)', async () => {
    const message = 'Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.';
    const { fetchImpl } = fakeFetch(() => json({ error: message, reason: 'TOO_MANY_ATTEMPTS' }, 429));
    const result = await createHttpAuthApi(fetchImpl).login('x@y.z', 'nope');
    assert.deepStrictEqual(result, { ok: false, error: 'HTTP', status: 429, message, reason: 'TOO_MANY_ATTEMPTS' });
  });

  it('reads the session user and logs out with a JSON request', async () => {
    const { fetchImpl, calls } = fakeFetch((call) => (call.url.endsWith('/me') ? json({ user: USER }) : json({ ok: true })));
    const api = createHttpAuthApi(fetchImpl);
    assert.deepStrictEqual(await api.me(), { ok: true, value: USER });
    assert.deepStrictEqual(await api.logout(), { ok: true, value: undefined });
    assert.strictEqual(calls[1].init?.method, 'POST');
    assert.strictEqual(new Headers(calls[1].init?.headers).get('Content-Type'), 'application/json');
  });
});

describe('http auth api: change own password (S3, S5)', () => {
  it('posts the current and new password as JSON and returns the updated user', async () => {
    const changed = { ...USER, mustChangePassword: false };
    const { fetchImpl, calls } = fakeFetch(() => json({ user: changed }));
    const result = await createHttpAuthApi(fetchImpl).changePassword('temporal-123', 'nueva-clave-1');
    assert.deepStrictEqual(result, { ok: true, value: changed });
    assert.strictEqual(calls[0].url, '/api/auth/password');
    assert.strictEqual(calls[0].init?.method, 'POST');
    assert.strictEqual(new Headers(calls[0].init?.headers).get('Content-Type'), 'application/json');
    assert.deepStrictEqual(JSON.parse(String(calls[0].init?.body)), {
      currentPassword: 'temporal-123',
      newPassword: 'nueva-clave-1',
    });
  });

  it('returns the server message and reason when the current password is wrong', async () => {
    const { fetchImpl } = fakeFetch(() =>
      json({ error: 'La contraseña actual no es correcta.', reason: 'WRONG_CURRENT_PASSWORD' }, 400)
    );
    const result = await createHttpAuthApi(fetchImpl).changePassword('mal', 'nueva-clave-1');
    assert.deepStrictEqual(result, {
      ok: false,
      error: 'HTTP',
      status: 400,
      message: 'La contraseña actual no es correcta.',
      reason: 'WRONG_CURRENT_PASSWORD',
    });
  });

  it('returns the message and reason of a blocked password change (S2)', async () => {
    const message = 'Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.';
    const { fetchImpl } = fakeFetch(() => json({ error: message, reason: 'TOO_MANY_ATTEMPTS' }, 429));
    const result = await createHttpAuthApi(fetchImpl).changePassword('mal', 'nueva-clave-1');
    assert.deepStrictEqual(result, { ok: false, error: 'HTTP', status: 429, message, reason: 'TOO_MANY_ATTEMPTS' });
  });

  it('maps a lost session, a network failure and a malformed user', async () => {
    const lost = await createHttpAuthApi(fakeFetch(() => json({ error: 'No autenticado' }, 401)).fetchImpl).changePassword('a', 'b');
    assert.deepStrictEqual(lost, { ok: false, error: 'UNAUTHORIZED', status: 401, message: 'No autenticado' });
    const offline = await createHttpAuthApi(fakeFetch(() => Promise.reject(new TypeError('x'))).fetchImpl).changePassword('a', 'b');
    assert.deepStrictEqual(offline, { ok: false, error: 'NETWORK' });
    const malformed = await createHttpAuthApi(fakeFetch(() => json({ user: { id: 'x' } })).fetchImpl).changePassword('a', 'b');
    assert.deepStrictEqual(malformed, { ok: false, error: 'INVALID_RESPONSE', status: 200 });
  });
});

const MANAGED = {
  id: 'user-coach-1',
  email: 'fbalbi@camg.com.ar',
  name: 'Federico Balbi',
  role: 'HEAD_COACH',
  active: true,
  mustChangePassword: true,
  createdAt: '2026-11-01T12:00:00.000Z',
};

describe('http users api (S1, S2, S4, S6)', () => {
  it('lists every account', async () => {
    const inactive = { ...MANAGED, id: 'user-2', active: false, mustChangePassword: false };
    const { fetchImpl, calls } = fakeFetch(() => json({ users: [MANAGED, inactive] }));
    const result = await createHttpUsersApi(fetchImpl).list();
    assert.deepStrictEqual(result, { ok: true, value: [MANAGED, inactive] });
    assert.strictEqual(calls[0].url, '/api/users');
    assert.strictEqual(calls[0].init?.method, 'GET');
    assert.strictEqual(calls[0].init?.cache, 'no-store');
  });

  it('refuses a malformed list', async () => {
    const { fetchImpl } = fakeFetch(() => json({ users: [{ ...MANAGED, active: 'yes' }] }));
    assert.deepStrictEqual(await createHttpUsersApi(fetchImpl).list(), { ok: false, error: 'INVALID_RESPONSE', status: 200 });
  });

  it('returns the server message of a refusal without MANAGE_USERS', async () => {
    const { fetchImpl } = fakeFetch(() => json({ error: 'Solo el administrador puede gestionar usuarios.' }, 403));
    assert.deepStrictEqual(await createHttpUsersApi(fetchImpl).list(), {
      ok: false,
      error: 'HTTP',
      status: 403,
      message: 'Solo el administrador puede gestionar usuarios.',
    });
  });

  it('creates an account with a temporary password', async () => {
    const input = { name: 'Federico Balbi', email: 'fbalbi@camg.com.ar', role: 'HEAD_COACH' as const, temporaryPassword: 'Tmp-12345678' };
    const { fetchImpl, calls } = fakeFetch(() => json({ user: MANAGED }, 201));
    assert.deepStrictEqual(await createHttpUsersApi(fetchImpl).create(input), { ok: true, value: MANAGED });
    assert.strictEqual(calls[0].url, '/api/users');
    assert.strictEqual(calls[0].init?.method, 'POST');
    assert.strictEqual(new Headers(calls[0].init?.headers).get('Content-Type'), 'application/json');
    assert.deepStrictEqual(JSON.parse(String(calls[0].init?.body)), input);
  });

  it('returns the reason and message of a taken email', async () => {
    const { fetchImpl } = fakeFetch(() => json({ error: 'Ya existe un usuario con ese email.', reason: 'EMAIL_TAKEN' }, 409));
    const result = await createHttpUsersApi(fetchImpl).create({ name: 'X Y', email: 'a@b.c', role: 'ADMIN', temporaryPassword: '12345678' });
    assert.deepStrictEqual(result, {
      ok: false,
      error: 'HTTP',
      status: 409,
      message: 'Ya existe un usuario con ese email.',
      reason: 'EMAIL_TAKEN',
    });
  });

  it('patches only the given fields of one account', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({ user: { ...MANAGED, active: false } }));
    const result = await createHttpUsersApi(fetchImpl).update('user/1', { active: false });
    assert.deepStrictEqual(result, { ok: true, value: { ...MANAGED, active: false } });
    assert.strictEqual(calls[0].url, '/api/users/user%2F1');
    assert.strictEqual(calls[0].init?.method, 'PATCH');
    assert.strictEqual(new Headers(calls[0].init?.headers).get('Content-Type'), 'application/json');
    assert.deepStrictEqual(JSON.parse(String(calls[0].init?.body)), { active: false });
  });

  it('returns the guard refusals of an update as-is', async () => {
    const message = 'Debe quedar al menos un administrador activo: no puedes desactivar ni cambiar el rol del último.';
    const { fetchImpl } = fakeFetch(() => json({ error: message, reason: 'LAST_ADMIN' }, 409));
    assert.deepStrictEqual(await createHttpUsersApi(fetchImpl).update('user-admin-1', { role: 'HEAD_COACH' }), {
      ok: false,
      error: 'HTTP',
      status: 409,
      message,
      reason: 'LAST_ADMIN',
    });
  });

  it('resets the password of one account', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({ user: MANAGED }));
    const result = await createHttpUsersApi(fetchImpl).resetPassword('user-coach-1', 'Tmp-87654321');
    assert.deepStrictEqual(result, { ok: true, value: MANAGED });
    assert.strictEqual(calls[0].url, '/api/users/user-coach-1/password');
    assert.strictEqual(calls[0].init?.method, 'POST');
    assert.deepStrictEqual(JSON.parse(String(calls[0].init?.body)), { temporaryPassword: 'Tmp-87654321' });
  });

  it('maps a missing account and a network failure', async () => {
    const missing = await createHttpUsersApi(
      fakeFetch(() => json({ error: 'El usuario no existe.', reason: 'USER_NOT_FOUND' }, 404)).fetchImpl
    ).resetPassword('gone', 'Tmp-87654321');
    assert.deepStrictEqual(missing, { ok: false, error: 'HTTP', status: 404, message: 'El usuario no existe.', reason: 'USER_NOT_FOUND' });
    const offline = await createHttpUsersApi(fakeFetch(() => Promise.reject(new TypeError('x'))).fetchImpl).list();
    assert.deepStrictEqual(offline, { ok: false, error: 'NETWORK' });
  });
});

describe('sync refusal while the password must change (S3)', () => {
  it('exposes the PASSWORD_CHANGE_REQUIRED reason of a refused pull', async () => {
    const { fetchImpl } = fakeFetch(() =>
      json({ error: 'Debes cambiar tu contraseña temporal antes de continuar.', reason: 'PASSWORD_CHANGE_REQUIRED' }, 403)
    );
    assert.deepStrictEqual(await createHttpSyncApi(fetchImpl).pull(null), {
      ok: false,
      error: 'HTTP',
      status: 403,
      message: 'Debes cambiar tu contraseña temporal antes de continuar.',
      reason: 'PASSWORD_CHANGE_REQUIRED',
    });
  });
});
