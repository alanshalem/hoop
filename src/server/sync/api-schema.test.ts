import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MAX_PUSH_EVENTS, MAX_PUSH_RECORDS, parsePushBody, parseSinceCursor } from './api-schema';

const RECORD = {
  kind: 'player',
  id: 'p-1',
  data: { id: 'p-1', firstName: 'Ana' },
  updatedAt: '2026-10-30T10:00:00.000Z',
  deleted: false,
};
const EVENT = { id: 'e-1', matchId: 'm-1', data: { id: 'e-1' }, deleted: false };

describe('push body schema', () => {
  it('parses records and events, turning updatedAt into a Date and keeping data untouched', () => {
    const result = parsePushBody({ records: [RECORD], events: [EVENT] });
    assert.ok(result.ok);
    assert.deepStrictEqual(result.value, {
      records: [{ ...RECORD, updatedAt: new Date('2026-10-30T10:00:00.000Z') }],
      events: [EVENT],
    });
  });

  it('defaults missing lists to empty and drops unknown keys', () => {
    const result = parsePushBody({ cursor: '12', records: [{ ...RECORD, extra: true }] });
    assert.ok(result.ok);
    assert.deepStrictEqual(result.value.events, []);
    assert.deepStrictEqual(Object.keys(result.value).sort(), ['events', 'records']);
    assert.deepStrictEqual(Object.keys(result.value.records[0]).sort(), ['data', 'deleted', 'id', 'kind', 'updatedAt']);
    assert.deepStrictEqual(parsePushBody({}), { ok: true, value: { records: [], events: [] } });
  });

  it('keeps the data epoch of the push; a missing one is refused later by the push (S1, L5)', () => {
    assert.deepStrictEqual(parsePushBody({ epoch: 'epoch-1' }), { ok: true, value: { records: [], events: [], epoch: 'epoch-1' } });
    assert.deepStrictEqual(parsePushBody({ epoch: '' }), { ok: false, status: 400 });
    assert.deepStrictEqual(parsePushBody({ epoch: 5 }), { ok: false, status: 400 });
  });

  it('parses match field versions: known fields only, normalized to UTC (S13.1)', () => {
    const record = {
      ...RECORD,
      kind: 'match',
      fieldVersions: { status: '2026-10-30T07:00:00.000-03:00', unknownField: '2026-10-30T10:00:00.000Z' },
    };
    const result = parsePushBody({ records: [record] });
    assert.ok(result.ok);
    assert.deepStrictEqual(result.value.records[0].fieldVersions, { 'game-state': '2026-10-30T10:00:00.000Z' }, 'a legacy per-field version folds into its group');
    assert.deepStrictEqual(parsePushBody({ records: [{ ...record, fieldVersions: { status: 'yesterday' } }] }), {
      ok: false,
      status: 400,
    });
  });

  it('accepts updatedAt with a UTC offset and normalizes it', () => {
    const result = parsePushBody({ records: [{ ...RECORD, updatedAt: '2026-10-30T07:00:00.000-03:00' }] });
    assert.ok(result.ok);
    assert.strictEqual(result.value.records[0].updatedAt.toISOString(), '2026-10-30T10:00:00.000Z');
  });

  it(`accepts exactly ${MAX_PUSH_RECORDS} records and ${MAX_PUSH_EVENTS} events`, () => {
    assert.strictEqual(MAX_PUSH_RECORDS, 500);
    assert.strictEqual(MAX_PUSH_EVENTS, 2000);
    const result = parsePushBody({
      records: Array.from({ length: MAX_PUSH_RECORDS }, () => RECORD),
      events: Array.from({ length: MAX_PUSH_EVENTS }, () => EVENT),
    });
    assert.ok(result.ok);
  });

  it('answers 413 when a list is over its limit', () => {
    assert.deepStrictEqual(parsePushBody({ records: Array.from({ length: MAX_PUSH_RECORDS + 1 }, () => RECORD) }), {
      ok: false,
      status: 413,
    });
    assert.deepStrictEqual(parsePushBody({ events: Array.from({ length: MAX_PUSH_EVENTS + 1 }, () => EVENT) }), {
      ok: false,
      status: 413,
    });
  });

  it('answers 400 for malformed bodies or envelopes', () => {
    const bodies: unknown[] = [
      null,
      'records',
      [],
      { records: 'p-1' },
      { events: {} },
      { records: [{ ...RECORD, kind: 'event' }] },
      { records: [{ ...RECORD, id: '' }] },
      { records: [{ ...RECORD, id: 'x'.repeat(201) }] },
      { records: [{ ...RECORD, id: undefined }] },
      { records: [{ ...RECORD, updatedAt: '2026-10-30T10:00:00' }] },
      { records: [{ ...RECORD, updatedAt: 'yesterday' }] },
      { records: [{ ...RECORD, updatedAt: 1761818400000 }] },
      { records: [{ ...RECORD, deleted: 'false' }] },
      { records: [{ ...RECORD, deleted: undefined }] },
      { events: [{ ...EVENT, matchId: undefined }] },
      { events: [{ ...EVENT, matchId: '' }] },
      { events: [{ ...EVENT, deleted: 1 }] },
    ];
    for (const body of bodies) {
      assert.deepStrictEqual(parsePushBody(body), { ok: false, status: 400 }, JSON.stringify(body));
    }
  });
});

describe('pull cursor (since)', () => {
  it('starts from 0 when missing or empty (full snapshot)', () => {
    assert.deepStrictEqual(parseSinceCursor(null), { ok: true, value: 0 });
    assert.deepStrictEqual(parseSinceCursor(''), { ok: true, value: 0 });
  });

  it('parses non-negative integer strings', () => {
    assert.deepStrictEqual(parseSinceCursor('0'), { ok: true, value: 0 });
    assert.deepStrictEqual(parseSinceCursor('1061'), { ok: true, value: 1061 });
    assert.deepStrictEqual(parseSinceCursor(String(Number.MAX_SAFE_INTEGER)), {
      ok: true,
      value: Number.MAX_SAFE_INTEGER,
    });
  });

  it('rejects anything else', () => {
    for (const value of ['-1', 'abc', '1.5', '1e3', ' 4', '0x10', '9007199254740992']) {
      assert.deepStrictEqual(parseSinceCursor(value), { ok: false }, value);
    }
  });
});
