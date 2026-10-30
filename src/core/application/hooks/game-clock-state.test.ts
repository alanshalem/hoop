import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createGameClockState, gameClockReducer } from './game-clock-state';

describe('gameClockReducer', () => {
  it('starts paused with the given seconds', () => {
    assert.deepStrictEqual(createGameClockState('m1:Q1', 600), {
      key: 'm1:Q1',
      seconds: 600,
      isRunning: false,
      expirations: 0,
    });
  });

  it('ticks one second only while running', () => {
    const paused = createGameClockState('k', 10);
    assert.strictEqual(gameClockReducer(paused, { type: 'TICK' }).seconds, 10);
    const running = gameClockReducer(paused, { type: 'START' });
    assert.strictEqual(running.isRunning, true);
    assert.strictEqual(gameClockReducer(running, { type: 'TICK' }).seconds, 9);
  });

  it('stops at 00:00 and counts an expiration', () => {
    const running = gameClockReducer(createGameClockState('k', 1), { type: 'START' });
    const expired = gameClockReducer(running, { type: 'TICK' });
    assert.deepStrictEqual(expired, { key: 'k', seconds: 0, isRunning: false, expirations: 1 });
  });

  it('refuses to start a clock already at 00:00', () => {
    const atZero = createGameClockState('k', 0);
    assert.strictEqual(gameClockReducer(atZero, { type: 'START' }), atZero);
  });

  it('pauses without changing the seconds', () => {
    const running = gameClockReducer(createGameClockState('k', 42), { type: 'START' });
    const paused = gameClockReducer(running, { type: 'PAUSE' });
    assert.strictEqual(paused.isRunning, false);
    assert.strictEqual(paused.seconds, 42);
  });

  it('sets whole non-negative seconds and stops when set to 0', () => {
    const running = gameClockReducer(createGameClockState('k', 100), { type: 'START' });
    assert.strictEqual(gameClockReducer(running, { type: 'SET', seconds: 89.6 }).seconds, 90);
    const zero = gameClockReducer(running, { type: 'SET', seconds: -5 });
    assert.strictEqual(zero.seconds, 0);
    assert.strictEqual(zero.isRunning, false);
    assert.strictEqual(zero.expirations, 0);
  });

  it('resets to a new key paused and keeps the expiration count', () => {
    const expired = { key: 'm1:Q1', seconds: 0, isRunning: false, expirations: 1 };
    assert.deepStrictEqual(
      gameClockReducer(expired, { type: 'RESET', key: 'm1:Q2', seconds: 600 }),
      { key: 'm1:Q2', seconds: 600, isRunning: false, expirations: 1 }
    );
  });
});
