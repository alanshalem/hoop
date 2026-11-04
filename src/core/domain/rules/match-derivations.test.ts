import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getEventPoints,
  isFoulEvent,
  isHomeTeamEvent,
  isSameTeamFoulPeriod,
} from './event-rules';
import {
  deriveScoreboard,
  getOwnRivalScore,
  getQuarterPartials,
  getStartingLineup,
  withDerivedScoreboard,
} from './match-derivations';
import { MatchSchema, OfficialResultSchema, type OfficialResult } from '../entities/match.types';
import { PlayerSchema } from '../entities/club.types';
import { makeEvent, makeMatch } from '@/core/testing/fixtures';

describe('Event rules', () => {
  it('getEventPoints returns 1/2/3 for made shots and 0 otherwise', () => {
    assert.strictEqual(getEventPoints('FT_MADE'), 1);
    assert.strictEqual(getEventPoints('FG2_MADE'), 2);
    assert.strictEqual(getEventPoints('FG3_MADE'), 3);
    assert.strictEqual(getEventPoints('FG3_MISS'), 0);
    assert.strictEqual(getEventPoints('FOUL_PERSONAL'), 0);
    assert.strictEqual(getEventPoints('SUBSTITUTION'), 0);
  });

  it('isFoulEvent detects personal, technical and unsportsmanlike fouls only', () => {
    assert.strictEqual(isFoulEvent('FOUL_PERSONAL'), true);
    assert.strictEqual(isFoulEvent('FOUL_TECHNICAL'), true);
    assert.strictEqual(isFoulEvent('FOUL_UNSPORTSMANLIKE'), true);
    assert.strictEqual(isFoulEvent('TOV'), false);
    assert.strictEqual(isFoulEvent('FT_MADE'), false);
  });

  it('isHomeTeamEvent maps own/rival to the home side depending on condition', () => {
    assert.strictEqual(isHomeTeamEvent('HOME', true), true);
    assert.strictEqual(isHomeTeamEvent('HOME', false), false);
    assert.strictEqual(isHomeTeamEvent('AWAY', true), false);
    assert.strictEqual(isHomeTeamEvent('AWAY', false), true);
  });

  it('isSameTeamFoulPeriod treats overtimes as an extension of Q4 (FIBA Art. 41)', () => {
    assert.strictEqual(isSameTeamFoulPeriod('Q2', 'Q2'), true);
    assert.strictEqual(isSameTeamFoulPeriod('Q1', 'Q2'), false);
    assert.strictEqual(isSameTeamFoulPeriod('Q4', 'OT1'), true);
    assert.strictEqual(isSameTeamFoulPeriod('OT1', 'OT2'), true);
    assert.strictEqual(isSameTeamFoulPeriod('Q3', 'OT1'), false);
  });
});

describe('Schemas', () => {
  it('Match defaults startingLineupOwn to an empty list', () => {
    const { startingLineupOwn, ...rest } = makeMatch();
    void startingLineupOwn;
    const parsed = MatchSchema.parse(rest);
    assert.deepStrictEqual(parsed.startingLineupOwn, []);
  });

  it('Player accepts an optional medicalNote', () => {
    const parsed = PlayerSchema.parse({
      id: 'p1',
      firstName: 'A',
      lastName: 'B',
      dorsal: 4,
      heightCm: 190,
      position: 'PG',
      clubId: 'c1',
      medicalNote: 'Esguince de tobillo',
    });
    assert.strictEqual(parsed.medicalNote, 'Esguince de tobillo');
  });

  it('Player height and position are optional; given values keep their limits (S4)', () => {
    const base = { id: 'p1', firstName: 'A', lastName: 'B', dorsal: 4, clubId: 'c1' };
    const parsed = PlayerSchema.parse(base);
    assert.strictEqual(parsed.heightCm, undefined);
    assert.strictEqual(parsed.position, undefined);
    assert.strictEqual(PlayerSchema.parse({ ...base, heightCm: 190, position: 'PG' }).heightCm, 190);
    assert.strictEqual(PlayerSchema.safeParse({ ...base, heightCm: 119 }).success, false);
    assert.strictEqual(PlayerSchema.safeParse({ ...base, position: 'XX' }).success, false);
  });

  it('Player license is optional, trimmed, 1 to 20 characters (S4)', () => {
    const base = { id: 'p1', firstName: 'A', lastName: 'B', dorsal: 4, clubId: 'c1' };
    assert.strictEqual(PlayerSchema.parse(base).license, undefined);
    assert.strictEqual(PlayerSchema.parse({ ...base, license: ' 1234567 ' }).license, '1234567');
    assert.strictEqual(PlayerSchema.parse({ ...base, license: 'x'.repeat(20) }).license, 'x'.repeat(20));
    assert.strictEqual(PlayerSchema.safeParse({ ...base, license: '   ' }).success, false);
    assert.strictEqual(PlayerSchema.safeParse({ ...base, license: 'x'.repeat(21) }).success, false);
  });
});

describe('deriveScoreboard', () => {
  it('computes home/away scores from events for a HOME match', () => {
    const match = makeMatch({
      condition: 'HOME',
      events: [
        makeEvent({ type: 'FG3_MADE', isOwnTeam: true }),
        makeEvent({ type: 'FG2_MADE', isOwnTeam: false }),
        makeEvent({ type: 'FT_MADE', isOwnTeam: true }),
        makeEvent({ type: 'FG2_MISS', isOwnTeam: true }),
      ],
    });
    const board = deriveScoreboard(match);
    assert.strictEqual(board.homeScore, 4);
    assert.strictEqual(board.awayScore, 2);
  });

  it('puts own points on the away side for an AWAY match', () => {
    const match = makeMatch({
      condition: 'AWAY',
      events: [
        makeEvent({ type: 'FG3_MADE', isOwnTeam: true }),
        makeEvent({ type: 'FG2_MADE', isOwnTeam: false }),
      ],
    });
    const board = deriveScoreboard(match);
    assert.strictEqual(board.homeScore, 2);
    assert.strictEqual(board.awayScore, 3);
  });

  it('counts team fouls only in the current quarter', () => {
    const match = makeMatch({
      currentQuarter: 'Q2',
      events: [
        makeEvent({ quarter: 'Q1', type: 'FOUL_PERSONAL', isOwnTeam: true }),
        makeEvent({ quarter: 'Q2', type: 'FOUL_PERSONAL', isOwnTeam: true }),
        makeEvent({ quarter: 'Q2', type: 'FOUL_TECHNICAL', isOwnTeam: false }),
        makeEvent({ quarter: 'Q2', type: 'FOUL_UNSPORTSMANLIKE', isOwnTeam: false }),
      ],
    });
    const board = deriveScoreboard(match);
    assert.strictEqual(board.homeFoulsQuarter, 1);
    assert.strictEqual(board.awayFoulsQuarter, 2);
  });

  it('carries Q4 team fouls into overtime', () => {
    const match = makeMatch({
      currentQuarter: 'OT1',
      events: [
        makeEvent({ quarter: 'Q3', type: 'FOUL_PERSONAL', isOwnTeam: true }),
        makeEvent({ quarter: 'Q4', type: 'FOUL_PERSONAL', isOwnTeam: true }),
        makeEvent({ quarter: 'OT1', type: 'FOUL_PERSONAL', isOwnTeam: true }),
      ],
    });
    assert.strictEqual(deriveScoreboard(match).homeFoulsQuarter, 2);
  });

  it('returns zeros for a match without events', () => {
    assert.deepStrictEqual(deriveScoreboard(makeMatch()), {
      homeScore: 0,
      awayScore: 0,
      homeFoulsQuarter: 0,
      awayFoulsQuarter: 0,
    });
  });
});

describe('getOwnRivalScore', () => {
  it('returns own and rival points regardless of condition', () => {
    const events = [
      makeEvent({ type: 'FG3_MADE', isOwnTeam: true }),
      makeEvent({ type: 'FT_MADE', isOwnTeam: false }),
    ];
    assert.deepStrictEqual(getOwnRivalScore(makeMatch({ condition: 'AWAY', events })), {
      own: 3,
      rival: 1,
    });
  });
});

describe('getQuarterPartials', () => {
  it('always lists Q1-Q4 and only the overtimes that have events', () => {
    const partials = getQuarterPartials(
      makeMatch({
        condition: 'AWAY',
        events: [
          makeEvent({ quarter: 'Q1', type: 'FG2_MADE', isOwnTeam: true }),
          makeEvent({ quarter: 'Q3', type: 'FG3_MADE', isOwnTeam: false }),
          makeEvent({ quarter: 'OT1', type: 'FT_MADE', isOwnTeam: true }),
        ],
      })
    );
    assert.deepStrictEqual(
      partials.map((p) => p.quarter),
      ['Q1', 'Q2', 'Q3', 'Q4', 'OT1']
    );
    assert.deepStrictEqual(partials[0], { quarter: 'Q1', own: 2, rival: 0, home: 0, away: 2 });
    assert.deepStrictEqual(partials[2], { quarter: 'Q3', own: 0, rival: 3, home: 3, away: 0 });
    assert.deepStrictEqual(partials[4], { quarter: 'OT1', own: 1, rival: 0, home: 0, away: 1 });
  });

  it('returns four empty regulation quarters when there are no events', () => {
    const partials = getQuarterPartials(makeMatch({ condition: 'HOME', events: [] }));
    assert.strictEqual(partials.length, 4);
    assert.ok(partials.every((p) => p.own === 0 && p.rival === 0));
  });
});

/** Acta 681080: home 58 - away 90, points per quarter in order. */
const OFFICIAL: OfficialResult = {
  home: 58,
  away: 90,
  quarters: [
    { home: 11, away: 19 },
    { home: 23, away: 28 },
    { home: 9, away: 18 },
    { home: 15, away: 25 },
  ],
};

describe('OfficialResultSchema (S3)', () => {
  it('accepts a final score whose quarters add up to it, and one without quarters', () => {
    assert.deepStrictEqual(OfficialResultSchema.parse(OFFICIAL), OFFICIAL);
    assert.deepStrictEqual(OfficialResultSchema.parse({ home: 3, away: 0, quarters: [] }), {
      home: 3,
      away: 0,
      quarters: [],
    });
  });

  it('refuses quarters that do not add up to the final score, on either side', () => {
    const home = OfficialResultSchema.safeParse({ ...OFFICIAL, home: 59 });
    const away = OfficialResultSchema.safeParse({ ...OFFICIAL, away: 89 });
    assert.strictEqual(home.success, false);
    assert.strictEqual(away.success, false);
    assert.strictEqual(home.error?.issues[0]?.message, 'Official quarters must add up to the final score');
  });

  it('refuses negative or fractional points and more periods than Q1-Q4 plus four overtimes', () => {
    assert.strictEqual(OfficialResultSchema.safeParse({ home: -1, away: 0, quarters: [] }).success, false);
    assert.strictEqual(OfficialResultSchema.safeParse({ home: 1.5, away: 0, quarters: [] }).success, false);
    assert.strictEqual(
      OfficialResultSchema.safeParse({ home: 0, away: 0, quarters: [{ home: -1, away: 0 }, { home: 1, away: 0 }] })
        .success,
      false
    );
    const nine = Array.from({ length: 9 }, () => ({ home: 0, away: 0 }));
    assert.strictEqual(OfficialResultSchema.safeParse({ home: 0, away: 0, quarters: nine }).success, false);
  });

  it('is an optional match field: a match parses with and without it, and refuses an inconsistent one', () => {
    const { officialResult, ...withoutResult } = makeMatch({ officialResult: OFFICIAL });
    assert.deepStrictEqual(MatchSchema.parse({ ...withoutResult, officialResult }).officialResult, OFFICIAL);
    assert.strictEqual(MatchSchema.parse(withoutResult).officialResult, undefined);
    assert.strictEqual(MatchSchema.safeParse({ ...withoutResult, officialResult: { ...OFFICIAL, home: 1 } }).success, false);
  });
});

describe('official result without play-by-play (S3)', () => {
  const finished = (overrides: Parameters<typeof makeMatch>[0] = {}) =>
    makeMatch({ status: 'FINISHED', currentQuarter: 'Q4', officialResult: OFFICIAL, ...overrides });

  it('deriveScoreboard shows the official final score when the match has no scoring events', () => {
    assert.deepStrictEqual(deriveScoreboard(finished()), {
      homeScore: 58,
      awayScore: 90,
      homeFoulsQuarter: 0,
      awayFoulsQuarter: 0,
    });
  });

  it('keeps team fouls event-based and ignores events without points (misses, fouls) as scoring', () => {
    const match = finished({
      events: [
        makeEvent({ quarter: 'Q4', type: 'FOUL_PERSONAL', isOwnTeam: true }),
        makeEvent({ quarter: 'Q4', type: 'FG3_MISS', isOwnTeam: false }),
        makeEvent({ quarter: 'Q4', type: 'FT_MISS', isOwnTeam: true }),
      ],
    });
    assert.deepStrictEqual(deriveScoreboard(match), {
      homeScore: 58,
      awayScore: 90,
      homeFoulsQuarter: 1,
      awayFoulsQuarter: 0,
    });
  });

  it('lets scoring events win over the official result', () => {
    const match = finished({
      events: [
        makeEvent({ type: 'FT_MADE', isOwnTeam: true }),
        makeEvent({ type: 'FG2_MADE', isOwnTeam: false }),
      ],
    });
    assert.deepStrictEqual(deriveScoreboard(match), {
      homeScore: 1,
      awayScore: 2,
      homeFoulsQuarter: 0,
      awayFoulsQuarter: 0,
    });
    assert.deepStrictEqual(getOwnRivalScore(match), { own: 1, rival: 2 });
    assert.deepStrictEqual(
      getQuarterPartials(match).map(({ home, away }) => ({ home, away })),
      [
        { home: 1, away: 2 },
        { home: 0, away: 0 },
        { home: 0, away: 0 },
        { home: 0, away: 0 },
      ]
    );
  });

  it('withDerivedScoreboard stores the official score on the match', () => {
    const match = withDerivedScoreboard(finished({ homeScore: 0, awayScore: 0 }));
    assert.strictEqual(match.homeScore, 58);
    assert.strictEqual(match.awayScore, 90);
  });

  it('getOwnRivalScore maps the scoreboard sides to own and rival by condition', () => {
    assert.deepStrictEqual(getOwnRivalScore(finished({ condition: 'HOME' })), { own: 58, rival: 90 });
    assert.deepStrictEqual(getOwnRivalScore(finished({ condition: 'AWAY' })), { own: 90, rival: 58 });
  });

  it('getQuarterPartials falls back to the official quarters, overtimes included', () => {
    const partials = getQuarterPartials(finished({ condition: 'AWAY' }));
    assert.deepStrictEqual(partials, [
      { quarter: 'Q1', own: 19, rival: 11, home: 11, away: 19 },
      { quarter: 'Q2', own: 28, rival: 23, home: 23, away: 28 },
      { quarter: 'Q3', own: 18, rival: 9, home: 9, away: 18 },
      { quarter: 'Q4', own: 25, rival: 15, home: 15, away: 25 },
    ]);
    const overtime = getQuarterPartials(
      finished({
        officialResult: {
          home: 80,
          away: 75,
          quarters: [
            { home: 20, away: 20 },
            { home: 20, away: 20 },
            { home: 15, away: 20 },
            { home: 15, away: 10 },
            { home: 10, away: 5 },
          ],
        },
      })
    );
    assert.deepStrictEqual(
      overtime.map((p) => [p.quarter, p.own, p.rival]),
      [
        ['Q1', 20, 20],
        ['Q2', 20, 20],
        ['Q3', 15, 20],
        ['Q4', 15, 10],
        ['OT1', 10, 5],
      ]
    );
  });

  it('getQuarterPartials lists empty regulation quarters when the official result has no quarters', () => {
    const partials = getQuarterPartials(finished({ officialResult: { home: 58, away: 90, quarters: [] } }));
    assert.deepStrictEqual(
      partials.map((p) => [p.quarter, p.home, p.away]),
      [
        ['Q1', 0, 0],
        ['Q2', 0, 0],
        ['Q3', 0, 0],
        ['Q4', 0, 0],
      ]
    );
    assert.deepStrictEqual(deriveScoreboard(finished({ officialResult: { home: 58, away: 90, quarters: [] } })).homeScore, 58);
  });
});

describe('getStartingLineup', () => {
  const events = [
    makeEvent({
      type: 'SUBSTITUTION',
      substitution: { playerOutId: 'p1', playerInId: 'p6' },
    }),
    makeEvent({ type: 'FG2_MADE', isOwnTeam: false }),
  ];

  it('prefers startingLineupOwn when present', () => {
    const match = makeMatch({
      startingLineupOwn: ['p1', 'p2', 'p3', 'p4', 'p5'],
      activeLineupOwn: ['p6', 'p2', 'p3', 'p4', 'p5'],
      events,
    });
    assert.deepStrictEqual(getStartingLineup(match), ['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('reconstructs the starters by reverting substitutions when startingLineupOwn is empty', () => {
    const match = makeMatch({
      startingLineupOwn: [],
      activeLineupOwn: ['p6', 'p2', 'p3', 'p4', 'p5'],
      events,
    });
    assert.deepStrictEqual(getStartingLineup(match), ['p1', 'p2', 'p3', 'p4', 'p5']);
  });
});
