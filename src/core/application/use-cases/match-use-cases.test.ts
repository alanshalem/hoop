import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  changeQuarter,
  createMatch,
  finishMatch,
  recordEvent,
  requestTimeout,
  setClock,
  startMatch,
  substitutePlayer,
  undoLastEvent,
} from './match-use-cases';
import type { Match } from '@/core/domain/entities/match.types';
import { makeEvent, makeMatch } from '@/core/testing/fixtures';

const ctx = { id: 'ev-new', now: '2026-10-30T21:00:00.000Z' };

function expectOk<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  assert.strictEqual(result.ok, true, JSON.stringify(result));
  return result as Extract<T, { ok: true }>;
}

describe('recordEvent', () => {
  it('appends a fully-formed event and re-derives the scoreboard', () => {
    const match = makeMatch({ currentQuarter: 'Q2', quarterTimeRemainingSeconds: 400 });
    const { match: next } = expectOk(
      recordEvent(
        match,
        { type: 'FG3_MADE', isOwnTeam: true, playerId: 'p1', coordinates: { x: 10, y: 10 } },
        ctx
      )
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
      playerId: 'p1',
      assistedByPlayerId: undefined,
      coordinates: { x: 10, y: 10 },
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

  it('rejects substitutions (they go through substitutePlayer)', () => {
    assert.deepStrictEqual(
      recordEvent(makeMatch(), { type: 'SUBSTITUTION', isOwnTeam: true }, ctx),
      { ok: false, reason: 'INVALID_EVENT' }
    );
  });
});

describe('undoLastEvent', () => {
  it('removes the last event and re-derives score across quarters', () => {
    const match = makeMatch({
      currentQuarter: 'Q2',
      events: [
        makeEvent({ quarter: 'Q1', type: 'FOUL_PERSONAL', isOwnTeam: true }),
        makeEvent({ quarter: 'Q1', type: 'FG2_MADE', isOwnTeam: true }),
      ],
      homeScore: 2,
    });
    const { match: next } = expectOk(undoLastEvent(match));
    assert.strictEqual(next.events.length, 1);
    assert.strictEqual(next.homeScore, 0);
    assert.strictEqual(next.homeFoulsQuarter, 0, 'Q1 foul does not count in Q2');
  });

  it('reverts the lineup when the last event is a substitution', () => {
    const match = makeMatch({
      activeLineupOwn: ['p6', 'p2', 'p3', 'p4', 'p5'],
      events: [
        makeEvent({ type: 'SUBSTITUTION', substitution: { playerOutId: 'p1', playerInId: 'p6' } }),
      ],
    });
    const { match: next } = expectOk(undoLastEvent(match));
    assert.deepStrictEqual(next.activeLineupOwn, ['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('reports NO_EVENTS when there is nothing to undo', () => {
    assert.deepStrictEqual(undoLastEvent(makeMatch()), { ok: false, reason: 'NO_EVENTS' });
  });

  it('reports MATCH_NOT_LIVE for finished matches', () => {
    const match = makeMatch({ status: 'FINISHED', events: [makeEvent()] });
    assert.deepStrictEqual(undoLastEvent(match), { ok: false, reason: 'MATCH_NOT_LIVE' });
  });
});

describe('substitutePlayer', () => {
  it('swaps the players in place and records a SUBSTITUTION event', () => {
    const { match: next } = expectOk(substitutePlayer(makeMatch(), 'p2', 'p6', ctx));
    assert.deepStrictEqual(next.activeLineupOwn, ['p1', 'p6', 'p3', 'p4', 'p5']);
    const last = next.events[next.events.length - 1];
    assert.strictEqual(last.type, 'SUBSTITUTION');
    assert.deepStrictEqual(last.substitution, { playerOutId: 'p2', playerInId: 'p6' });
  });

  it('rejects a player that is already on court', () => {
    assert.deepStrictEqual(substitutePlayer(makeMatch(), 'p2', 'p3', ctx), {
      ok: false,
      reason: 'PLAYER_ALREADY_ON_COURT',
    });
  });

  it('rejects an outgoing player that is not on court', () => {
    assert.deepStrictEqual(substitutePlayer(makeMatch(), 'p7', 'p6', ctx), {
      ok: false,
      reason: 'PLAYER_NOT_ON_COURT',
    });
  });

  it('rejects a player outside the match roster', () => {
    assert.deepStrictEqual(substitutePlayer(makeMatch(), 'p2', 'p99', ctx), {
      ok: false,
      reason: 'PLAYER_NOT_IN_ROSTER',
    });
  });

  it('rejects a fouled-out player', () => {
    const fouls = Array.from({ length: 5 }, () =>
      makeEvent({ type: 'FOUL_PERSONAL', playerId: 'p6' })
    );
    assert.deepStrictEqual(substitutePlayer(makeMatch({ events: fouls }), 'p2', 'p6', ctx), {
      ok: false,
      reason: 'PLAYER_FOULED_OUT',
    });
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

describe('startMatch & finishMatch', () => {
  const roster = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  const starters = ['p1', 'p2', 'p3', 'p4', 'p5'];

  it('starts a scheduled match with roster, starting five, Q1 and a full clock', () => {
    const scheduled = makeMatch({
      status: 'SCHEDULED',
      startingLineupOwn: [],
      activeLineupOwn: [],
      rosterOwnPlayerIds: [],
    });
    const { match: next } = expectOk(startMatch(scheduled, roster, starters));
    assert.strictEqual(next.status, 'LIVE');
    assert.strictEqual(next.currentQuarter, 'Q1');
    assert.strictEqual(next.quarterTimeRemainingSeconds, 600);
    assert.deepStrictEqual(next.rosterOwnPlayerIds, roster);
    assert.deepStrictEqual(next.startingLineupOwn, starters);
    assert.deepStrictEqual(next.activeLineupOwn, starters);
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
