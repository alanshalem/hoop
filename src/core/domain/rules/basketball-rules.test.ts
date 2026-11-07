import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculatePercentage,
  isTeamInBonus,
  calculatePlayerBoxScore,
  calculateTeamBoxScore,
  FIBA_FOUL_TROUBLE_THRESHOLD,
  FIBA_TEAM_FOULS_BONUS_THRESHOLD,
} from './basketball-rules';
import { makeEvent } from '@/core/testing/fixtures';

describe('FIBA Basketball Domain Rules', () => {
  describe('Constants & Thresholds', () => {
    it('should have official FIBA thresholds', () => {
      assert.strictEqual(FIBA_FOUL_TROUBLE_THRESHOLD, 4);
      assert.strictEqual(FIBA_TEAM_FOULS_BONUS_THRESHOLD, 4);
    });
  });

  describe('Shooting Percentage Helper', () => {
    it('calculates rounded percentage safely', () => {
      assert.strictEqual(calculatePercentage(5, 10), 50.0);
      assert.strictEqual(calculatePercentage(1, 3), 33.3);
      assert.strictEqual(calculatePercentage(2, 3), 66.7);
      assert.strictEqual(calculatePercentage(0, 0), 0.0);
      assert.strictEqual(calculatePercentage(0, 5), 0.0);
    });
  });

  describe('Team Bonus Status (FIBA Art. 41)', () => {
    it('returns true when team reaches 4 or more fouls in quarter', () => {
      assert.strictEqual(isTeamInBonus(0), false);
      assert.strictEqual(isTeamInBonus(3), false);
      assert.strictEqual(isTeamInBonus(4), true);
      assert.strictEqual(isTeamInBonus(5), true);
    });
  });

  describe('Player Box Score (scoring line)', () => {
    it('counts the points, made and attempted shots of the player', () => {
      const pId = 'player-23';
      const events = [
        makeEvent({ playerId: pId, type: 'FT_MADE' }),
        makeEvent({ playerId: pId, type: 'FT_MISS' }),
        makeEvent({ playerId: pId, type: 'FG2_MADE' }),
        makeEvent({ playerId: pId, type: 'FG2_MADE' }),
        makeEvent({ playerId: pId, type: 'FG2_MISS' }),
        makeEvent({ playerId: pId, type: 'FG3_MADE' }),
        makeEvent({ playerId: pId, type: 'FG3_MISS' }),
        makeEvent({ playerId: pId, type: 'OREB' }),
        makeEvent({ playerId: pId, type: 'DREB' }),
        makeEvent({ playerId: pId, type: 'STL' }),
        makeEvent({ playerId: pId, type: 'TOV' }),
        makeEvent({ playerId: pId, type: 'FOUL_PERSONAL' }),
        makeEvent({ playerId: 'other-player', type: 'FG3_MADE' }),
        makeEvent({ type: 'FG2_MADE', isOwnTeam: false }),
      ];

      // 1 FT + 2 doubles + 1 triple = 1 + 4 + 3 = 8; misses add attempts but no points,
      // and other plays, other players and the rival are not part of the line.
      assert.deepStrictEqual(calculatePlayerBoxScore(pId, events), {
        playerId: pId,
        points: 8,
        ft: { made: 1, attempted: 2 },
        fg2: { made: 2, attempted: 3 },
        fg3: { made: 1, attempted: 2 },
      });
    });

    it('counts a miss as an attempt without points for a player without baskets', () => {
      assert.deepStrictEqual(calculatePlayerBoxScore('p1', [makeEvent({ playerId: 'p1', type: 'FG2_MISS' })]), {
        playerId: 'p1',
        points: 0,
        ft: { made: 0, attempted: 0 },
        fg2: { made: 0, attempted: 1 },
        fg3: { made: 0, attempted: 0 },
      });
    });
  });

  describe('Team Box Score Aggregator', () => {
    it('sums the scoring lines of the listed players into the team total', () => {
      const events = [
        makeEvent({ playerId: 'p1', type: 'FG2_MADE' }),
        makeEvent({ playerId: 'p1', type: 'FT_MADE' }),
        makeEvent({ playerId: 'p1', type: 'FT_MISS' }),
        makeEvent({ playerId: 'p2', type: 'FG3_MADE' }),
        makeEvent({ playerId: 'p2', type: 'FG2_MISS' }),
        makeEvent({ playerId: 'p2', type: 'FG3_MISS' }),
        makeEvent({ playerId: 'p9', type: 'FG3_MADE' }),
        makeEvent({ playerId: 'p9', type: 'FT_MISS' }),
        makeEvent({ type: 'FG2_MISS', isOwnTeam: false }),
      ];

      const { players, teamTotal } = calculateTeamBoxScore('t1', ['p1', 'p2'], events);

      assert.deepStrictEqual(Object.keys(players), ['p1', 'p2']);
      assert.strictEqual(players.p1.points, 3);
      assert.strictEqual(players.p2.points, 3);
      assert.deepStrictEqual(teamTotal, {
        teamId: 't1',
        points: 6,
        ft: { made: 1, attempted: 2 },
        fg2: { made: 1, attempted: 2 },
        fg3: { made: 1, attempted: 2 },
      });
    });
  });
});
