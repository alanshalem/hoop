import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculatePercentage,
  isPlayerFouledOut,
  isPlayerInFoulTrouble,
  isTeamInBonus,
  calculateFibaPir,
  calculatePlayerBoxScore,
  calculateTeamBoxScore,
  calculatePlayerPlusMinus,
  getPlayerFoulsFromEvents,
  getTeamFoulsForQuarter,
  FIBA_MAX_PLAYER_FOULS,
  FIBA_FOUL_TROUBLE_THRESHOLD,
  FIBA_TEAM_FOULS_BONUS_THRESHOLD,
} from './basketball-rules';
import { PlayByPlayEvent } from '../entities/match.types';

describe('FIBA Basketball Domain Rules & Engine', () => {
  describe('Constants & Thresholds', () => {
    it('should have official FIBA thresholds', () => {
      assert.strictEqual(FIBA_MAX_PLAYER_FOULS, 5);
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

  describe('Player Exclusion & Foul Trouble (FIBA Art. 40)', () => {
    it('detects fouled out status at 5 or more fouls', () => {
      assert.strictEqual(isPlayerFouledOut(0), false);
      assert.strictEqual(isPlayerFouledOut(3), false);
      assert.strictEqual(isPlayerFouledOut(4), false);
      assert.strictEqual(isPlayerFouledOut(5), true);
      assert.strictEqual(isPlayerFouledOut(6), true);
    });

    it('detects foul trouble warning at exactly 4 fouls', () => {
      assert.strictEqual(isPlayerInFoulTrouble(3), false);
      assert.strictEqual(isPlayerInFoulTrouble(4), true);
      assert.strictEqual(isPlayerInFoulTrouble(5), false);
    });

    it('extracts correct foul breakdown from events', () => {
      const mockEvents: PlayByPlayEvent[] = [
        {
          id: 'e1',
          matchId: 'm1',
          quarter: 'Q1',
          quarterTimeRemainingSeconds: 500,
          teamId: 'team-own',
          isOwnTeam: true,
          playerId: 'player-7',
          type: 'FOUL_PERSONAL',
          scoreAtEvent: { home: 0, away: 0 },
          timestamp: new Date().toISOString(),
        },
        {
          id: 'e2',
          matchId: 'm1',
          quarter: 'Q2',
          quarterTimeRemainingSeconds: 400,
          teamId: 'team-own',
          isOwnTeam: true,
          playerId: 'player-7',
          type: 'FOUL_PERSONAL',
          scoreAtEvent: { home: 10, away: 10 },
          timestamp: new Date().toISOString(),
        },
        {
          id: 'e3',
          matchId: 'm1',
          quarter: 'Q3',
          quarterTimeRemainingSeconds: 300,
          teamId: 'team-own',
          isOwnTeam: true,
          playerId: 'player-7',
          type: 'FOUL_TECHNICAL',
          scoreAtEvent: { home: 25, away: 20 },
          timestamp: new Date().toISOString(),
        },
        {
          id: 'e4',
          matchId: 'm1',
          quarter: 'Q4',
          quarterTimeRemainingSeconds: 200,
          teamId: 'team-own',
          isOwnTeam: true,
          playerId: 'player-7',
          type: 'FOUL_UNSPORTSMANLIKE',
          scoreAtEvent: { home: 40, away: 38 },
          timestamp: new Date().toISOString(),
        },
      ];

      const fouls = getPlayerFoulsFromEvents('player-7', mockEvents);
      assert.strictEqual(fouls.personal, 2);
      assert.strictEqual(fouls.technical, 1);
      assert.strictEqual(fouls.unsportsmanlike, 1);
      assert.strictEqual(fouls.total, 4);
      assert.strictEqual(fouls.isInFoulTrouble, true);
      assert.strictEqual(fouls.isFouledOut, false);
    });
  });

  describe('Team Bonus Status (FIBA Art. 41)', () => {
    it('returns true when team reaches 4 or more fouls in quarter', () => {
      assert.strictEqual(isTeamInBonus(0), false);
      assert.strictEqual(isTeamInBonus(3), false);
      assert.strictEqual(isTeamInBonus(4), true);
      assert.strictEqual(isTeamInBonus(5), true);
    });

    it('counts team fouls specifically for each quarter', () => {
      const mockEvents: PlayByPlayEvent[] = [
        {
          id: 'e1',
          matchId: 'm1',
          quarter: 'Q1',
          quarterTimeRemainingSeconds: 550,
          teamId: 'team-A',
          isOwnTeam: true,
          type: 'FOUL_PERSONAL',
          scoreAtEvent: { home: 0, away: 0 },
          timestamp: new Date().toISOString(),
        },
        {
          id: 'e2',
          matchId: 'm1',
          quarter: 'Q1',
          quarterTimeRemainingSeconds: 400,
          teamId: 'team-A',
          isOwnTeam: true,
          type: 'FOUL_PERSONAL',
          scoreAtEvent: { home: 2, away: 2 },
          timestamp: new Date().toISOString(),
        },
        {
          id: 'e3',
          matchId: 'm1',
          quarter: 'Q1',
          quarterTimeRemainingSeconds: 300,
          teamId: 'team-A',
          isOwnTeam: true,
          type: 'FOUL_TECHNICAL',
          scoreAtEvent: { home: 4, away: 4 },
          timestamp: new Date().toISOString(),
        },
        {
          id: 'e4',
          matchId: 'm1',
          quarter: 'Q1',
          quarterTimeRemainingSeconds: 200,
          teamId: 'team-A',
          isOwnTeam: true,
          type: 'FOUL_UNSPORTSMANLIKE',
          scoreAtEvent: { home: 6, away: 6 },
          timestamp: new Date().toISOString(),
        },
        // Q2 Foul for team-A
        {
          id: 'e5',
          matchId: 'm1',
          quarter: 'Q2',
          quarterTimeRemainingSeconds: 500,
          teamId: 'team-A',
          isOwnTeam: true,
          type: 'FOUL_PERSONAL',
          scoreAtEvent: { home: 12, away: 10 },
          timestamp: new Date().toISOString(),
        },
      ];

      const q1Fouls = getTeamFoulsForQuarter('Q1', 'team-A', mockEvents);
      const q2Fouls = getTeamFoulsForQuarter('Q2', 'team-A', mockEvents);

      assert.strictEqual(q1Fouls, 4);
      assert.strictEqual(isTeamInBonus(q1Fouls), true);

      assert.strictEqual(q2Fouls, 1);
      assert.strictEqual(isTeamInBonus(q2Fouls), false);
    });
  });

  describe('FIBA Valuation / PIR Formula', () => {
    it('calculates exact official FIBA Performance Index Rating', () => {
      // Example performance:
      // Points: 20
      // Rebounds: 8 (3 OREB, 5 DREB)
      // Assists: 5
      // Steals: 2
      // Blocks: 1
      // Missed Field Goals: 4 (scored 8/12)
      // Missed Free Throws: 1 (scored 3/4)
      // Turnovers: 3
      // Fouls committed: 2
      // Positive = 20 + 8 + 5 + 2 + 1 = 36
      // Negative = 4 + 1 + 3 + 2 = 10
      // Expected PIR = 36 - 10 = 26
      const pir = calculateFibaPir({
        points: 20,
        totalRebounds: 8,
        assists: 5,
        steals: 2,
        blocks: 1,
        missedFieldGoals: 4,
        missedFreeThrows: 1,
        turnovers: 3,
        totalFouls: 2,
      });

      assert.strictEqual(pir, 26);
    });

    it('can produce negative PIR for poor performances', () => {
      // 0 pts, 0 reb, 0 ast, 0 stl, 0 blk
      // 5 missed FG, 2 missed FT, 4 TOV, 3 fouls
      // Positive = 0
      // Negative = 5 + 2 + 4 + 3 = 14
      // Expected PIR = -14
      const pir = calculateFibaPir({
        points: 0,
        totalRebounds: 0,
        assists: 0,
        steals: 0,
        blocks: 0,
        missedFieldGoals: 5,
        missedFreeThrows: 2,
        turnovers: 4,
        totalFouls: 3,
      });

      assert.strictEqual(pir, -14);
    });
  });

  describe('Player Box Score Calculation', () => {
    it('aggregates stats accurately from play-by-play events', () => {
      const pId = 'player-23';
      const events: PlayByPlayEvent[] = [
        // 2 Free Throws (1 made, 1 missed)
        {
          id: '1',
          matchId: 'm1',
          quarter: 'Q1',
          quarterTimeRemainingSeconds: 580,
          teamId: 't1',
          isOwnTeam: true,
          playerId: pId,
          type: 'FT_MADE',
          scoreAtEvent: { home: 1, away: 0 },
          timestamp: new Date().toISOString(),
        },
        {
          id: '2',
          matchId: 'm1',
          quarter: 'Q1',
          quarterTimeRemainingSeconds: 570,
          teamId: 't1',
          isOwnTeam: true,
          playerId: pId,
          type: 'FT_MISS',
          scoreAtEvent: { home: 1, away: 0 },
          timestamp: new Date().toISOString(),
        },
        // 2-point FG (2 made, 1 missed)
        {
          id: '3',
          matchId: 'm1',
          quarter: 'Q1',
          quarterTimeRemainingSeconds: 500,
          teamId: 't1',
          isOwnTeam: true,
          playerId: pId,
          type: 'FG2_MADE',
          scoreAtEvent: { home: 3, away: 0 },
          timestamp: new Date().toISOString(),
        },
        {
          id: '4',
          matchId: 'm1',
          quarter: 'Q1',
          quarterTimeRemainingSeconds: 450,
          teamId: 't1',
          isOwnTeam: true,
          playerId: pId,
          type: 'FG2_MADE',
          scoreAtEvent: { home: 5, away: 0 },
          timestamp: new Date().toISOString(),
        },
        {
          id: '5',
          matchId: 'm1',
          quarter: 'Q1',
          quarterTimeRemainingSeconds: 400,
          teamId: 't1',
          isOwnTeam: true,
          playerId: pId,
          type: 'FG2_MISS',
          scoreAtEvent: { home: 5, away: 0 },
          timestamp: new Date().toISOString(),
        },
        // 3-point FG (1 made, 1 missed)
        {
          id: '6',
          matchId: 'm1',
          quarter: 'Q2',
          quarterTimeRemainingSeconds: 300,
          teamId: 't1',
          isOwnTeam: true,
          playerId: pId,
          type: 'FG3_MADE',
          scoreAtEvent: { home: 8, away: 0 },
          timestamp: new Date().toISOString(),
        },
        {
          id: '7',
          matchId: 'm1',
          quarter: 'Q2',
          quarterTimeRemainingSeconds: 200,
          teamId: 't1',
          isOwnTeam: true,
          playerId: pId,
          type: 'FG3_MISS',
          scoreAtEvent: { home: 8, away: 0 },
          timestamp: new Date().toISOString(),
        },
        // Rebounds (2 OREB, 3 DREB)
        {
          id: '8',
          matchId: 'm1',
          quarter: 'Q2',
          quarterTimeRemainingSeconds: 150,
          teamId: 't1',
          isOwnTeam: true,
          playerId: pId,
          type: 'OREB',
          scoreAtEvent: { home: 8, away: 0 },
          timestamp: new Date().toISOString(),
        },
        {
          id: '9',
          matchId: 'm1',
          quarter: 'Q2',
          quarterTimeRemainingSeconds: 140,
          teamId: 't1',
          isOwnTeam: true,
          playerId: pId,
          type: 'OREB',
          scoreAtEvent: { home: 8, away: 0 },
          timestamp: new Date().toISOString(),
        },
        {
          id: '10',
          matchId: 'm1',
          quarter: 'Q2',
          quarterTimeRemainingSeconds: 100,
          teamId: 't1',
          isOwnTeam: true,
          playerId: pId,
          type: 'DREB',
          scoreAtEvent: { home: 8, away: 0 },
          timestamp: new Date().toISOString(),
        },
        {
          id: '11',
          matchId: 'm1',
          quarter: 'Q3',
          quarterTimeRemainingSeconds: 500,
          teamId: 't1',
          isOwnTeam: true,
          playerId: pId,
          type: 'DREB',
          scoreAtEvent: { home: 8, away: 0 },
          timestamp: new Date().toISOString(),
        },
        {
          id: '12',
          matchId: 'm1',
          quarter: 'Q3',
          quarterTimeRemainingSeconds: 400,
          teamId: 't1',
          isOwnTeam: true,
          playerId: pId,
          type: 'DREB',
          scoreAtEvent: { home: 8, away: 0 },
          timestamp: new Date().toISOString(),
        },
        // Assists
        {
          id: '13',
          matchId: 'm1',
          quarter: 'Q3',
          quarterTimeRemainingSeconds: 300,
          teamId: 't1',
          isOwnTeam: true,
          playerId: 'other-player',
          assistedByPlayerId: pId,
          type: 'FG2_MADE',
          scoreAtEvent: { home: 10, away: 0 },
          timestamp: new Date().toISOString(),
        },
        // Steal, Block, Turnover
        {
          id: '14',
          matchId: 'm1',
          quarter: 'Q3',
          quarterTimeRemainingSeconds: 200,
          teamId: 't1',
          isOwnTeam: true,
          playerId: pId,
          type: 'STL',
          scoreAtEvent: { home: 10, away: 0 },
          timestamp: new Date().toISOString(),
        },
        {
          id: '15',
          matchId: 'm1',
          quarter: 'Q4',
          quarterTimeRemainingSeconds: 500,
          teamId: 't1',
          isOwnTeam: true,
          playerId: pId,
          type: 'BLK',
          scoreAtEvent: { home: 10, away: 0 },
          timestamp: new Date().toISOString(),
        },
        {
          id: '16',
          matchId: 'm1',
          quarter: 'Q4',
          quarterTimeRemainingSeconds: 400,
          teamId: 't1',
          isOwnTeam: true,
          playerId: pId,
          type: 'TOV',
          scoreAtEvent: { home: 10, away: 0 },
          timestamp: new Date().toISOString(),
        },
        // Fouls: 1 personal
        {
          id: '17',
          matchId: 'm1',
          quarter: 'Q4',
          quarterTimeRemainingSeconds: 200,
          teamId: 't1',
          isOwnTeam: true,
          playerId: pId,
          type: 'FOUL_PERSONAL',
          scoreAtEvent: { home: 10, away: 0 },
          timestamp: new Date().toISOString(),
        },
      ];

      const box = calculatePlayerBoxScore(pId, events, [pId], 't1');

      // Points: 1 FT + (2*2) FG2 + (1*3) FG3 = 1 + 4 + 3 = 8
      assert.strictEqual(box.points, 8);

      // FT: 1/2 = 50%
      assert.strictEqual(box.ft.made, 1);
      assert.strictEqual(box.ft.attempted, 2);
      assert.strictEqual(box.ft.percentage, 50.0);

      // FG2: 2/3 = 66.7%
      assert.strictEqual(box.fg2.made, 2);
      assert.strictEqual(box.fg2.attempted, 3);
      assert.strictEqual(box.fg2.percentage, 66.7);

      // FG3: 1/2 = 50%
      assert.strictEqual(box.fg3.made, 1);
      assert.strictEqual(box.fg3.attempted, 2);
      assert.strictEqual(box.fg3.percentage, 50.0);

      // Total Field Goals: (2+1)/(3+2) = 3/5 = 60.0%
      assert.strictEqual(box.fgTotal.made, 3);
      assert.strictEqual(box.fgTotal.attempted, 5);
      assert.strictEqual(box.fgTotal.percentage, 60.0);

      // Rebounds: 2 OREB + 3 DREB = 5 Total
      assert.strictEqual(box.offensiveRebounds, 2);
      assert.strictEqual(box.defensiveRebounds, 3);
      assert.strictEqual(box.totalRebounds, 5);

      // Playmaking & Defense
      assert.strictEqual(box.assists, 1);
      assert.strictEqual(box.steals, 1);
      assert.strictEqual(box.blocks, 1);
      assert.strictEqual(box.turnovers, 1);
      assert.strictEqual(box.fouls.total, 1);

      // FIBA PIR:
      // Positive: 8 (PTS) + 5 (REB) + 1 (AST) + 1 (STL) + 1 (BLK) = 16
      // Negative: 2 (Missed FG) + 1 (Missed FT) + 1 (TOV) + 1 (Fouls) = 5
      // Expected PIR: 16 - 5 = 11
      assert.strictEqual(box.pir, 11);
    });
  });

  describe('Plus/Minus (+/-) Tracking with Substitutions', () => {
    it('calculates exact plus/minus while player is on the floor', () => {
      const p1 = 'p1';
      const pSub = 'pSub';
      const events: PlayByPlayEvent[] = [
        // Own team scores +2 while p1 is on court
        {
          id: '1',
          matchId: 'm1',
          quarter: 'Q1',
          quarterTimeRemainingSeconds: 580,
          teamId: 't-own',
          isOwnTeam: true,
          playerId: p1,
          type: 'FG2_MADE',
          scoreAtEvent: { home: 2, away: 0 },
          timestamp: new Date().toISOString(),
        },
        // Rival scores +3 while p1 is on court
        {
          id: '2',
          matchId: 'm1',
          quarter: 'Q1',
          quarterTimeRemainingSeconds: 550,
          teamId: 't-rival',
          isOwnTeam: false,
          playerId: 'rival-1',
          type: 'FG3_MADE',
          scoreAtEvent: { home: 2, away: 3 },
          timestamp: new Date().toISOString(),
        },
        // Substitution: p1 leaves court, pSub enters
        {
          id: '3',
          matchId: 'm1',
          quarter: 'Q1',
          quarterTimeRemainingSeconds: 500,
          teamId: 't-own',
          isOwnTeam: true,
          type: 'SUBSTITUTION',
          substitution: { playerInId: pSub, playerOutId: p1 },
          scoreAtEvent: { home: 2, away: 3 },
          timestamp: new Date().toISOString(),
        },
        // Own team scores +2 while p1 is on bench (should NOT count for p1)
        {
          id: '4',
          matchId: 'm1',
          quarter: 'Q1',
          quarterTimeRemainingSeconds: 450,
          teamId: 't-own',
          isOwnTeam: true,
          playerId: pSub,
          type: 'FG2_MADE',
          scoreAtEvent: { home: 4, away: 3 },
          timestamp: new Date().toISOString(),
        },
        // Substitution: p1 returns to court, pSub leaves
        {
          id: '5',
          matchId: 'm1',
          quarter: 'Q2',
          quarterTimeRemainingSeconds: 590,
          teamId: 't-own',
          isOwnTeam: true,
          type: 'SUBSTITUTION',
          substitution: { playerInId: p1, playerOutId: pSub },
          scoreAtEvent: { home: 4, away: 3 },
          timestamp: new Date().toISOString(),
        },
        // Own team scores +3 with p1 on court
        {
          id: '6',
          matchId: 'm1',
          quarter: 'Q2',
          quarterTimeRemainingSeconds: 550,
          teamId: 't-own',
          isOwnTeam: true,
          playerId: p1,
          type: 'FG3_MADE',
          scoreAtEvent: { home: 7, away: 3 },
          timestamp: new Date().toISOString(),
        },
      ];

      // p1 timeline:
      // Event 1: +2
      // Event 2: -3 (net -1)
      // Event 4 (on bench): ignored
      // Event 6: +3 (net +2)
      // Expected Plus/Minus: +2
      const plusMinusP1 = calculatePlayerPlusMinus(p1, [p1], events, 't-own');
      assert.strictEqual(plusMinusP1, 2);

      // pSub timeline:
      // Event 1, 2 (on bench): ignored
      // Event 4: +2
      // Event 6 (on bench): ignored
      // Expected Plus/Minus for pSub: +2
      const plusMinusSub = calculatePlayerPlusMinus(
        pSub,
        ['other1', 'other2'],
        events,
        't-own'
      );
      assert.strictEqual(plusMinusSub, 2);
    });
  });

  describe('Team Box Score Aggregator', () => {
    it('aggregates individual player stats to team totals', () => {
      const p1 = 'p1';
      const p2 = 'p2';
      const events: PlayByPlayEvent[] = [
        {
          id: '1',
          matchId: 'm1',
          quarter: 'Q1',
          quarterTimeRemainingSeconds: 500,
          teamId: 't1',
          isOwnTeam: true,
          playerId: p1,
          type: 'FG2_MADE',
          scoreAtEvent: { home: 2, away: 0 },
          timestamp: new Date().toISOString(),
        },
        {
          id: '2',
          matchId: 'm1',
          quarter: 'Q1',
          quarterTimeRemainingSeconds: 400,
          teamId: 't1',
          isOwnTeam: true,
          playerId: p2,
          type: 'FG3_MADE',
          scoreAtEvent: { home: 5, away: 0 },
          timestamp: new Date().toISOString(),
        },
      ];

      const { players, teamTotal } = calculateTeamBoxScore(
        't1',
        [p1, p2],
        events,
        [p1, p2]
      );

      assert.strictEqual(players[p1].points, 2);
      assert.strictEqual(players[p2].points, 3);
      assert.strictEqual(teamTotal.points, 5);
      assert.strictEqual(teamTotal.fgTotal.made, 2);
      assert.strictEqual(teamTotal.fgTotal.attempted, 2);
      assert.strictEqual(teamTotal.fgTotal.percentage, 100.0);
    });
  });
});

