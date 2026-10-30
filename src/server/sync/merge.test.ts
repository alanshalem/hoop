import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  decideEventWrite,
  dedupeEvents,
  dedupeRecords,
  isNewerThanStored,
  isTooFarInFuture,
  MAX_CLOCK_SKEW_MS,
  recordKey,
  recordWriteOperation,
} from './merge';

const T1 = new Date('2026-10-30T10:00:00.000Z');
const T2 = new Date('2026-10-30T10:00:00.001Z');
const T3 = new Date('2026-10-30T11:00:00.000Z');

describe('recordKey', () => {
  it('identifies a record by kind and id', () => {
    assert.strictEqual(recordKey('player', 'p-1'), 'player:p-1');
    assert.notStrictEqual(recordKey('team', 'x'), recordKey('division', 'x'));
  });
});

describe('dedupeRecords (one write per kind + id)', () => {
  it('keeps the newest updatedAt for each (kind, id)', () => {
    const result = dedupeRecords([
      { kind: 'player', id: 'p-1', updatedAt: T1, tag: 'old' },
      { kind: 'player', id: 'p-1', updatedAt: T3, tag: 'new' },
      { kind: 'player', id: 'p-1', updatedAt: T2, tag: 'mid' },
    ]);
    assert.deepStrictEqual(result, [{ kind: 'player', id: 'p-1', updatedAt: T3, tag: 'new' }]);
  });

  it('keeps the later occurrence when updatedAt ties', () => {
    const result = dedupeRecords([
      { kind: 'match', id: 'm-1', updatedAt: T1, tag: 'first' },
      { kind: 'match', id: 'm-1', updatedAt: T1, tag: 'second' },
    ]);
    assert.deepStrictEqual(result, [{ kind: 'match', id: 'm-1', updatedAt: T1, tag: 'second' }]);
  });

  it('treats the same id under different kinds as different records and keeps first-seen order', () => {
    const result = dedupeRecords([
      { kind: 'team', id: 'x', updatedAt: T1 },
      { kind: 'division', id: 'x', updatedAt: T1 },
      { kind: 'team', id: 'x', updatedAt: T2 },
      { kind: 'player', id: 'p-9', updatedAt: T1 },
    ]);
    assert.deepStrictEqual(result, [
      { kind: 'team', id: 'x', updatedAt: T2 },
      { kind: 'division', id: 'x', updatedAt: T1 },
      { kind: 'player', id: 'p-9', updatedAt: T1 },
    ]);
  });

  it('returns an empty list for an empty batch', () => {
    assert.deepStrictEqual(dedupeRecords([]), []);
  });
});

describe('dedupeEvents (one write per event id)', () => {
  it('lets a tombstone win over any non-deleted copy, wherever it appears', () => {
    assert.deepStrictEqual(
      dedupeEvents([
        { id: 'e-1', deleted: true, tag: 'tombstone' },
        { id: 'e-1', deleted: false, tag: 'later copy' },
      ]),
      [{ id: 'e-1', deleted: true, tag: 'tombstone' }]
    );
    assert.deepStrictEqual(
      dedupeEvents([
        { id: 'e-1', deleted: false, tag: 'copy' },
        { id: 'e-1', deleted: true, tag: 'tombstone' },
      ]),
      [{ id: 'e-1', deleted: true, tag: 'tombstone' }]
    );
  });

  it('keeps the later occurrence among equals and preserves first-seen order', () => {
    assert.deepStrictEqual(
      dedupeEvents([
        { id: 'e-1', deleted: false, tag: 'a' },
        { id: 'e-2', deleted: false, tag: 'b' },
        { id: 'e-1', deleted: false, tag: 'c' },
      ]),
      [
        { id: 'e-1', deleted: false, tag: 'c' },
        { id: 'e-2', deleted: false, tag: 'b' },
      ]
    );
  });
});

describe('recordWriteOperation (what the write means for RBAC)', () => {
  it('is delete for a tombstone, whatever is stored', () => {
    assert.strictEqual(recordWriteOperation(true, undefined), 'delete');
    assert.strictEqual(recordWriteOperation(true, { updatedAt: T1, deleted: false }), 'delete');
    assert.strictEqual(recordWriteOperation(true, { updatedAt: T1, deleted: true }), 'delete');
  });

  it('is update when a live row exists, create when none exists or it was deleted', () => {
    assert.strictEqual(recordWriteOperation(false, { updatedAt: T1, deleted: false }), 'update');
    assert.strictEqual(recordWriteOperation(false, undefined), 'create');
    assert.strictEqual(recordWriteOperation(false, { updatedAt: T1, deleted: true }), 'create');
  });
});

describe('isNewerThanStored (last-write-wins)', () => {
  it('accepts anything when nothing is stored', () => {
    assert.strictEqual(isNewerThanStored(T1, undefined), true);
  });

  it('accepts only a strictly newer updatedAt (ties and older keep the stored row)', () => {
    assert.strictEqual(isNewerThanStored(T2, { updatedAt: T1, deleted: false }), true);
    assert.strictEqual(isNewerThanStored(T1, { updatedAt: T1, deleted: false }), false);
    assert.strictEqual(isNewerThanStored(T1, { updatedAt: T2, deleted: true }), false);
  });
});

describe('isTooFarInFuture (LWW guard against skewed client clocks)', () => {
  const now = T3;

  it('allows up to 5 minutes of client clock skew', () => {
    assert.strictEqual(MAX_CLOCK_SKEW_MS, 5 * 60 * 1000);
    assert.strictEqual(isTooFarInFuture(T1, now), false);
    assert.strictEqual(isTooFarInFuture(now, now), false);
    assert.strictEqual(isTooFarInFuture(new Date(now.getTime() + MAX_CLOCK_SKEW_MS), now), false);
  });

  it('flags anything more than 5 minutes ahead of the server clock', () => {
    assert.strictEqual(isTooFarInFuture(new Date(now.getTime() + MAX_CLOCK_SKEW_MS + 1), now), true);
    assert.strictEqual(isTooFarInFuture(new Date('2099-01-01T00:00:00.000Z'), now), true);
  });
});

describe('decideEventWrite (append-only events with permanent tombstones)', () => {
  const data = { id: 'e-1', matchId: 'm-1', type: 'POINT_2_MADE', scoreAtEvent: { home: 2, away: 0 } };

  it('inserts an unknown event, live or tombstoned', () => {
    assert.strictEqual(decideEventWrite({ deleted: false, data }, undefined), 'insert');
    assert.strictEqual(decideEventWrite({ deleted: true, data }, undefined), 'insert');
  });

  it('tombstones a live event', () => {
    assert.strictEqual(decideEventWrite({ deleted: true, data }, { deleted: false, data }), 'tombstone');
  });

  it('never reverts a tombstone: a live copy is stale, a repeated tombstone is unchanged', () => {
    assert.strictEqual(decideEventWrite({ deleted: false, data }, { deleted: true, data }), 'stale');
    assert.strictEqual(decideEventWrite({ deleted: true, data }, { deleted: true, data }), 'unchanged');
  });

  it('treats a resent identical live event as unchanged (idempotent retry), regardless of key order', () => {
    const reordered = { scoreAtEvent: { away: 0, home: 2 }, type: 'POINT_2_MADE', matchId: 'm-1', id: 'e-1' };
    assert.strictEqual(decideEventWrite({ deleted: false, data: reordered }, { deleted: false, data }), 'unchanged');
  });

  it('keeps the data of a live event immutable: different data is stale', () => {
    const changed = { ...data, scoreAtEvent: { home: 3, away: 0 } };
    assert.strictEqual(decideEventWrite({ deleted: false, data: changed }, { deleted: false, data }), 'stale');
  });
});
