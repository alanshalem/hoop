import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateSeasonLeaders, calculateSeasonSummary } from './season-analytics';
import type { Player } from '../entities/club.types';
import { makeEvent, makeMatch } from '@/core/testing/fixtures';

function player(id: string): Player {
  return {
    id,
    firstName: id,
    lastName: id,
    dorsal: 1,
    heightCm: 190,
    dominantHand: 'RIGHT',
    position: 'PG',
    status: 'ACTIVE',
    clubId: 'c',
  };
}

const win = makeMatch({
  id: 'm-win',
  status: 'FINISHED',
  rosterOwnPlayerIds: ['p1', 'p2'],
  startingLineupOwn: ['p1', 'p2'],
  events: [
    makeEvent({ playerId: 'p1', type: 'FG3_MADE' }),
    makeEvent({ playerId: 'p1', type: 'FG3_MISS' }),
    makeEvent({ playerId: 'p2', type: 'FG2_MADE', assistedByPlayerId: 'p1' }),
    makeEvent({ playerId: 'p2', type: 'DREB' }),
    makeEvent({ type: 'FG2_MADE', isOwnTeam: false }),
  ],
});

const loss = makeMatch({
  id: 'm-loss',
  status: 'FINISHED',
  condition: 'AWAY',
  rosterOwnPlayerIds: ['p1', 'p2'],
  startingLineupOwn: ['p1', 'p2'],
  events: [
    makeEvent({ playerId: 'p2', type: 'FG2_MISS' }),
    makeEvent({ playerId: 'p2', type: 'OREB' }),
    makeEvent({ playerId: 'p1', type: 'FT_MADE' }),
    makeEvent({ type: 'FG3_MADE', isOwnTeam: false }),
  ],
});

const live = makeMatch({
  id: 'm-live',
  status: 'LIVE',
  events: [makeEvent({ playerId: 'p1', type: 'FG3_MADE' })],
});

const otherTeam = makeMatch({ id: 'm-other', status: 'FINISHED', ownTeamId: 'team-x' });

describe('calculateSeasonSummary', () => {
  it('aggregates finished matches of the team only', () => {
    const summary = calculateSeasonSummary([win, loss, live, otherTeam], 'team-own');
    assert.deepStrictEqual(summary, {
      played: 2,
      wins: 1,
      losses: 1,
      winPct: 50,
      pointsForAvg: 3, // (5 + 1) / 2
      pointsAgainstAvg: 2.5, // (2 + 3) / 2
      diffAvg: 0.5,
    });
  });

  it('counts finished matches without play-by-play by their official result (S3)', () => {
    const officialLoss = makeMatch({
      id: 'm-official',
      status: 'FINISHED',
      condition: 'AWAY',
      events: [],
      officialResult: { home: 70, away: 60, quarters: [] },
    });
    const officialWin = makeMatch({
      id: 'm-official-win',
      status: 'FINISHED',
      condition: 'HOME',
      events: [],
      officialResult: { home: 80, away: 75, quarters: [] },
    });
    const summary = calculateSeasonSummary([officialLoss, officialWin], 'team-own');
    assert.strictEqual(summary.played, 2);
    assert.strictEqual(summary.wins, 1);
    assert.strictEqual(summary.losses, 1);
    assert.strictEqual(summary.pointsForAvg, 70); // (60 + 80) / 2
    assert.strictEqual(summary.pointsAgainstAvg, 72.5); // (70 + 75) / 2
  });

  it('returns zeros when the team has no finished matches', () => {
    const summary = calculateSeasonSummary([live], 'team-own');
    assert.strictEqual(summary.played, 0);
    assert.strictEqual(summary.winPct, 0);
    assert.strictEqual(summary.pointsForAvg, 0);
  });
});

describe('calculateSeasonLeaders', () => {
  const players = [player('p1'), player('p2')];

  it('returns the per-game points leader only (the sheet records points, nothing else per player)', () => {
    const leaders = calculateSeasonLeaders([win, loss, live], players, 'team-own');
    assert.deepStrictEqual(Object.keys(leaders), ['points']);
    assert.strictEqual(leaders.points?.player.id, 'p1');
    assert.strictEqual(leaders.points?.value, 2); // (3 + 1) / 2
    assert.strictEqual(leaders.points?.gamesPlayed, 2);
  });

  it('returns a null leader when there is no data', () => {
    const leaders = calculateSeasonLeaders([live], players, 'team-own');
    assert.deepStrictEqual(leaders, { points: null });
  });

  it('has no shooting percentages in the season summary', () => {
    const summary = calculateSeasonSummary([win, loss], 'team-own');
    assert.ok(!('fgPct' in summary) && !('fg3Pct' in summary));
  });
});
