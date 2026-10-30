import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isSameOriginRequest } from './same-origin';

function post(headers: Record<string, string>, url = 'http://localhost:3000/api/auth/logout'): Request {
  return new Request(url, { method: 'POST', headers });
}

describe('isSameOriginRequest', () => {
  it('accepts requests without an Origin header (non-browser clients)', () => {
    assert.strictEqual(isSameOriginRequest(post({})), true);
  });

  it('accepts an Origin whose host matches the Host header', () => {
    assert.strictEqual(isSameOriginRequest(post({ origin: 'http://localhost:3000', host: 'localhost:3000' })), true);
    assert.strictEqual(
      isSameOriginRequest(post({ origin: 'http://192.168.0.20:3000', host: '192.168.0.20:3000' })),
      true
    );
    assert.strictEqual(isSameOriginRequest(post({ origin: 'https://hoop.camg.com.ar', host: 'Hoop.CAMG.com.ar' })), true);
  });

  it('falls back to the request URL host when there is no Host header', () => {
    assert.strictEqual(isSameOriginRequest(post({ origin: 'http://localhost:3000' })), true);
    assert.strictEqual(isSameOriginRequest(post({ origin: 'http://localhost:4000' })), false);
  });

  it('prefers the first X-Forwarded-Host (reverse proxy) over Host', () => {
    assert.strictEqual(
      isSameOriginRequest(
        post({ origin: 'https://hoop.camg.com.ar', host: '127.0.0.1:3000', 'x-forwarded-host': 'hoop.camg.com.ar, proxy' })
      ),
      true
    );
  });

  it('rejects a different host, port, or an opaque/malformed Origin', () => {
    assert.strictEqual(isSameOriginRequest(post({ origin: 'http://evil.example', host: 'localhost:3000' })), false);
    assert.strictEqual(isSameOriginRequest(post({ origin: 'http://localhost:4000', host: 'localhost:3000' })), false);
    assert.strictEqual(isSameOriginRequest(post({ origin: 'null', host: 'localhost:3000' })), false);
    assert.strictEqual(isSameOriginRequest(post({ origin: 'not a url', host: 'localhost:3000' })), false);
  });
});
