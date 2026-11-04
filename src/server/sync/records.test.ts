import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SYNC_RECORD_KINDS, type SyncRecordDataByKind } from '@/core/application/sync/record-kinds';
import { toMatchRecord } from '@/core/application/sync/sync-records';
import { parsePullPage } from '@/core/infrastructure/sync-api/sync-api-schemas';
import {
  makeChartCode,
  makeCoach,
  makeDivision,
  makeEvent,
  makeMatch,
  makePlayer,
  makeRivalTeam,
  makeTeam,
} from '@/core/testing/fixtures';
import { syncRecordKind } from '../db/schema';
import { parsePushBody } from './api-schema';
import { parseEventData, parseRecordData } from './records';

const VALID_DATA: SyncRecordDataByKind = {
  division: makeDivision(),
  team: makeTeam(),
  player: makePlayer(),
  match: toMatchRecord(makeMatch()),
  chartCode: makeChartCode(),
  rivalTeam: makeRivalTeam(),
  coach: makeCoach(),
};

describe('record kinds shared by client and server', () => {
  it('stores every registry kind in the Postgres enum, in the same order', () => {
    assert.deepStrictEqual(syncRecordKind.enumValues, SYNC_RECORD_KINDS);
  });

  it('accepts every registry kind in a push and refuses any other', () => {
    const record = (kind: string) => ({ kind, id: 'x', data: {}, updatedAt: '2026-10-30T10:00:00.000Z', deleted: false });
    for (const kind of SYNC_RECORD_KINDS) assert.ok(parsePushBody({ records: [record(kind)] }).ok, kind);
    assert.strictEqual(parsePushBody({ records: [record('event')] }).ok, false);
  });

  it('parses the data of every kind the same way on both sides', () => {
    for (const kind of SYNC_RECORD_KINDS) {
      const data = VALID_DATA[kind];
      const server = parseRecordData(kind, data.id, { ...data, unknownKey: true });
      const client = parsePullPage({
        records: [{ kind, id: data.id, data: { ...data, unknownKey: true }, updatedAt: '2026-10-30T10:00:00.000Z', deleted: false }],
        events: [],
        cursor: '1',
        hasMore: false,
        epoch: 'e',
      });
      assert.deepStrictEqual(server, { ok: true, value: data }, kind);
      assert.deepStrictEqual(client?.records[0]?.data, data, kind);
    }
  });

  it('rejects invalid data of every kind on both sides', () => {
    for (const kind of SYNC_RECORD_KINDS) {
      assert.strictEqual(parseRecordData(kind, 'x', { id: 'x' }).ok, false, kind);
      const client = parsePullPage({
        records: [{ kind, id: 'x', data: { id: 'x' }, updatedAt: '2026-10-30T10:00:00.000Z', deleted: false }],
        events: [],
        cursor: '1',
        hasMore: false,
        epoch: 'e',
      });
      assert.deepStrictEqual(client?.records, [], kind);
    }
  });

  it('drops events from match data on both sides', () => {
    const match = makeMatch({ events: [makeEvent({ matchId: 'm-test' })] });
    assert.deepStrictEqual(parseRecordData('match', match.id, match), { ok: true, value: toMatchRecord(match) });
  });
});

describe('parseEventData (pruned event model, S3)', () => {
  it('accepts a scoring play unchanged', () => {
    const event = makeEvent({ id: 'e-1', matchId: 'm-1', type: 'FG2_MADE' });
    assert.deepStrictEqual(parseEventData('e-1', 'm-1', event), { ok: true, value: event });
  });

  it('rejects a SUBSTITUTION event', () => {
    const event = { ...makeEvent({ id: 'e-1', matchId: 'm-1' }), type: 'SUBSTITUTION' };
    assert.strictEqual(parseEventData('e-1', 'm-1', event).ok, false);
  });

  it('drops coordinates and substitution details from a stored event', () => {
    const event = makeEvent({ id: 'e-1', matchId: 'm-1', type: 'FG3_MADE' });
    const result = parseEventData('e-1', 'm-1', {
      ...event,
      coordinates: { x: 10, y: 20 },
      substitution: { playerInId: 'p-6', playerOutId: 'p-1' },
    });
    assert.deepStrictEqual(result, { ok: true, value: event });
  });
});
