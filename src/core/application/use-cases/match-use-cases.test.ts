import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  changeQuarter,
  createMatch,
  finishMatch,
  recordEvent,
  requestTimeout,
  setClock,
  startHalftime,
  startMatch,
  startThirdQuarter,
  recordChartEntry,
  undoLastChartEntry,
  undoLastRivalFoul,
} from './match-use-cases';
import type { Match } from '@/core/domain/entities/match.types';
import { chartCodeRecordId, type ChartCodeRecord } from '@/core/domain/entities/chart.types';
import { resolveChartCatalog } from '@/core/domain/rules/chart-catalog';
import { makeEvent, makeMatch, makeRivalTeam } from '@/core/testing/fixtures';

const ctx = { id: 'ev-new', now: '2026-10-30T21:00:00.000Z' };

function expectOk<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  assert.strictEqual(result.ok, true, JSON.stringify(result));
  return result as Extract<T, { ok: true }>;
}

describe('recordEvent', () => {
  it('appends a fully-formed event and re-derives the scoreboard', () => {
    const match = makeMatch({ currentQuarter: 'Q2', quarterTimeRemainingSeconds: 400 });
    const { match: next } = expectOk(
      recordEvent(match, { type: 'FG3_MADE', isOwnTeam: true }, ctx)
    );
    assert.strictEqual(next.homeScore, 3);
    assert.strictEqual(next.events.length, 1);
    assert.deepStrictEqual(next.events[0], {
      id: 'ev-new',
      matchId: 'm-test',
      quarter: 'Q2',
      quarterTimeRemainingSeconds: 400,
      gameClockFormatted: '06:40',
      teamId: 'team-own',
      isOwnTeam: true,
      type: 'FG3_MADE',
      scoreAtEvent: { home: 3, away: 0 },
      timestamp: '2026-10-30T21:00:00.000Z',
    });
    assert.strictEqual(match.events.length, 0, 'input match is not mutated');
  });

  it('records the real clock and persists it on the match', () => {
    const { match: next } = expectOk(
      recordEvent(makeMatch(), { type: 'FOUL_PERSONAL', isOwnTeam: false, clockSeconds: 312 }, ctx)
    );
    assert.strictEqual(next.quarterTimeRemainingSeconds, 312);
    assert.strictEqual(next.events[0].quarterTimeRemainingSeconds, 312);
    assert.strictEqual(next.events[0].teamId, 'rival-team');
    assert.strictEqual(next.awayFoulsQuarter, 1, 'rival team fouls feed the bonus lights');
  });

  it('rejects events when the match is not live', () => {
    const match = makeMatch({ status: 'SCHEDULED' });
    assert.deepStrictEqual(recordEvent(match, { type: 'FT_MADE', isOwnTeam: true }, ctx), {
      ok: false,
      reason: 'MATCH_NOT_LIVE',
    });
  });
});

describe('undoLastRivalFoul (S15)', () => {
  it('removes only the last rival foul, re-derives the scoreboard and keeps every other event', () => {
    const firstFoul = makeEvent({ type: 'FOUL_PERSONAL', isOwnTeam: false });
    const lastFoul = makeEvent({ type: 'FOUL_PERSONAL', isOwnTeam: false });
    const ownFoul = makeEvent({ type: 'FOUL_PERSONAL', isOwnTeam: true, playerId: 'p1' });
    const rivalBasket = makeEvent({ type: 'FG2_MADE', isOwnTeam: false });
    const chartEntry = makeEvent({
      type: 'CHART',
      chart: { category: 'POINTS_ALLOWED', code: 'CUT', points: 2, scoreEventId: rivalBasket.id },
    });
    const match = makeMatch({
      events: [firstFoul, lastFoul, ownFoul, rivalBasket, chartEntry],
      awayScore: 2,
      homeFoulsQuarter: 1,
      awayFoulsQuarter: 2,
    });
    const { match: next } = expectOk(undoLastRivalFoul(match));
    assert.deepStrictEqual(next.events, [firstFoul, ownFoul, rivalBasket, chartEntry]);
    assert.strictEqual(next.awayFoulsQuarter, 1, 'the rival bonus count drops by one');
    assert.strictEqual(next.homeFoulsQuarter, 1);
    assert.deepStrictEqual([next.homeScore, next.awayScore], [0, 2]);
    assert.strictEqual(match.events.length, 5, 'input match is not mutated');
  });

  it('undoes technical and unsportsmanlike rival fouls too', () => {
    for (const type of ['FOUL_TECHNICAL', 'FOUL_UNSPORTSMANLIKE'] as const) {
      const personal = makeEvent({ type: 'FOUL_PERSONAL', isOwnTeam: false });
      const match = makeMatch({ events: [personal, makeEvent({ type, isOwnTeam: false })] });
      assert.deepStrictEqual(expectOk(undoLastRivalFoul(match)).match.events, [personal], type);
    }
  });

  it('reports NO_RIVAL_FOULS when the rival has no foul, even with own fouls and rival points', () => {
    assert.deepStrictEqual(undoLastRivalFoul(makeMatch()), { ok: false, reason: 'NO_RIVAL_FOULS' });
    const match = makeMatch({
      events: [
        makeEvent({ type: 'FOUL_PERSONAL', isOwnTeam: true, playerId: 'p1' }),
        makeEvent({ type: 'FG3_MADE', isOwnTeam: false }),
      ],
    });
    assert.deepStrictEqual(undoLastRivalFoul(match), { ok: false, reason: 'NO_RIVAL_FOULS' });
  });

  it('refuses when the match is not live or at halftime', () => {
    const events = [makeEvent({ type: 'FOUL_PERSONAL', isOwnTeam: false })];
    for (const status of ['SCHEDULED', 'FINISHED'] as const) {
      assert.deepStrictEqual(undoLastRivalFoul(makeMatch({ status, events })), { ok: false, reason: 'MATCH_NOT_LIVE' });
    }
    assert.deepStrictEqual(undoLastRivalFoul(makeMatch({ status: 'HALFTIME', events })), {
      ok: false,
      reason: 'HALFTIME',
    });
  });
});

describe('recordChartEntry', () => {
  it('appends a CHART event stamped with quarter and clock that leaves the score untouched', () => {
    const match = makeMatch({ currentQuarter: 'Q3', quarterTimeRemainingSeconds: 300, homeScore: 0 });
    const { match: next } = expectOk(
      recordChartEntry(match, { category: 'TURNOVER', code: 'BAD_PASS', playerId: 'p1', clockSeconds: 245 }, ctx)
    );
    assert.strictEqual(next.events.length, 1);
    assert.deepStrictEqual(next.events[0], {
      id: 'ev-new',
      matchId: 'm-test',
      quarter: 'Q3',
      quarterTimeRemainingSeconds: 245,
      gameClockFormatted: '04:05',
      teamId: 'team-own',
      isOwnTeam: true,
      playerId: 'p1',
      type: 'CHART',
      chart: { category: 'TURNOVER', code: 'BAD_PASS' },
      scoreAtEvent: { home: 0, away: 0 },
      timestamp: ctx.now,
    });
    assert.strictEqual(next.homeScore, 0);
    assert.strictEqual(next.awayScore, 0);
  });

  it('records points allowed with 2 points by default and keeps an explicit value', () => {
    const byDefault = expectOk(recordChartEntry(makeMatch(), { category: 'POINTS_ALLOWED', code: 'CUT' }, ctx));
    assert.deepStrictEqual(byDefault.match.events.at(-1)?.chart, { category: 'POINTS_ALLOWED', code: 'CUT', points: 2, scoreEventId: 'ev-new-score' });
    assert.strictEqual(byDefault.match.events.at(-1)?.playerId, undefined);
    const triple = expectOk(
      recordChartEntry(makeMatch(), { category: 'POINTS_ALLOWED', code: 'NO_CLOSEOUT', points: 3 }, ctx)
    );
    assert.strictEqual(triple.match.events.at(-1)?.chart?.points, 3);
  });

  it('rejects a code that does not belong to the category and leaves the match unchanged', () => {
    const match = makeMatch();
    assert.deepStrictEqual(recordChartEntry(match, { category: 'TURNOVER', code: 'GOOD_SHOT' }, ctx), {
      ok: false,
      reason: 'INVALID_CHART_CODE',
    });
    assert.strictEqual(match.events.length, 0);
  });

  it('rejects points outside the points-allowed category', () => {
    assert.deepStrictEqual(
      recordChartEntry(makeMatch(), { category: 'TURNOVER', code: 'BAD_PASS', points: 2 }, ctx),
      { ok: false, reason: 'INVALID_CHART_CODE' }
    );
  });

  describe('with the club catalog (S9)', () => {
    const chartCode = (code: string, overrides: Partial<ChartCodeRecord> = {}): ChartCodeRecord => ({
      id: chartCodeRecordId('club-1', 'TURNOVER', code),
      clubId: 'club-1',
      category: 'TURNOVER',
      code,
      symbol: 'Z',
      label: 'Zona',
      tone: 'NEGATIVE',
      archived: false,
      order: 9,
      ...overrides,
    });
    const catalog = resolveChartCatalog([
      chartCode('CUSTOM_zone'),
      chartCode('CUSTOM_old', { archived: true, order: 10 }),
      chartCode('BAD_PASS', { symbol: 'P', label: 'Pase malo', archived: true, order: 0 }),
    ]);

    it('records an active custom code of the club', () => {
      const { match } = expectOk(recordChartEntry(makeMatch(), { category: 'TURNOVER', code: 'CUSTOM_zone' }, ctx, catalog));
      assert.deepStrictEqual(match.events[0].chart, { category: 'TURNOVER', code: 'CUSTOM_zone' });
    });

    it('refuses archived codes, built-in or custom, and leaves the match unchanged', () => {
      const match = makeMatch();
      for (const code of ['BAD_PASS', 'CUSTOM_old']) {
        assert.deepStrictEqual(recordChartEntry(match, { category: 'TURNOVER', code }, ctx, catalog), {
          ok: false,
          reason: 'INVALID_CHART_CODE',
        });
      }
      assert.strictEqual(match.events.length, 0);
    });

    it('refuses a custom code unknown to the given catalog, and custom codes with the built-in default', () => {
      assert.deepStrictEqual(
        recordChartEntry(makeMatch(), { category: 'TURNOVER', code: 'CUSTOM_missing' }, ctx, catalog),
        { ok: false, reason: 'INVALID_CHART_CODE' }
      );
      assert.deepStrictEqual(recordChartEntry(makeMatch(), { category: 'TURNOVER', code: 'CUSTOM_zone' }, ctx), {
        ok: false,
        reason: 'INVALID_CHART_CODE',
      });
    });
  });

  it('refuses when the match is not live or at halftime', () => {
    const input = { category: 'DEFENSE', code: 'STEAL' } as const;
    assert.deepStrictEqual(recordChartEntry(makeMatch({ status: 'FINISHED' }), input, ctx), {
      ok: false,
      reason: 'MATCH_NOT_LIVE',
    });
    assert.deepStrictEqual(recordChartEntry(makeMatch({ status: 'HALFTIME' }), input, ctx), {
      ok: false,
      reason: 'HALFTIME',
    });
  });
});

describe('recordChartEntry offensive result (S11)', () => {
  it('records a made offensive action with its points', () => {
    const { match: next } = expectOk(
      recordChartEntry(makeMatch(), { category: 'OFFENSE', code: 'BAD_SHOT', playerId: 'p1', made: true, points: 3 }, ctx)
    );
    assert.deepStrictEqual(next.events.at(-1)?.chart, { category: 'OFFENSE', code: 'BAD_SHOT', made: true, points: 3, scoreEventId: 'ev-new-score' });
    assert.strictEqual(next.homeScore, 3, 'made offensive points reach the scoreboard (S12)');
  });

  it('records a missed offensive action without points', () => {
    const { match: next } = expectOk(
      recordChartEntry(makeMatch(), { category: 'OFFENSE', code: 'GOOD_SHOT', made: false }, ctx)
    );
    assert.deepStrictEqual(next.events[0].chart, { category: 'OFFENSE', code: 'GOOD_SHOT', made: false });
  });

  it('refuses an offensive action without result, made without points or missed with points', () => {
    const match = makeMatch();
    for (const input of [
      { category: 'OFFENSE', code: 'GOOD_SHOT' },
      { category: 'OFFENSE', code: 'GOOD_SHOT', made: true },
      { category: 'OFFENSE', code: 'GOOD_SHOT', made: false, points: 2 },
    ] as const) {
      assert.deepStrictEqual(recordChartEntry(match, input, ctx), { ok: false, reason: 'INVALID_CHART_RESULT' });
    }
    assert.strictEqual(match.events.length, 0);
  });

  it('refuses a result outside the offensive category', () => {
    assert.deepStrictEqual(
      recordChartEntry(makeMatch(), { category: 'TURNOVER', code: 'BAD_PASS', made: true, points: 2 }, ctx),
      { ok: false, reason: 'INVALID_CHART_RESULT' }
    );
    assert.deepStrictEqual(
      recordChartEntry(makeMatch(), { category: 'POINTS_ALLOWED', code: 'CUT', made: false }, ctx),
      { ok: false, reason: 'INVALID_CHART_RESULT' }
    );
  });

  it('keeps the previous rules for the other categories', () => {
    const allowed = expectOk(recordChartEntry(makeMatch(), { category: 'POINTS_ALLOWED', code: 'CUT' }, ctx));
    assert.deepStrictEqual(allowed.match.events.at(-1)?.chart, { category: 'POINTS_ALLOWED', code: 'CUT', points: 2, scoreEventId: 'ev-new-score' });
    const turnover = expectOk(recordChartEntry(makeMatch(), { category: 'TURNOVER', code: 'BAD_PASS' }, ctx));
    assert.deepStrictEqual(turnover.match.events[0].chart, { category: 'TURNOVER', code: 'BAD_PASS' });
  });
});

describe('scoring chart entries update the scoreboard (S12)', () => {
  // makeMatch: own team plays at HOME, so own points go to homeScore and rival points to awayScore.
  it('adds points allowed to the rival with the matching scoring play', () => {
    for (const [points, type] of [[1, 'FT_MADE'], [2, 'FG2_MADE'], [3, 'FG3_MADE']] as const) {
      const { match: next } = expectOk(
        recordChartEntry(makeMatch(), { category: 'POINTS_ALLOWED', code: 'CUT', playerId: 'p1', points }, ctx)
      );
      assert.strictEqual(next.awayScore, points);
      assert.strictEqual(next.homeScore, 0);
      const [play, entry] = next.events;
      assert.deepStrictEqual(
        { type: play.type, isOwnTeam: play.isOwnTeam, teamId: play.teamId, playerId: play.playerId, id: play.id },
        { type, isOwnTeam: false, teamId: 'rival-team', playerId: undefined, id: 'ev-new-score' }
      );
      assert.deepStrictEqual(entry.chart, { category: 'POINTS_ALLOWED', code: 'CUT', points, scoreEventId: 'ev-new-score' });
      assert.strictEqual(entry.playerId, 'p1', 'the responsible defender stays on the chart entry');
      assert.deepStrictEqual(entry.scoreAtEvent, { home: 0, away: points });
    }
  });

  it('adds a made offensive action to the own team for the same player', () => {
    const { match: next } = expectOk(
      recordChartEntry(makeMatch(), { category: 'OFFENSE', code: 'BAD_SHOT', playerId: 'p1', made: true, points: 2 }, ctx)
    );
    assert.strictEqual(next.homeScore, 2);
    assert.strictEqual(next.awayScore, 0);
    const [play, entry] = next.events;
    assert.deepStrictEqual(
      { type: play.type, isOwnTeam: play.isOwnTeam, teamId: play.teamId, playerId: play.playerId },
      { type: 'FG2_MADE', isOwnTeam: true, teamId: 'team-own', playerId: 'p1' }
    );
    assert.strictEqual(entry.chart?.scoreEventId, play.id);
  });

  it('puts the own points on the right when the own team plays away', () => {
    const { match: next } = expectOk(
      recordChartEntry(makeMatch({ condition: 'AWAY' }), { category: 'OFFENSE', code: 'LAYUP', made: true, points: 3 }, ctx)
    );
    assert.strictEqual(next.awayScore, 3);
    assert.strictEqual(next.homeScore, 0);
  });

  it('records no scoring play for missed actions or categories without points', () => {
    for (const input of [
      { category: 'OFFENSE', code: 'GOOD_SHOT', made: false },
      { category: 'TURNOVER', code: 'BAD_PASS' },
      { category: 'DEFENSE', code: 'STEAL' },
    ] as const) {
      const { match: next } = expectOk(recordChartEntry(makeMatch(), input, ctx));
      assert.strictEqual(next.events.length, 1);
      assert.strictEqual(next.events[0].chart?.scoreEventId, undefined);
      assert.deepStrictEqual([next.homeScore, next.awayScore], [0, 0]);
    }
  });

  it('undoing the chart entry removes its scoring play and the points', () => {
    const { match: scored } = expectOk(
      recordChartEntry(makeMatch(), { category: 'POINTS_ALLOWED', code: 'CUT', points: 3 }, ctx)
    );
    const { match: next } = expectOk(undoLastChartEntry(scored));
    assert.deepStrictEqual(next.events, []);
    assert.deepStrictEqual([next.homeScore, next.awayScore], [0, 0]);
  });

});

describe('rival player on chart entries (S14, L18)', () => {
  const roster = makeRivalTeam().players;
  const [rival] = roster;

  it('stores the rival player on points allowed; the rival scoring play keeps no player', () => {
    const { match: next } = expectOk(
      recordChartEntry(
        makeMatch(),
        { category: 'POINTS_ALLOWED', code: 'CUT', playerId: 'p1', points: 3, rivalPlayerId: rival.id },
        ctx,
        undefined,
        roster
      )
    );
    const [play, entry] = next.events;
    assert.deepStrictEqual(entry.chart, {
      category: 'POINTS_ALLOWED',
      code: 'CUT',
      points: 3,
      scoreEventId: 'ev-new-score',
      rivalPlayerId: rival.id,
    });
    assert.strictEqual(entry.playerId, 'p1');
    assert.deepStrictEqual(
      { type: play.type, isOwnTeam: play.isOwnTeam, playerId: play.playerId },
      { type: 'FG3_MADE', isOwnTeam: false, playerId: undefined }
    );
    assert.strictEqual(next.awayScore, 3);
  });

  it('stores the rival player on offensive actions, made or missed', () => {
    for (const result of [{ made: false }, { made: true, points: 2 }] as const) {
      const { match: next } = expectOk(
        recordChartEntry(
          makeMatch(),
          { category: 'OFFENSE', code: 'FORCED_SHOT', playerId: 'p1', rivalPlayerId: rival.id, ...result },
          ctx,
          undefined,
          roster
        )
      );
      assert.strictEqual(next.events.at(-1)?.chart?.rivalPlayerId, rival.id);
    }
  });

  it('accepts any rival player id when no roster is given', () => {
    const { match: next } = expectOk(
      recordChartEntry(makeMatch(), { category: 'POINTS_ALLOWED', code: 'CUT', rivalPlayerId: 'rp-any' }, ctx)
    );
    assert.strictEqual(next.events.at(-1)?.chart?.rivalPlayerId, 'rp-any');
  });

  it('refuses a rival player outside points allowed and offensive actions', () => {
    const match = makeMatch();
    for (const input of [
      { category: 'TURNOVER', code: 'BAD_PASS', rivalPlayerId: rival.id },
      { category: 'DEFENSE', code: 'STEAL', rivalPlayerId: rival.id },
    ] as const) {
      assert.deepStrictEqual(recordChartEntry(match, input, ctx, undefined, roster), {
        ok: false,
        reason: 'INVALID_RIVAL_PLAYER',
      });
    }
    assert.deepStrictEqual(match.events, []);
  });

  it('refuses a rival player that is not in the given roster, or an empty id', () => {
    const match = makeMatch();
    const input = { category: 'POINTS_ALLOWED', code: 'CUT' } as const;
    for (const [rivalPlayerId, rivalRoster] of [
      ['rp-other', roster],
      [rival.id, []],
      ['', roster],
      ['', undefined],
    ] as const) {
      assert.deepStrictEqual(
        recordChartEntry(match, { ...input, rivalPlayerId }, ctx, undefined, rivalRoster),
        { ok: false, reason: 'INVALID_RIVAL_PLAYER' },
        `${rivalPlayerId} ${JSON.stringify(rivalRoster)}`
      );
    }
    assert.deepStrictEqual(match.events, []);
    assert.deepStrictEqual([match.homeScore, match.awayScore], [0, 0]);
  });

  it('records entries without a rival player exactly as before, roster or not', () => {
    for (const rivalRoster of [undefined, roster, []]) {
      const { match: next } = expectOk(
        recordChartEntry(makeMatch(), { category: 'DEFENSE', code: 'STEAL', playerId: 'p1' }, ctx, undefined, rivalRoster)
      );
      assert.deepStrictEqual(next.events[0].chart, { category: 'DEFENSE', code: 'STEAL' });
    }
  });

  it('still checks the chart code before the rival player', () => {
    assert.deepStrictEqual(
      recordChartEntry(makeMatch(), { category: 'DEFENSE', code: 'NOPE', rivalPlayerId: rival.id }, ctx, undefined, roster),
      { ok: false, reason: 'INVALID_CHART_CODE' }
    );
  });
});

describe('undoLastChartEntry', () => {
  it('removes only the last chart entry and keeps later stat events', () => {
    const first = makeEvent({ type: 'CHART', chart: { category: 'TURNOVER', code: 'BAD_PASS' } });
    const second = makeEvent({ type: 'CHART', chart: { category: 'DEFENSE', code: 'STEAL' } });
    const stat = makeEvent({ type: 'FG2_MADE', isOwnTeam: true });
    const match = makeMatch({ events: [first, second, stat], homeScore: 2 });
    const { match: next } = expectOk(undoLastChartEntry(match));
    assert.deepStrictEqual(next.events, [first, stat]);
    assert.strictEqual(next.homeScore, 2);
  });

  it('reports NO_CHART_ENTRIES when there is nothing to undo', () => {
    const match = makeMatch({ events: [makeEvent({ type: 'FG2_MADE' })] });
    assert.deepStrictEqual(undoLastChartEntry(match), { ok: false, reason: 'NO_CHART_ENTRIES' });
  });

  it('reports MATCH_NOT_LIVE for finished matches', () => {
    const match = makeMatch({
      status: 'FINISHED',
      events: [makeEvent({ type: 'CHART', chart: { category: 'TURNOVER', code: 'BAD_PASS' } })],
    });
    assert.deepStrictEqual(undoLastChartEntry(match), { ok: false, reason: 'MATCH_NOT_LIVE' });
  });
});

describe('requestTimeout', () => {
  it('consumes an own first-half timeout on the home side for a HOME match', () => {
    const result = requestTimeout(makeMatch({ currentQuarter: 'Q2' }), 'OWN');
    const ok = expectOk(result);
    assert.strictEqual(ok.remaining, 1);
    assert.strictEqual(ok.match.homeTimeouts.firstHalfRemaining, 1);
    assert.strictEqual(ok.match.awayTimeouts.firstHalfRemaining, 2);
  });

  it('consumes a rival second-half timeout on the home side for an AWAY match', () => {
    const ok = expectOk(requestTimeout(makeMatch({ condition: 'AWAY', currentQuarter: 'Q3' }), 'RIVAL'));
    assert.strictEqual(ok.match.homeTimeouts.secondHalfRemaining, 2);
    assert.strictEqual(ok.remaining, 2);
  });

  it('refuses when no timeouts remain', () => {
    const match = makeMatch({
      homeTimeouts: { firstHalfRemaining: 0, secondHalfRemaining: 3, overtimeRemaining: 1 },
    });
    assert.deepStrictEqual(requestTimeout(match, 'OWN'), {
      ok: false,
      reason: 'NO_TIMEOUTS_LEFT',
    });
  });

  it('refuses when the match is not live', () => {
    assert.deepStrictEqual(requestTimeout(makeMatch({ status: 'FINISHED' }), 'OWN'), {
      ok: false,
      reason: 'MATCH_NOT_LIVE',
    });
  });
});

describe('changeQuarter & setClock', () => {
  it('resets the clock to the quarter length and re-derives team fouls', () => {
    const match = makeMatch({
      currentQuarter: 'Q1',
      quarterTimeRemainingSeconds: 0,
      homeFoulsQuarter: 3,
      events: [makeEvent({ quarter: 'Q1', type: 'FOUL_PERSONAL' })],
    });
    const next = changeQuarter(match, 'Q2');
    assert.strictEqual(next.currentQuarter, 'Q2');
    assert.strictEqual(next.quarterTimeRemainingSeconds, 600);
    assert.strictEqual(next.homeFoulsQuarter, 0);
  });

  it('uses 300s for overtime and grants a fresh overtime timeout', () => {
    const match = makeMatch({
      currentQuarter: 'OT1',
      homeTimeouts: { firstHalfRemaining: 0, secondHalfRemaining: 0, overtimeRemaining: 0 },
      awayTimeouts: { firstHalfRemaining: 0, secondHalfRemaining: 0, overtimeRemaining: 0 },
    });
    const next = changeQuarter(match, 'OT2');
    assert.strictEqual(next.quarterTimeRemainingSeconds, 300);
    assert.strictEqual(next.homeTimeouts.overtimeRemaining, 1);
    assert.strictEqual(next.awayTimeouts.overtimeRemaining, 1);
  });

  it('setClock clamps to [0, quarter length] and rounds to whole seconds', () => {
    assert.strictEqual(setClock(makeMatch(), 312.6).quarterTimeRemainingSeconds, 313);
    assert.strictEqual(setClock(makeMatch(), -5).quarterTimeRemainingSeconds, 0);
    assert.strictEqual(
      setClock(makeMatch({ currentQuarter: 'OT1' }), 500).quarterTimeRemainingSeconds,
      300
    );
  });
});

describe('halftime (FIBA: interval after Q2)', () => {
  const endOfQ2 = () =>
    makeMatch({
      currentQuarter: 'Q2',
      quarterTimeRemainingSeconds: 0,
      events: [makeEvent({ quarter: 'Q2', type: 'FOUL_PERSONAL' }), makeEvent({ quarter: 'Q2', type: 'FG2_MADE' })],
    });

  it('startHalftime moves a live Q2 match to HALFTIME with the clock at 00:00', () => {
    const { match: next } = expectOk(startHalftime({ ...endOfQ2(), quarterTimeRemainingSeconds: 12 }));
    assert.strictEqual(next.status, 'HALFTIME');
    assert.strictEqual(next.currentQuarter, 'Q2');
    assert.strictEqual(next.quarterTimeRemainingSeconds, 0);
    assert.strictEqual(next.homeScore, 2);
  });

  it('startHalftime refuses outside the end of the first half', () => {
    assert.deepStrictEqual(startHalftime(makeMatch({ currentQuarter: 'Q1' })), {
      ok: false,
      reason: 'NOT_END_OF_FIRST_HALF',
    });
    assert.deepStrictEqual(startHalftime(makeMatch({ currentQuarter: 'Q2', status: 'FINISHED' })), {
      ok: false,
      reason: 'MATCH_NOT_LIVE',
    });
  });

  it('changing from Q2 to Q3 while live passes through HALFTIME', () => {
    const next = changeQuarter(endOfQ2(), 'Q3');
    assert.strictEqual(next.status, 'HALFTIME');
    assert.strictEqual(next.currentQuarter, 'Q2');
    assert.strictEqual(next.quarterTimeRemainingSeconds, 0);
  });

  it('startThirdQuarter sets Q3, a full clock and LIVE, and resets team fouls', () => {
    const halftime = expectOk(startHalftime(endOfQ2())).match;
    assert.strictEqual(halftime.homeFoulsQuarter, 1);
    const { match: next } = expectOk(startThirdQuarter(halftime));
    assert.strictEqual(next.status, 'LIVE');
    assert.strictEqual(next.currentQuarter, 'Q3');
    assert.strictEqual(next.quarterTimeRemainingSeconds, 600);
    assert.strictEqual(next.homeFoulsQuarter, 0);
    assert.strictEqual(next.homeScore, 2);
  });

  it('startThirdQuarter refuses when the match is not at halftime', () => {
    assert.deepStrictEqual(startThirdQuarter(makeMatch({ currentQuarter: 'Q2' })), { ok: false, reason: 'NOT_HALFTIME' });
  });

  it('during HALFTIME, changeQuarter only leaves the interval through Q3', () => {
    const halftime = expectOk(startHalftime(endOfQ2())).match;
    assert.strictEqual(changeQuarter(halftime, 'Q4'), halftime);
    const resumed = changeQuarter(halftime, 'Q3');
    assert.strictEqual(resumed.status, 'LIVE');
    assert.strictEqual(resumed.currentQuarter, 'Q3');
  });

  it('refuses events, undo and timeouts during HALFTIME', () => {
    const halftime = expectOk(startHalftime(endOfQ2())).match;
    const refused = { ok: false, reason: 'HALFTIME' };
    assert.deepStrictEqual(recordEvent(halftime, { type: 'FG2_MADE', isOwnTeam: true }, ctx), refused);
    assert.deepStrictEqual(undoLastChartEntry(halftime), refused);
    assert.deepStrictEqual(requestTimeout(halftime, 'OWN'), refused);
    assert.deepStrictEqual(requestTimeout(halftime, 'RIVAL'), refused);
  });

  it('a match can be finished from HALFTIME', () => {
    const halftime = expectOk(startHalftime(endOfQ2())).match;
    assert.strictEqual(expectOk(finishMatch(halftime)).match.status, 'FINISHED');
  });

  it('finishing from HALFTIME stores the clock at 00:00, whatever clock the console still held', () => {
    const halftime = expectOk(startHalftime(endOfQ2())).match;
    const finished = expectOk(finishMatch({ ...halftime, quarterTimeRemainingSeconds: 37 })).match;
    assert.strictEqual(finished.quarterTimeRemainingSeconds, 0);
    assert.strictEqual(finished.currentQuarter, 'Q2');
  });

  it('finishing a live match keeps its clock', () => {
    const finished = expectOk(finishMatch(makeMatch({ currentQuarter: 'Q4', quarterTimeRemainingSeconds: 3 }))).match;
    assert.strictEqual(finished.quarterTimeRemainingSeconds, 3);
  });

  it('any jump from the first half into the second half passes through HALFTIME first', () => {
    for (const [from, to] of [
      ['Q2', 'Q4'],
      ['Q1', 'Q3'],
      ['Q1', 'Q4'],
      ['Q2', 'OT1'],
    ] as const) {
      const next = changeQuarter(makeMatch({ currentQuarter: from, quarterTimeRemainingSeconds: 140 }), to);
      assert.strictEqual(next.status, 'HALFTIME', `${from} -> ${to}`);
      assert.strictEqual(next.currentQuarter, 'Q2', `${from} -> ${to}`);
      assert.strictEqual(next.quarterTimeRemainingSeconds, 0, `${from} -> ${to}`);
    }
  });

  it('moves within a half without halftime (Q1 -> Q2, Q3 -> Q4, back to Q1)', () => {
    assert.strictEqual(changeQuarter(makeMatch({ currentQuarter: 'Q1' }), 'Q2').status, 'LIVE');
    assert.strictEqual(changeQuarter(makeMatch({ currentQuarter: 'Q3' }), 'Q4').status, 'LIVE');
    const back = changeQuarter(makeMatch({ currentQuarter: 'Q2' }), 'Q1');
    assert.deepStrictEqual([back.status, back.currentQuarter], ['LIVE', 'Q1']);
  });
});

describe('requestTimeout in the last 2 minutes of Q4 (FIBA Art. 18.2.5)', () => {
  it('uses the match clock: with 3 second-half timeouts left only 2 can be used', () => {
    const match = makeMatch({ currentQuarter: 'Q4', quarterTimeRemainingSeconds: 90 });
    const first = expectOk(requestTimeout(match, 'OWN'));
    assert.strictEqual(first.remaining, 1);
    assert.strictEqual(first.match.homeTimeouts.secondHalfRemaining, 1);
    const second = expectOk(requestTimeout(first.match, 'OWN'));
    assert.strictEqual(second.remaining, 0);
    assert.deepStrictEqual(requestTimeout(second.match, 'OWN'), { ok: false, reason: 'NO_TIMEOUTS_LEFT' });
    assert.strictEqual(second.match.awayTimeouts.secondHalfRemaining, 3, 'the rival is untouched');
  });
});

describe('startMatch & finishMatch', () => {
  const roster = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  const starters = ['p1', 'p2', 'p3', 'p4', 'p5'];

  it('starts a scheduled match with roster, starting five, Q1 and a full clock', () => {
    const scheduled = makeMatch({
      status: 'SCHEDULED',
      startingLineupOwn: [],
      rosterOwnPlayerIds: [],
    });
    const { match: next } = expectOk(startMatch(scheduled, roster, starters));
    assert.strictEqual(next.status, 'LIVE');
    assert.strictEqual(next.currentQuarter, 'Q1');
    assert.strictEqual(next.quarterTimeRemainingSeconds, 600);
    assert.deepStrictEqual(next.rosterOwnPlayerIds, roster);
    assert.deepStrictEqual(next.startingLineupOwn, starters);
  });

  it('rejects an invalid lineup with its issues', () => {
    const result = startMatch(makeMatch({ status: 'SCHEDULED' }), roster, ['p1']);
    assert.strictEqual(result.ok, false);
    if (result.ok || result.reason !== 'INVALID_LINEUP') throw new Error('expected INVALID_LINEUP');
    assert.deepStrictEqual(result.issues.map((i) => i.code), ['STARTERS_COUNT']);
  });

  it('locks the starters once the match is live', () => {
    assert.deepStrictEqual(startMatch(makeMatch({ status: 'LIVE' }), roster, starters), {
      ok: false,
      reason: 'MATCH_ALREADY_STARTED',
    });
  });

  it('finishes a live match and keeps the derived score', () => {
    const live = makeMatch({ events: [makeEvent({ type: 'FG2_MADE' })] });
    const { match: next } = expectOk(finishMatch(live));
    assert.strictEqual(next.status, 'FINISHED');
    assert.strictEqual(next.homeScore, 2);
  });

  it('refuses to finish a match that is not live', () => {
    assert.deepStrictEqual(finishMatch(makeMatch({ status: 'SCHEDULED' })), {
      ok: false,
      reason: 'MATCH_NOT_LIVE',
    });
  });
});

describe('createMatch', () => {
  it('fills FIBA defaults for a new scheduled match', () => {
    const match: Match = createMatch(
      {
        clubId: 'c',
        divisionId: 'd',
        ownTeamId: 't',
        ownTeamName: 'Own',
        rivalTeamName: 'Rival',
        date: '2026-11-10T21:00:00.000Z',
        condition: 'AWAY',
        tournament: 'Liga',
      },
      { id: 'match-1' }
    );
    assert.strictEqual(match.id, 'match-1');
    assert.strictEqual(match.status, 'SCHEDULED');
    assert.strictEqual(match.currentQuarter, 'Q1');
    assert.strictEqual(match.quarterTimeRemainingSeconds, 600);
    assert.deepStrictEqual(match.homeTimeouts, {
      firstHalfRemaining: 2,
      secondHalfRemaining: 3,
      overtimeRemaining: 1,
    });
    assert.deepStrictEqual(match.events, []);
    assert.deepStrictEqual(match.startingLineupOwn, []);
  });
});
