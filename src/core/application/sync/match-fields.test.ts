import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MatchSchema } from '@/core/domain/entities/match.types';
import { makeMatch } from '@/core/testing/fixtures';
import {
  changedMatchFields,
  coversFieldVersions,
  EPOCH_VERSION,
  latestFieldVersion,
  MATCH_DERIVED_FIELDS,
  MATCH_FIELD_GROUPS,
  MATCH_VERSION_KEYS,
  MATCH_VERSIONED_FIELDS,
  mergeMatchFields,
  pickFieldVersions,
  readFieldVersions,
  resolveFieldVersions,
  versionKeyOf,
  writeFieldVersions,
  type CompleteFieldVersions,
} from './match-fields';
import { toMatchRecord } from './sync-records';
import type { MatchRecord } from './sync-types';

const T1 = '2026-10-30T18:00:01.000Z';
const T2 = '2026-10-30T18:00:02.000Z';
const T3 = '2026-10-30T18:00:03.000Z';

const allAt = (iso: string): CompleteFieldVersions => resolveFieldVersions(undefined, iso);

describe('match field classification (S13.1)', () => {
  it('versions every top-level match field except id, events and the derived scoreboard', () => {
    const keys = Object.keys(MatchSchema.shape).filter((key) => key !== 'id' && key !== 'events');
    const derived: readonly string[] = MATCH_DERIVED_FIELDS;
    assert.deepStrictEqual(
      [...MATCH_VERSIONED_FIELDS].sort(),
      keys.filter((key) => !derived.includes(key)).sort()
    );
    assert.deepStrictEqual([...MATCH_DERIVED_FIELDS].sort(), ['awayFoulsQuarter', 'awayScore', 'homeFoulsQuarter', 'homeScore']);
  });

  it('versions the official result as one field of its own (S3)', () => {
    assert.ok((MATCH_VERSIONED_FIELDS as readonly string[]).includes('officialResult'));
    assert.strictEqual(versionKeyOf('officialResult'), 'officialResult');
  });

  it('versions status, quarter and clock as one group (the game state); every other field on its own', () => {
    assert.deepStrictEqual(MATCH_FIELD_GROUPS, { 'game-state': ['status', 'currentQuarter', 'quarterTimeRemainingSeconds'] });
    assert.strictEqual(versionKeyOf('status'), 'game-state');
    assert.strictEqual(versionKeyOf('currentQuarter'), 'game-state');
    assert.strictEqual(versionKeyOf('quarterTimeRemainingSeconds'), 'game-state');
    assert.strictEqual(versionKeyOf('homeTimeouts'), 'homeTimeouts', 'each team timeouts object is one field');
    assert.ok(MATCH_VERSION_KEYS.includes('game-state'));
    for (const field of ['status', 'currentQuarter', 'quarterTimeRemainingSeconds']) {
      assert.ok(!(MATCH_VERSION_KEYS as readonly string[]).includes(field));
    }
    assert.strictEqual(MATCH_VERSION_KEYS.length, MATCH_VERSIONED_FIELDS.length - 2);
  });
});

describe('changedMatchFields', () => {
  it('compares values structurally and ignores derived fields', () => {
    const before = toMatchRecord(makeMatch({ venue: 'Club' }));
    const after = {
      ...before,
      activeLineupOwn: [...before.activeLineupOwn],
      homeTimeouts: { ...before.homeTimeouts },
      homeScore: 40,
      status: 'HALFTIME' as const,
    };
    assert.deepStrictEqual(changedMatchFields(before, after), ['status']);
  });

  it('reports a new or corrected official result (S3)', () => {
    const before = toMatchRecord(makeMatch());
    const official = { home: 58, away: 90, quarters: [] };
    const after = { ...before, officialResult: official };
    assert.deepStrictEqual(changedMatchFields(before, after), ['officialResult']);
    assert.deepStrictEqual(changedMatchFields(after, { ...after, officialResult: { ...official, away: 91 } }), [
      'officialResult',
    ]);
  });

  it('reports a removed optional field and a changed nested value', () => {
    const before = toMatchRecord(makeMatch({ venue: 'Club' }));
    const after = { ...before, venue: undefined, homeTimeouts: { ...before.homeTimeouts, firstHalfRemaining: 1 } };
    assert.deepStrictEqual(changedMatchFields(before, after), ['venue', 'homeTimeouts']);
  });
});

describe('resolveFieldVersions (backwards compatibility)', () => {
  it('uses updatedAt for every field when the record has no field versions', () => {
    const versions = resolveFieldVersions(null, T2);
    for (const key of MATCH_VERSION_KEYS) assert.strictEqual(versions[key], T2);
  });

  it('treats a field missing from partial versions as never written', () => {
    const versions = resolveFieldVersions({ 'game-state': T2 }, T2);
    assert.strictEqual(versions['game-state'], T2);
    assert.strictEqual(versions.venue, EPOCH_VERSION);
    assert.strictEqual(latestFieldVersion(versions), T2);
  });

  it('folds per-field versions stored before the game-state group into the group, taking the newest', () => {
    assert.deepStrictEqual(
      pickFieldVersions({ status: T1, currentQuarter: T3, quarterTimeRemainingSeconds: T2, venue: T1, unknown: T3 }),
      { venue: T1, 'game-state': T3 }
    );
    assert.deepStrictEqual(pickFieldVersions({ 'game-state': T2, status: T1 }), { 'game-state': T2 });
    assert.deepStrictEqual(pickFieldVersions({ venue: T1 }), { venue: T1 });
  });
});

describe('mergeMatchFields (field-level last-write-wins)', () => {
  const base: MatchRecord = toMatchRecord(makeMatch({ venue: 'Club', rivalTeamName: 'Rival' }));

  it('keeps both edits when two devices change different fields', () => {
    const server = { data: { ...base, venue: 'Server venue' }, fieldVersions: { ...allAt(T1), venue: T2 } };
    const incoming = { data: { ...base, status: 'HALFTIME' as const }, fieldVersions: { ...allAt(T1), 'game-state': T3 } };
    const merged = mergeMatchFields<MatchRecord>(server, incoming);
    assert.strictEqual(merged.data.venue, 'Server venue');
    assert.strictEqual(merged.data.status, 'HALFTIME');
    assert.strictEqual(merged.fieldVersions.venue, T2);
    assert.strictEqual(merged.fieldVersions['game-state'], T3);
    assert.deepStrictEqual(merged.taken, ['game-state']);
  });

  it('takes status, quarter and clock together from one side, never mixed', () => {
    const quarterChange = { ...base, currentQuarter: 'Q2' as const, quarterTimeRemainingSeconds: 600 };
    const pause = { ...base, currentQuarter: 'Q1' as const, quarterTimeRemainingSeconds: 20 };
    const server = { data: quarterChange, fieldVersions: { ...allAt(T1), 'game-state': T2 } };

    const older = mergeMatchFields<MatchRecord>(server, { data: pause, fieldVersions: { ...allAt(T1), 'game-state': T1 } });
    assert.deepStrictEqual([older.data.currentQuarter, older.data.quarterTimeRemainingSeconds], ['Q2', 600]);

    const newer = mergeMatchFields<MatchRecord>(server, { data: pause, fieldVersions: { ...allAt(T1), 'game-state': T3 } });
    assert.deepStrictEqual([newer.data.currentQuarter, newer.data.quarterTimeRemainingSeconds], ['Q1', 20]);
    assert.deepStrictEqual(newer.taken, ['game-state']);
  });

  it('keeps each team timeouts object whole: the newer request wins', () => {
    const server = { data: { ...base, homeTimeouts: { ...base.homeTimeouts, firstHalfRemaining: 1 } }, fieldVersions: { ...allAt(T1), homeTimeouts: T2 } };
    const incoming = { data: { ...base, homeTimeouts: { ...base.homeTimeouts, secondHalfRemaining: 2 } }, fieldVersions: { ...allAt(T1), homeTimeouts: T3 } };
    assert.deepStrictEqual(mergeMatchFields<MatchRecord>(server, incoming).data.homeTimeouts, incoming.data.homeTimeouts);
  });

  it('keeps the newer official result and the other device venue (S3)', () => {
    const official = { home: 58, away: 90, quarters: [] };
    const server = { data: { ...base, venue: 'Club' }, fieldVersions: { ...allAt(T1), venue: T2 } };
    const incoming = { data: { ...base, officialResult: official }, fieldVersions: { ...allAt(T1), officialResult: T3 } };
    const merged = mergeMatchFields<MatchRecord>(server, incoming);
    assert.deepStrictEqual(merged.data.officialResult, official);
    assert.strictEqual(merged.data.venue, 'Club');
    assert.deepStrictEqual(merged.taken, ['officialResult']);
  });

  it('lets the newer version of the same field win', () => {
    const server = { data: { ...base, venue: 'Old' }, fieldVersions: { ...allAt(T1), venue: T2 } };
    const newer = mergeMatchFields<MatchRecord>(server, { data: { ...base, venue: 'New' }, fieldVersions: { ...allAt(T1), venue: T3 } });
    assert.strictEqual(newer.data.venue, 'New');
    const older = mergeMatchFields<MatchRecord>(
      { data: { ...base, venue: 'New' }, fieldVersions: { ...allAt(T1), venue: T3 } },
      { data: { ...base, venue: 'Old' }, fieldVersions: { ...allAt(T1), venue: T2 } }
    );
    assert.strictEqual(older.data.venue, 'New');
    assert.deepStrictEqual(older.taken, []);
  });

  it('keeps the server value on a tie and returns the server data untouched when nothing wins', () => {
    const server = { data: { ...base, venue: 'Server' }, fieldVersions: allAt(T2) };
    const merged = mergeMatchFields<MatchRecord>(server, { data: { ...base, venue: 'Device' }, fieldVersions: allAt(T2) });
    assert.strictEqual(merged.data, server.data);
    assert.strictEqual(merged.fieldVersions, server.fieldVersions);
    assert.deepStrictEqual(merged.taken, []);
  });

  it('removes an optional field the newer side cleared, and takes derived fields from the side that won', () => {
    const server = { data: { ...base, venue: 'Club', homeScore: 10 }, fieldVersions: allAt(T1) };
    const incomingData = { ...base, homeScore: 12 };
    delete incomingData.venue;
    const merged = mergeMatchFields<MatchRecord>(server, { data: incomingData, fieldVersions: { ...allAt(T1), venue: T2 } });
    assert.ok(!('venue' in merged.data));
    assert.strictEqual(merged.data.homeScore, 12);
  });
});

describe('coversFieldVersions', () => {
  it('is true only when every field of the other side is equal or older', () => {
    assert.strictEqual(coversFieldVersions(allAt(T2), allAt(T2)), true);
    assert.strictEqual(coversFieldVersions(allAt(T2), { ...allAt(T1), 'game-state': T2 }), true);
    assert.strictEqual(coversFieldVersions(allAt(T2), { ...allAt(T1), 'game-state': T3 }), false);
  });
});

describe('field versions in the client versions map', () => {
  it('falls back to the record version (legacy) and then to the epoch', () => {
    assert.deepStrictEqual(readFieldVersions({ 'match:m1': T1 }, 'm1'), allAt(T1));
    assert.deepStrictEqual(readFieldVersions({}, 'm1'), allAt(EPOCH_VERSION));
  });

  it('round-trips per-field versions without touching other keys', () => {
    const versions: Record<string, string> = { 'match:m1': T1, 'player:p1': T1 };
    const written = writeFieldVersions(versions, 'm1', { ...allAt(T1), 'game-state': T3 });
    assert.strictEqual(written['player:p1'], T1);
    assert.strictEqual(written['match:m1#game-state'], T3);
    assert.strictEqual(readFieldVersions(written, 'm1')['game-state'], T3);
    assert.strictEqual(readFieldVersions(written, 'm1').venue, T1);
    assert.deepStrictEqual(versions, { 'match:m1': T1, 'player:p1': T1 }, 'the input map is not mutated');
  });

  it('reads per-field game-state versions stored before the group as the newest of them', () => {
    const legacy = { 'match:m1': T3, 'match:m1#status': T1, 'match:m1#quarterTimeRemainingSeconds': T2, 'match:m1#venue': T1 };
    const versions = readFieldVersions(legacy, 'm1');
    assert.strictEqual(versions['game-state'], T2);
    assert.strictEqual(versions.venue, T1);
    assert.strictEqual(versions.rivalTeamName, T3, 'a field without its own entry falls back to the record version');
  });
});
