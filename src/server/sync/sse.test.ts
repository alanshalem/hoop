import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createSyncEventStream,
  formatChangedEvent,
  HEARTBEAT_COMMENT,
  HEARTBEAT_INTERVAL_MS,
  SSE_HEADERS,
  STREAM_OPENED,
} from './sse';

type ChangeListener = (cursor: string) => void;

/** In-memory stand-in for the shared LISTEN connection. */
function fakeHub() {
  const listeners = new Set<ChangeListener>();
  let unsubscribed = 0;
  return {
    subscribe(listener: ChangeListener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        unsubscribed += 1;
      };
    },
    emit(cursor: string) {
      for (const listener of listeners) listener(cursor);
    },
    get size() {
      return listeners.size;
    },
    get unsubscribed() {
      return unsubscribed;
    },
  };
}

const decoder = new TextDecoder();

async function next(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string | null> {
  const { value, done } = await reader.read();
  return done ? null : decoder.decode(value);
}

describe('SSE wire format', () => {
  it('formats a changed event with the cursor as JSON', () => {
    assert.strictEqual(formatChangedEvent('42'), 'event: changed\ndata: {"cursor":"42"}\n\n');
  });

  it('uses a comment as heartbeat every 25 s and opens with a comment plus retry hint', () => {
    assert.strictEqual(HEARTBEAT_COMMENT, ': heartbeat\n\n');
    assert.strictEqual(HEARTBEAT_INTERVAL_MS, 25_000);
    assert.strictEqual(STREAM_OPENED, ': connected\nretry: 5000\n\n');
  });

  it('declares an uncached, unbuffered event stream', () => {
    assert.deepStrictEqual(SSE_HEADERS, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
  });
});

describe('createSyncEventStream', () => {
  it('opens, forwards every change as an event and cleans up when aborted', async () => {
    const hub = fakeHub();
    const abort = new AbortController();
    const reader = createSyncEventStream({ subscribe: hub.subscribe, signal: abort.signal }).getReader();

    assert.strictEqual(await next(reader), STREAM_OPENED);
    assert.strictEqual(hub.size, 1);

    hub.emit('7');
    assert.strictEqual(await next(reader), formatChangedEvent('7'));
    hub.emit('8');
    assert.strictEqual(await next(reader), formatChangedEvent('8'));

    abort.abort();
    assert.strictEqual(await next(reader), null);
    assert.strictEqual(hub.size, 0);
    assert.strictEqual(hub.unsubscribed, 1);
  });

  it('sends heartbeats on the interval', async () => {
    const hub = fakeHub();
    const abort = new AbortController();
    const reader = createSyncEventStream({ subscribe: hub.subscribe, signal: abort.signal, heartbeatMs: 10 }).getReader();

    assert.strictEqual(await next(reader), STREAM_OPENED);
    assert.strictEqual(await next(reader), HEARTBEAT_COMMENT);
    assert.strictEqual(await next(reader), HEARTBEAT_COMMENT);
    abort.abort();
    assert.strictEqual(await next(reader), null);
  });

  it('closes the stream when the session is no longer valid at a heartbeat', async () => {
    const hub = fakeHub();
    let valid = true;
    const reader = createSyncEventStream({
      subscribe: hub.subscribe,
      heartbeatMs: 10,
      isSessionValid: async () => valid,
    }).getReader();

    assert.strictEqual(await next(reader), STREAM_OPENED);
    assert.strictEqual(await next(reader), HEARTBEAT_COMMENT);
    valid = false;
    assert.strictEqual(await next(reader), null);
    assert.strictEqual(hub.size, 0);
  });

  it('cleans up when the consumer cancels', async () => {
    const hub = fakeHub();
    const reader = createSyncEventStream({ subscribe: hub.subscribe, heartbeatMs: 10 }).getReader();

    assert.strictEqual(await next(reader), STREAM_OPENED);
    await reader.cancel();
    assert.strictEqual(hub.size, 0);
    assert.strictEqual(hub.unsubscribed, 1);
  });

  it('closes immediately when the request is already aborted', async () => {
    const hub = fakeHub();
    const abort = new AbortController();
    abort.abort();
    const reader = createSyncEventStream({ subscribe: hub.subscribe, signal: abort.signal }).getReader();

    assert.strictEqual(await next(reader), null);
    assert.strictEqual(hub.size, 0);
  });
});
