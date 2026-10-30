import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isJsonRequest, readJsonBody } from './read-json';

function post(body: BodyInit, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/sync/push', { method: 'POST', body, headers });
}

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe('isJsonRequest', () => {
  it('accepts application/json with or without parameters, any case', () => {
    assert.strictEqual(isJsonRequest(post('{}', { 'content-type': 'application/json' })), true);
    assert.strictEqual(isJsonRequest(post('{}', { 'content-type': 'Application/JSON; charset=utf-8' })), true);
  });

  it('rejects other or missing content types', () => {
    assert.strictEqual(isJsonRequest(post('{}', { 'content-type': 'text/plain' })), false);
    assert.strictEqual(isJsonRequest(post('a=1', { 'content-type': 'application/x-www-form-urlencoded' })), false);
    assert.strictEqual(isJsonRequest(new Request('http://localhost/', { method: 'POST' })), false);
  });
});

describe('readJsonBody', () => {
  it('parses a JSON body within the limit', async () => {
    assert.deepStrictEqual(await readJsonBody(post('{"records":[1,"ñ"]}'), 1024), {
      ok: true,
      value: { records: [1, 'ñ'] },
    });
  });

  it('accepts a body of exactly the limit in bytes', async () => {
    const body = JSON.stringify({ a: 'x'.repeat(10) });
    const bytes = new TextEncoder().encode(body).length;
    assert.deepStrictEqual(await readJsonBody(post(body), bytes), { ok: true, value: { a: 'x'.repeat(10) } });
  });

  it('rejects a body over the limit by its declared length, before reading it', async () => {
    const request = post('{}', { 'content-length': '2048' });
    assert.deepStrictEqual(await readJsonBody(request, 1024), { ok: false, error: 'TOO_LARGE' });
  });

  it('rejects a streamed body that grows over the limit (no declared length)', async () => {
    const request = new Request('http://localhost/', {
      method: 'POST',
      body: streamOf(['{"a":"', 'x'.repeat(600), 'x'.repeat(600), '"}']),
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    assert.deepStrictEqual(await readJsonBody(request, 1024), { ok: false, error: 'TOO_LARGE' });
  });

  it('counts bytes, not characters', async () => {
    const body = JSON.stringify('ñ'.repeat(10)); // 22 bytes, 12 characters
    assert.deepStrictEqual(await readJsonBody(post(body), 21), { ok: false, error: 'TOO_LARGE' });
  });

  it('rejects invalid or empty JSON', async () => {
    assert.deepStrictEqual(await readJsonBody(post('{"records":'), 1024), { ok: false, error: 'INVALID_JSON' });
    assert.deepStrictEqual(await readJsonBody(post(''), 1024), { ok: false, error: 'INVALID_JSON' });
    assert.deepStrictEqual(await readJsonBody(new Request('http://localhost/', { method: 'POST' }), 1024), {
      ok: false,
      error: 'INVALID_JSON',
    });
  });
});
