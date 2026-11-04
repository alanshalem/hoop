import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createHttpAuthApi, createHttpSyncApi } from './http-sync-api';
import { parseChangedEventData } from './sync-api-schemas';
import { toMatchRecord } from '@/core/application/sync/sync-records';
import { makeChartCode, makeDivision, makeEvent, makeMatch, makeRivalTeam } from '@/core/testing/fixtures';

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

const USER = { id: 'user-admin-1', email: 'admin@camg.com.ar', name: 'Admin', role: 'ADMIN' };

describe('http sync api', () => {
  it('pulls the full snapshot without `since` and pages with it', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({ records: [], events: [], cursor: '0', hasMore: false }));
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
      })
    );
    const result = await createHttpSyncApi(fetchImpl).pull('1');
    assert.ok(result.ok);
    assert.deepStrictEqual(result.value.records, [
      { kind: 'rivalTeam', id: valid.id, data: valid, updatedAt: T, deleted: false },
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
    const result = await createHttpSyncApi(fetchImpl).push(payload);
    assert.deepStrictEqual(result, {
      ok: true,
      value: { accepted: ['m-test'], rejected: [{ id: 'ev-1', reason: 'STALE' }], cursor: '77' },
    });
    assert.strictEqual(calls[0].url, '/api/sync/push');
    assert.strictEqual(calls[0].init?.method, 'POST');
    assert.strictEqual(new Headers(calls[0].init?.headers).get('Content-Type'), 'application/json');
    assert.deepStrictEqual(JSON.parse(String(calls[0].init?.body)), payload);
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
    const { fetchImpl, calls } = fakeFetch(() => json({ records: [], events: [], cursor: '0', hasMore: false }));
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

  it('reads the session user and logs out with a JSON request', async () => {
    const { fetchImpl, calls } = fakeFetch((call) => (call.url.endsWith('/me') ? json({ user: USER }) : json({ ok: true })));
    const api = createHttpAuthApi(fetchImpl);
    assert.deepStrictEqual(await api.me(), { ok: true, value: USER });
    assert.deepStrictEqual(await api.logout(), { ok: true, value: undefined });
    assert.strictEqual(calls[1].init?.method, 'POST');
    assert.strictEqual(new Headers(calls[1].init?.headers).get('Content-Type'), 'application/json');
  });
});

describe('parseChangedEventData', () => {
  it('reads the cursor of an SSE `changed` event', () => {
    assert.strictEqual(parseChangedEventData('{"cursor":"120"}'), '120');
    assert.strictEqual(parseChangedEventData('{"cursor":12}'), null);
    assert.strictEqual(parseChangedEventData('not json'), null);
  });
});
