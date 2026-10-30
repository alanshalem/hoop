import { describe, it } from 'node:test';
import assert from 'node:assert';
import { makeMatch, makePlayer } from '@/core/testing/fixtures';
import { dropSupersededChanges } from './stale-diff';
import type { ClubDiff } from './sync-types';

const at = (ms: number) => new Date(ms).toISOString();
const match = makeMatch({ id: 'm1', status: 'LIVE', currentQuarter: 'Q2', quarterTimeRemainingSeconds: 250, venue: 'Gimnasio', events: [] });

describe('dropSupersededChanges (S13.3: a handed-off edit never beats a newer local version)', () => {
  it('drops a record change when the local version is the same age or newer, keeps it when older or unknown', () => {
    const diff: ClubDiff = { records: [{ kind: 'player', id: 'p1', data: makePlayer({ id: 'p1', dorsal: 9 }), deleted: false }], events: [] };
    assert.deepStrictEqual(dropSupersededChanges(diff, 1_000, { 'player:p1': at(2_000) }).records, []);
    assert.deepStrictEqual(dropSupersededChanges(diff, 1_000, { 'player:p1': at(1_000) }).records, []);
    assert.deepStrictEqual(dropSupersededChanges(diff, 1_000, { 'player:p1': at(500) }).records, diff.records);
    assert.deepStrictEqual(dropSupersededChanges(diff, 1_000, {}).records, diff.records);
  });

  it('keeps only the match field groups the local versions have not superseded', () => {
    const diff: ClubDiff = {
      records: [{ kind: 'match', id: 'm1', data: match, deleted: false, changedFields: ['quarterTimeRemainingSeconds', 'venue'] }],
      events: [],
    };
    const versions = { 'match:m1': at(500), 'match:m1#game-state': at(5_000) };
    const [kept] = dropSupersededChanges(diff, 1_000, versions).records;
    assert.ok(kept && kept.kind === 'match' && !kept.deleted);
    assert.deepStrictEqual(kept.changedFields, ['venue'], 'the stale clock is dropped, the venue survives');

    const clockOnly: ClubDiff = { records: [{ ...diff.records[0], changedFields: ['quarterTimeRemainingSeconds'] } as ClubDiff['records'][number]], events: [] };
    assert.deepStrictEqual(dropSupersededChanges(clockOnly, 1_000, versions).records, []);
  });

  it('keeps event changes: events are append-only and tombstones always win', () => {
    const diff: ClubDiff = { records: [], events: [{ id: 'e1', matchId: 'm1', deleted: true, data: { id: 'e1' } as never }] };
    assert.deepStrictEqual(dropSupersededChanges(diff, 1_000, { 'match:m1': at(9_000) }).events, diff.events);
  });
});
