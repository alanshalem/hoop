import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getEventPoints,
  isFoulEvent,
  isHomeTeamEvent,
  isSameTeamFoulPeriod,
} from './event-rules';
import {
  calculateMatchBoxScore,
  deriveScoreboard,
  getOwnRivalScore,
  getQuarterPartials,
  getStartingLineup,
} from './match-derivations';
import {
  PLAY_BY_PLAY_EVENT_LABELS,
  PlayByPlayEventTypeSchema,
} from '../entities/match.types';
import { MatchSchema } from '../entities/match.types';
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

  it('labels every event type in Spanish', () => {
    for (const type of PlayByPlayEventTypeSchema.options) {
      assert.ok(PLAY_BY_PLAY_EVENT_LABELS[type].length > 0, type);
    }
    assert.strictEqual(PLAY_BY_PLAY_EVENT_LABELS.FG3_MADE, 'Triple convertido');
    assert.strictEqual(PLAY_BY_PLAY_EVENT_LABELS.FOUL_PERSONAL, 'Falta personal');
    assert.strictEqual(PLAY_BY_PLAY_EVENT_LABELS.SUBSTITUTION, 'Cambio');
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
      [
        makeEvent({ quarter: 'Q1', type: 'FG2_MADE', isOwnTeam: true }),
        makeEvent({ quarter: 'Q3', type: 'FG3_MADE', isOwnTeam: false }),
        makeEvent({ quarter: 'OT1', type: 'FT_MADE', isOwnTeam: true }),
      ],
      'AWAY'
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
    const partials = getQuarterPartials([], 'HOME');
    assert.strictEqual(partials.length, 4);
    assert.ok(partials.every((p) => p.own === 0 && p.rival === 0));
  });
});

describe('getStartingLineup & calculateMatchBoxScore (+/- from the starting five)', () => {
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

  it('charges the rival basket to the player on court, not to the subbed-out starter', () => {
    const match = makeMatch({
      activeLineupOwn: ['p6', 'p2', 'p3', 'p4', 'p5'],
      events,
    });
    const box = calculateMatchBoxScore(match);
    assert.strictEqual(box.players.p1.plusMinus, 0);
    assert.strictEqual(box.players.p6.plusMinus, -2);
    assert.strictEqual(box.players.p2.plusMinus, -2);
  });
});
