import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  applyPushResult,
  buildPushBatch,
  countPending,
  createEmptyOutbox,
  enqueueChanges,
  markBatchAttempted,
  nextUpdatedAt,
} from './outbox';
import { readFieldVersions, resolveFieldVersions, writeFieldVersions, type MatchField } from './match-fields';
import { toMatchRecord } from './sync-records';
import type { ClubDiff, EventChange, Outbox, RecordChange, VersionMap } from './sync-types';
import { makeEvent, makeMatch, makePlayer } from '@/core/testing/fixtures';

const NOW = Date.parse('2026-10-30T18:00:00.000Z');

const playerChange = (id: string, overrides: Partial<RecordChange> = {}): RecordChange =>
  ({ kind: 'player', id, data: makePlayer({ id }), deleted: false, ...overrides }) as RecordChange;

const eventChange = (id: string, deleted = false): EventChange => ({
  id,
  matchId: 'm-test',
  data: makeEvent({ id }),
  deleted,
});

function enqueue(diff: Partial<ClubDiff>, outbox: Outbox = createEmptyOutbox(), versions: VersionMap = {}, now = NOW) {
  return enqueueChanges({ outbox, versions }, { records: [], events: [], ...diff }, now);
}

describe('nextUpdatedAt', () => {
  it('stamps the current time as ISO 8601', () => {
    assert.strictEqual(nextUpdatedAt(undefined, NOW), '2026-10-30T18:00:00.000Z');
  });

  it('never goes back nor repeats the previous version of the key', () => {
    assert.strictEqual(nextUpdatedAt('2026-10-30T18:00:00.000Z', NOW), '2026-10-30T18:00:00.001Z');
    assert.strictEqual(nextUpdatedAt('2026-10-30T19:00:00.000Z', NOW), '2026-10-30T19:00:00.001Z');
  });
});

describe('enqueueChanges (S10.7 outbox)', () => {
  it('stamps updatedAt into the outbox entry and the versions map', () => {
    const { outbox, versions } = enqueue({ records: [playerChange('p1')] });
    assert.strictEqual(versions['player:p1'], '2026-10-30T18:00:00.000Z');
    assert.strictEqual(outbox.records['player:p1'].updatedAt, '2026-10-30T18:00:00.000Z');
    assert.strictEqual(outbox.records['player:p1'].deleted, false);
    assert.strictEqual(countPending(outbox), 1);
  });

  it('coalesces changes of the same kind:id keeping only the latest', () => {
    const first = enqueue({ records: [playerChange('p1')] });
    const latest = makePlayer({ id: 'p1', dorsal: 99 });
    const second = enqueue({ records: [playerChange('p1', { data: latest })] }, first.outbox, first.versions, NOW);
    assert.strictEqual(countPending(second.outbox), 1);
    assert.strictEqual(second.outbox.records['player:p1'].data, latest);
    assert.strictEqual(second.outbox.records['player:p1'].updatedAt, '2026-10-30T18:00:00.001Z');
  });

  it('keeps the same id of different kinds apart', () => {
    const match = makeMatch({ id: 'x1' });
    const { outbox } = enqueue({
      records: [
        playerChange('x1'),
        { kind: 'match', id: 'x1', data: match, deleted: false },
      ],
    });
    assert.deepStrictEqual(Object.keys(outbox.records), ['player:x1', 'match:x1']);
  });

  it('turns a removal into a tombstone that carries the last known data', () => {
    const last = makePlayer({ id: 'p1', lastName: 'Last' });
    const { outbox } = enqueue({ records: [playerChange('p1', { data: last, deleted: true })] });
    assert.strictEqual(outbox.records['player:p1'].deleted, true);
    assert.strictEqual(outbox.records['player:p1'].data, last);
  });

  it('drops an event added and removed before it was ever pushed', () => {
    const added = enqueue({ events: [eventChange('ev-1')] });
    const removed = enqueue({ events: [eventChange('ev-1', true)] }, added.outbox, added.versions);
    assert.strictEqual(countPending(removed.outbox), 0);
  });

  it('tombstones an event removed after a push attempt or that never was in the outbox', () => {
    const added = enqueue({ events: [eventChange('ev-1')] });
    const attempted = markBatchAttempted(added.outbox, buildPushBatch(added.outbox));
    const removed = enqueue({ events: [eventChange('ev-1', true), eventChange('ev-pulled', true)] }, attempted);
    assert.strictEqual(removed.outbox.events['ev-1'].deleted, true);
    assert.strictEqual(removed.outbox.events['ev-pulled'].deleted, true);
    assert.strictEqual(removed.outbox.events['ev-pulled'].data.id, 'ev-pulled');
  });

  it('does not touch the inputs', () => {
    const outbox = createEmptyOutbox();
    const versions: VersionMap = {};
    enqueue({ records: [playerChange('p1')], events: [eventChange('ev-1')] }, outbox, versions);
    assert.deepStrictEqual(outbox, createEmptyOutbox());
    assert.deepStrictEqual(versions, {});
  });
});

describe('enqueueChanges: match field versions (S13.1)', () => {
  const T0 = '2026-10-30T17:00:00.000Z';
  const stamp = '2026-10-30T18:00:00.000Z';
  const matchChange = (changedFields?: MatchField[]): RecordChange => ({
    kind: 'match',
    id: 'm-test',
    data: toMatchRecord(makeMatch()),
    deleted: false,
    ...(changedFields ? { changedFields } : {}),
  });

  it('stamps only the changed fields and keeps the others at their known version', () => {
    const known = writeFieldVersions({ 'match:m-test': T0 }, 'm-test', resolveFieldVersions(undefined, T0));
    const { outbox, versions } = enqueue({ records: [matchChange(['status', 'venue'])] }, createEmptyOutbox(), known);
    const entry = outbox.records['match:m-test'];
    assert.strictEqual(entry.updatedAt, stamp);
    assert.ok(entry.kind === 'match' && entry.fieldVersions);
    assert.strictEqual(entry.fieldVersions['game-state'], stamp);
    assert.strictEqual(entry.fieldVersions.venue, stamp);
    assert.strictEqual(entry.fieldVersions.rivalTeamName, T0);
    assert.ok(!('changedFields' in entry), 'diff bookkeeping never reaches the outbox');
    assert.strictEqual(versions['match:m-test'], stamp);
    assert.deepStrictEqual(readFieldVersions(versions, 'm-test'), entry.fieldVersions);
  });

  it('stamps every field of a new match and keeps earlier pending stamps when edited again', () => {
    const created = enqueue({ records: [matchChange()] });
    const entry = created.outbox.records['match:m-test'];
    assert.ok(entry.kind === 'match');
    assert.deepStrictEqual(entry.fieldVersions, resolveFieldVersions(undefined, stamp));

    const edited = enqueue({ records: [matchChange(['venue'])] }, created.outbox, created.versions, NOW + 1000);
    const latest = edited.outbox.records['match:m-test'];
    assert.ok(latest.kind === 'match' && latest.fieldVersions);
    assert.strictEqual(latest.fieldVersions.venue, '2026-10-30T18:00:01.000Z');
    assert.strictEqual(latest.fieldVersions['game-state'], stamp);
  });

  it('sends a match removal as a whole-record tombstone', () => {
    const { outbox } = enqueue({ records: [{ ...matchChange(), deleted: true }] });
    const entry = outbox.records['match:m-test'];
    assert.strictEqual(entry.deleted, true);
    assert.ok(!('fieldVersions' in entry));
  });
});

describe('buildPushBatch', () => {
  it('holds back events whose pending match record does not fit in the batch (S13.2)', () => {
    const { outbox } = enqueue({
      records: [
        playerChange('p1'),
        { kind: 'match', id: 'm-test', data: toMatchRecord(makeMatch()), deleted: false },
      ],
      events: [eventChange('ev-1'), { ...eventChange('ev-2'), matchId: 'm-other' }],
    });
    const batch = buildPushBatch(outbox, { records: 1, events: 10 });
    assert.deepStrictEqual(batch.payload.records.map((record) => record.id), ['p1']);
    assert.deepStrictEqual(batch.payload.events.map((event) => event.id), ['ev-2']);

    const full = buildPushBatch(outbox, { records: 2, events: 10 });
    assert.deepStrictEqual(full.payload.events.map((event) => event.id), ['ev-1', 'ev-2']);
  });

  it('builds the push payload without client bookkeeping', () => {
    const { outbox } = enqueue({ records: [playerChange('p1')], events: [eventChange('ev-1')] });
    const batch = buildPushBatch(outbox);
    assert.deepStrictEqual(batch.payload.records, [
      {
        kind: 'player',
        id: 'p1',
        data: outbox.records['player:p1'].data,
        updatedAt: '2026-10-30T18:00:00.000Z',
        deleted: false,
      },
    ]);
    assert.deepStrictEqual(batch.payload.events, [
      { id: 'ev-1', matchId: 'm-test', data: outbox.events['ev-1'].data, deleted: false },
    ]);
  });

  it('respects the server limits of 500 records and 2000 events per push', () => {
    const records = Array.from({ length: 501 }, (_, i) => playerChange(`p${i}`));
    const events = Array.from({ length: 2001 }, (_, i) => eventChange(`ev-${i}`));
    const { outbox } = enqueue({ records, events });
    const batch = buildPushBatch(outbox);
    assert.strictEqual(batch.payload.records.length, 500);
    assert.strictEqual(batch.payload.events.length, 2000);
    assert.strictEqual(batch.payload.records[0].id, 'p0');
  });

  it('is empty when there is nothing pending', () => {
    const batch = buildPushBatch(createEmptyOutbox());
    assert.strictEqual(batch.size, 0);
  });
});

describe('applyPushResult', () => {
  const pending = () => {
    const { outbox } = enqueue({
      records: [playerChange('p1'), playerChange('p2'), playerChange('p3'), playerChange('p4')],
      events: [eventChange('ev-1'), eventChange('ev-2')],
    });
    return outbox;
  };

  it('removes accepted and STALE entries and counts FORBIDDEN/INVALID as errors', () => {
    const outbox = pending();
    const batch = buildPushBatch(outbox);
    const result = applyPushResult(outbox, batch, {
      accepted: ['p1', 'ev-1'],
      rejected: [
        { id: 'p2', reason: 'STALE' },
        { id: 'p3', reason: 'FORBIDDEN' },
        { id: 'ev-2', reason: 'INVALID' },
      ],
      cursor: '10',
    });
    assert.deepStrictEqual(Object.keys(result.outbox.records), ['player:p4']);
    assert.deepStrictEqual(Object.keys(result.outbox.events), []);
    assert.strictEqual(result.errorCount, 2);
    assert.strictEqual(result.settledCount, 5);
  });

  it('keeps an entry changed again while its push was in flight', () => {
    const outbox = pending();
    const batch = buildPushBatch(outbox);
    const newer = makePlayer({ id: 'p1', dorsal: 77 });
    const { outbox: changed } = enqueue({ records: [playerChange('p1', { data: newer })] }, outbox, {});
    const result = applyPushResult(changed, batch, { accepted: ['p1'], rejected: [], cursor: '11' });
    assert.strictEqual(result.outbox.records['player:p1'].data, newer);
  });
});
