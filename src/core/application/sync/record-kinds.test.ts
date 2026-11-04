import { describe, it } from 'node:test';
import assert from 'node:assert';
import { makeClubData, makeDivision, makeMatch } from '@/core/testing/fixtures';
import { createCollections, toData } from './club-collections';
import { createEmptyClubData, pickSyncableClubData, SYNC_RECORD_KINDS, SYNC_RECORDS } from './record-kinds';

describe('sync record-kind registry', () => {
  it('lists every kind exactly once, in the Postgres enum order', () => {
    assert.deepStrictEqual(SYNC_RECORD_KINDS, ['division', 'team', 'player', 'match', 'chartCode', 'rivalTeam', 'coach']);
    assert.deepStrictEqual(Object.keys(SYNC_RECORDS), SYNC_RECORD_KINDS);
  });

  it('maps each kind to its own club data collection', () => {
    const keys = SYNC_RECORD_KINDS.map((kind) => SYNC_RECORDS[kind].collectionKey);
    assert.strictEqual(new Set(keys).size, keys.length);
    assert.deepStrictEqual(Object.keys(createEmptyClubData()).sort(), [...keys].sort());
    assert.deepStrictEqual(
      keys,
      ['divisions', 'teams', 'players', 'matches', 'chartCodes', 'rivalTeams', 'coaches']
    );
  });

  it('flags only match as carrying events', () => {
    const withEvents = SYNC_RECORD_KINDS.filter((kind) => 'hasEvents' in SYNC_RECORDS[kind]);
    assert.deepStrictEqual(withEvents, ['match']);
  });

  it('builds empty club data with a fresh empty list per collection', () => {
    const empty = createEmptyClubData();
    assert.ok(Object.values(empty).every((list) => Array.isArray(list) && list.length === 0));
    assert.notStrictEqual(createEmptyClubData().divisions, empty.divisions);
  });

  it('picks only the synced collections of a larger state', () => {
    const data = makeClubData({ divisions: [makeDivision()], matches: [makeMatch()] });
    const storeState = { ...data, activeMatchId: 'm-1' };
    const picked = pickSyncableClubData(storeState);
    assert.deepStrictEqual(picked, data);
    assert.strictEqual(picked.divisions, data.divisions);
  });

  it('round-trips untouched collections by reference', () => {
    const data = makeClubData({ divisions: [makeDivision()], matches: [makeMatch()] });
    const roundTrip = toData(createCollections(data));
    for (const kind of SYNC_RECORD_KINDS) {
      const key = SYNC_RECORDS[kind].collectionKey;
      assert.strictEqual(roundTrip[key], data[key], key);
    }
  });
});
