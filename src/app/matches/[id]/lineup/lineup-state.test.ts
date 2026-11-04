import { describe, it } from 'node:test';
import assert from 'node:assert';
import { makeMatch } from '@/core/testing/fixtures';
import { getLineupMode, initialStarterIds } from './lineup-state';

const STARTERS = ['p1', 'p2', 'p3', 'p4', 'p5'];

describe('lineup page state', () => {
  it('maps the match status to the page mode', () => {
    assert.strictEqual(getLineupMode(makeMatch({ status: 'SCHEDULED' })), 'SETUP');
    assert.strictEqual(getLineupMode(makeMatch({ status: 'LIVE' })), 'IN_PLAY');
    assert.strictEqual(getLineupMode(makeMatch({ status: 'HALFTIME' })), 'IN_PLAY');
    assert.strictEqual(getLineupMode(makeMatch({ status: 'FINISHED' })), 'FINISHED');
  });

  it('shows the starters saved at tip-off for a match in play (startingLineupOwn is the only source, L6)', () => {
    const match = makeMatch({ status: 'LIVE', startingLineupOwn: STARTERS });
    assert.deepStrictEqual(initialStarterIds(match, 'IN_PLAY', [...STARTERS, 'p6']), STARTERS);
    assert.deepStrictEqual(initialStarterIds(match, 'FINISHED', STARTERS), STARTERS);
  });

  it('a match in play without saved starters shows nobody as a starter', () => {
    const match = makeMatch({ status: 'LIVE', startingLineupOwn: [] });
    assert.deepStrictEqual(initialStarterIds(match, 'IN_PLAY', STARTERS), []);
  });

  it('before tip-off keeps only starters that are still in the roster list', () => {
    const match = makeMatch({ status: 'SCHEDULED', startingLineupOwn: STARTERS });
    assert.deepStrictEqual(initialStarterIds(match, 'SETUP', ['p1', 'p3', 'p6']), ['p1', 'p3']);
  });
});
