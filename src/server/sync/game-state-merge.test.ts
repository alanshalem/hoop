import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { Match } from '@/core/domain/entities/match.types';
import { diffClubState } from '@/core/application/sync/club-diff';
import { resolveFieldVersions, writeFieldVersions } from '@/core/application/sync/match-fields';
import { createEmptyOutbox, enqueueChanges } from '@/core/application/sync/outbox';
import { mergePulledChanges } from '@/core/application/sync/pull-merge';
import { toMatchRecord } from '@/core/application/sync/sync-records';
import type { SyncableClubData } from '@/core/application/sync/record-kinds';
import type { OutboxRecordEntry } from '@/core/application/sync/sync-types';
import { makeClubData, makeDivision, makeMatch, makePlayer, makeTeam } from '@/core/testing/fixtures';
import { decideRecordWrite, type StoredRecord } from './merge';

/**
 * S13.1 / T14: status, quarter and clock are one version group, so the server
 * push merge and the client pull merge never combine the game state of two
 * tablets (e.g. "Q2 with 0:20").
 */

const T0 = '2026-10-30T18:00:00.000Z';
const T1 = '2026-10-30T18:00:01.000Z';
const T2 = '2026-10-30T18:00:02.000Z';
const T3 = '2026-10-30T18:00:03.000Z';

const base = makeMatch({ status: 'LIVE', currentQuarter: 'Q1', quarterTimeRemainingSeconds: 45, events: [] });

const club = (match: Match): SyncableClubData =>
  makeClubData({ divisions: [makeDivision()], teams: [makeTeam()], players: [makePlayer({ id: 'p1' })], matches: [match] });

/** A tablet that knew `base` at T0 and edited it at `at`: its state and its pending outbox entry. */
function tabletEdit(edited: Match, at: string) {
  const known = writeFieldVersions({ 'match:m-test': T0 }, 'm-test', resolveFieldVersions(undefined, T0));
  const local = enqueueChanges({ outbox: createEmptyOutbox(), versions: known }, diffClubState(club(base), club(edited)), Date.parse(at));
  const entry = local.outbox.records['match:m-test'];
  assert.ok(entry && entry.kind === 'match' && !entry.deleted);
  return { data: club(edited), ...local, entry };
}

/** Server side: applies one pushed outbox entry over the stored row, like `applyPush`. */
function serverApply(stored: StoredRecord, entry: OutboxRecordEntry): StoredRecord {
  assert.ok(entry.kind === 'match');
  const decision = decideRecordWrite(
    { kind: 'match', deleted: false, data: { ...entry.data }, updatedAt: new Date(entry.updatedAt), fieldVersions: entry.fieldVersions },
    stored
  );
  if (decision.action === 'stale') return stored;
  assert.strictEqual(decision.action, 'merge');
  if (decision.action !== 'merge') return stored;
  return { data: decision.data, fieldVersions: decision.fieldVersions, updatedAt: decision.updatedAt, deleted: false, seq: stored.seq + 1 };
}

const gameState = (data: Readonly<Record<string, unknown>>) => ({
  status: data.status,
  currentQuarter: data.currentQuarter,
  quarterTimeRemainingSeconds: data.quarterTimeRemainingSeconds,
});

const storedBase = (): StoredRecord => ({
  data: { ...toMatchRecord(base) },
  fieldVersions: null,
  updatedAt: new Date(T0),
  deleted: false,
  seq: 1,
});

// Tablet B moves to Q2 (full clock); tablet A pauses its Q1 clock at 0:20.
const movedToQ2 = { ...base, currentQuarter: 'Q2' as const, quarterTimeRemainingSeconds: 600 };
const pausedAt20 = { ...base, quarterTimeRemainingSeconds: 20 };

describe('game state merges as one group (S13.1, T14)', () => {
  for (const [label, pauseAt, expected] of [
    ['the pause is older than the quarter change', T1, movedToQ2],
    ['the pause is newer than the quarter change', T3, pausedAt20],
  ] as const) {
    it(`server and client converge to one tablet's game state when ${label}`, () => {
      const tabletB = tabletEdit(movedToQ2, T2);
      const tabletA = tabletEdit(pausedAt20, pauseAt);

      // Server: B pushes first, then A.
      const afterB = serverApply(storedBase(), tabletB.entry);
      const afterA = serverApply(afterB, tabletA.entry);
      assert.deepStrictEqual(gameState(afterA.data), gameState(toMatchRecord(expected)));

      // Client A (its pause still pending) pulls what B pushed.
      const pulled = mergePulledChanges(tabletA, {
        records: [
          {
            kind: 'match',
            id: 'm-test',
            data: toMatchRecord(movedToQ2),
            updatedAt: afterB.updatedAt.toISOString(),
            deleted: false,
            fieldVersions: afterB.fieldVersions ?? undefined,
          },
        ],
        events: [],
      });
      const [clientMatch] = pulled.data.matches;
      assert.deepStrictEqual(gameState(clientMatch), gameState(toMatchRecord(expected)), 'client and server agree');
      assert.notDeepStrictEqual(
        gameState(clientMatch),
        { status: 'LIVE', currentQuarter: 'Q2', quarterTimeRemainingSeconds: 20 },
        'never "Q2 with 0:20"'
      );
    });
  }

  it('two simultaneous timeouts of one team resolve to the newer request (timeouts stay one field)', () => {
    const first = { ...base, homeTimeouts: { ...base.homeTimeouts, firstHalfRemaining: 1 } };
    const second = { ...base, homeTimeouts: { ...base.homeTimeouts, firstHalfRemaining: 1 }, awayTimeouts: base.awayTimeouts };
    const afterFirst = serverApply(storedBase(), tabletEdit(first, T1).entry);
    const afterSecond = serverApply(afterFirst, tabletEdit(second, T2).entry);
    assert.deepStrictEqual(afterSecond.data.homeTimeouts, second.homeTimeouts);
    assert.strictEqual(afterSecond.fieldVersions?.homeTimeouts, T2);
  });
});
