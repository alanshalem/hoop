import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CLUB_PROFILE, createSeedState, SEED_LIVE_MATCH_ID } from './seed-data';
import { MatchSchema } from '@/core/domain/entities/match.types';
import { PlayerSchema, TeamSchema, UserSchema } from '@/core/domain/entities/club.types';
import {
  deriveScoreboard,
  getOwnRivalScore,
  getQuarterPartials,
} from '@/core/domain/rules/match-derivations';
import { getPlayerFoulsFromEvents } from '@/core/domain/rules/basketball-rules';
import { CHART_CATEGORIES, findChartCode } from '@/core/domain/entities/chart.types';

const NOW = new Date('2026-10-30T18:00:00.000Z');

const SVG_W = 500;
const SVG_H = 470;
const BASKET = { x: 250, y: 60 };
const THREE_POINT_RADIUS = 235;

function isThreePointSpot(x: number, y: number): boolean {
  const svgX = (x / 100) * SVG_W;
  const svgY = (y / 100) * SVG_H;
  const isCorner = (svgX <= 45 || svgX >= 455) && svgY <= 120;
  return isCorner || Math.hypot(svgX - BASKET.x, svgY - BASKET.y) >= THREE_POINT_RADIUS;
}

describe('seed data', () => {
  const state = createSeedState(NOW);

  it('is deterministic', () => {
    assert.deepStrictEqual(createSeedState(NOW), state);
  });

  it('validates against the domain schemas', () => {
    state.users.forEach((u) => UserSchema.parse(u));
    state.players.forEach((p) => PlayerSchema.parse(p));
    state.teams.forEach((t) => TeamSchema.parse(t));
    state.matches.forEach((m) => MatchSchema.parse(m));
  });

  it('has at least three head coaches', () => {
    assert.ok(state.users.filter((u) => u.role === 'HEAD_COACH').length >= 3);
  });

  it('gives the injured player a medical note', () => {
    const injured = state.players.filter((p) => p.status === 'INJURED');
    assert.ok(injured.length > 0);
    assert.ok(injured.every((p) => (p.medicalNote ?? '').length > 0));
  });

  it('stores scores and team fouls equal to the values derived from events', () => {
    for (const match of state.matches) {
      const derived = deriveScoreboard(match);
      assert.strictEqual(match.homeScore, derived.homeScore, match.id);
      assert.strictEqual(match.awayScore, derived.awayScore, match.id);
      assert.strictEqual(match.homeFoulsQuarter, derived.homeFoulsQuarter, match.id);
      assert.strictEqual(match.awayFoulsQuarter, derived.awayFoulsQuarter, match.id);
    }
  });

  it('keeps scoreAtEvent consistent with the running score', () => {
    for (const match of state.matches) {
      match.events.forEach((event, index) => {
        const partial = deriveScoreboard({ ...match, events: match.events.slice(0, index + 1) });
        assert.deepStrictEqual(
          event.scoreAtEvent,
          { home: partial.homeScore, away: partial.awayScore },
          `${match.id} ${event.id}`
        );
      });
    }
  });

  it('reproduces the 84-78 finished match with its quarter partials', () => {
    const match = state.matches.find((m) => m.id === 'match-past-1');
    assert.ok(match);
    assert.strictEqual(match.status, 'FINISHED');
    assert.deepStrictEqual(getOwnRivalScore(match), { own: 84, rival: 78 });
    assert.deepStrictEqual(
      getQuarterPartials(match.events, match.condition).map((p) => [p.own, p.rival]),
      [
        [22, 19],
        [14, 12],
        [26, 24],
        [22, 23],
      ]
    );
  });

  it('includes one more win and one loss among the finished matches', () => {
    const finished = state.matches.filter((m) => m.status === 'FINISHED');
    assert.strictEqual(finished.length, 3);
    const results = finished.map((m) => {
      const { own, rival } = getOwnRivalScore(m);
      return own > rival ? 'W' : 'L';
    });
    assert.deepStrictEqual(results.sort(), ['L', 'W', 'W']);
  });

  it('has a live match today in Q2 at 36-31 with the rival in bonus', () => {
    const live = state.matches.find((m) => m.id === SEED_LIVE_MATCH_ID);
    assert.ok(live);
    assert.strictEqual(live.status, 'LIVE');
    assert.strictEqual(live.currentQuarter, 'Q2');
    assert.strictEqual(live.date.slice(0, 10), NOW.toISOString().slice(0, 10));
    assert.deepStrictEqual(getOwnRivalScore(live), { own: 36, rival: 31 });
    const rivalFouls = live.condition === 'HOME' ? live.awayFoulsQuarter : live.homeFoulsQuarter;
    assert.strictEqual(rivalFouls, 4);
    assert.strictEqual(live.activeLineupOwn.length, 5);
    assert.strictEqual(live.startingLineupOwn.length, 5);
  });

  it('has realistic play-by-play (subs, rebounds, assists, fouls, turnovers)', () => {
    for (const match of state.matches.filter((m) => m.events.length > 0)) {
      const types = new Set(match.events.map((e) => e.type));
      for (const type of ['SUBSTITUTION', 'DREB', 'OREB', 'FOUL_PERSONAL', 'TOV'] as const) {
        assert.ok(types.has(type), `${match.id} lacks ${type}`);
      }
      assert.ok(match.events.some((e) => e.assistedByPlayerId), `${match.id} lacks assists`);
    }
  });

  it('never lets a player on court be fouled out', () => {
    for (const match of state.matches) {
      for (const playerId of match.rosterOwnPlayerIds) {
        const fouls = getPlayerFoulsFromEvents(playerId, match.events);
        assert.ok(fouls.total < 5, `${match.id} ${playerId}`);
      }
    }
  });

  it('places own field goals in coordinates consistent with the shot-chart geometry', () => {
    for (const match of state.matches) {
      for (const event of match.events) {
        if (!event.isOwnTeam) continue;
        const isFg2 = event.type === 'FG2_MADE' || event.type === 'FG2_MISS';
        const isFg3 = event.type === 'FG3_MADE' || event.type === 'FG3_MISS';
        if (!isFg2 && !isFg3) continue;
        assert.ok(event.coordinates, `${event.id} has coordinates`);
        assert.strictEqual(
          isThreePointSpot(event.coordinates.x, event.coordinates.y),
          isFg3,
          `${event.id} ${event.type} at ${event.coordinates.x},${event.coordinates.y}`
        );
      }
    }
  });

  it('charts every quarter of the finished matches with valid tactical entries', () => {
    const finished = state.matches.filter((m) => m.status === 'FINISHED');
    for (const match of finished) {
      for (const quarter of ['Q1', 'Q2', 'Q3', 'Q4'] as const) {
        const entries = match.events.filter((e) => e.type === 'CHART' && e.quarter === quarter);
        assert.ok(entries.length >= 6 && entries.length <= 14, `${match.id} ${quarter}: ${entries.length}`);
      }
      const categories = new Set(match.events.filter((e) => e.type === 'CHART').map((e) => e.chart?.category));
      assert.deepStrictEqual([...categories].sort(), [...CHART_CATEGORIES].sort(), match.id);
    }
    const live = state.matches.find((m) => m.id === SEED_LIVE_MATCH_ID);
    assert.ok(live?.events.some((e) => e.type === 'CHART'), 'live match has chart entries');
  });

  it('stores chart entries like the live sheet does (own team, catalog codes, points only when allowed)', () => {
    for (const match of state.matches) {
      let lineup = [...match.startingLineupOwn];
      for (const event of match.events) {
        if (event.type === 'SUBSTITUTION' && event.substitution) {
          const { playerInId, playerOutId } = event.substitution;
          lineup = lineup.map((id) => (id === playerOutId ? playerInId : id));
        }
        if (event.type !== 'CHART') {
          assert.strictEqual(event.chart, undefined, event.id);
          continue;
        }
        assert.ok(event.chart, `${event.id} has a chart entry`);
        const { category, code, points, made } = event.chart;
        assert.ok(findChartCode(category, code), `${event.id} ${category}/${code}`);
        assert.strictEqual(event.isOwnTeam, true, event.id);
        assert.strictEqual(event.teamId, match.ownTeamId, event.id);
        if (event.playerId) assert.ok(lineup.includes(event.playerId), `${event.id} player on court`);
        if (category === 'POINTS_ALLOWED') {
          assert.ok(points === 1 || points === 2 || points === 3, `${event.id} points ${points}`);
        } else if (category === 'OFFENSE') {
          assert.strictEqual(typeof made, 'boolean', `${event.id} offensive result (S11)`);
          if (made) assert.ok(points === 2 || points === 3, `${event.id} made points ${points}`);
          else assert.strictEqual(points, undefined, `${event.id} missed without points`);
        } else {
          assert.strictEqual(points, undefined, `${event.id} points only on POINTS_ALLOWED`);
        }
      }
    }
  });

  it('keeps events chronological within each match', () => {
    const order = ['Q1', 'Q2', 'Q3', 'Q4', 'OT1', 'OT2', 'OT3', 'OT4'];
    for (const match of state.matches) {
      for (let i = 1; i < match.events.length; i++) {
        const prev = match.events[i - 1];
        const cur = match.events[i];
        const qDiff = order.indexOf(cur.quarter) - order.indexOf(prev.quarter);
        assert.ok(qDiff >= 0, `${match.id} quarter order`);
        if (qDiff === 0) {
          assert.ok(cur.quarterTimeRemainingSeconds <= prev.quarterTimeRemainingSeconds, `${match.id} clock`);
        }
      }
    }
  });
});

describe('club identity', () => {
  it('names the club Club Atlético Monte Grande in the profile, teams and own matches', () => {
    const state = createSeedState(NOW);
    assert.strictEqual(CLUB_PROFILE.name, 'Club Atlético Monte Grande');
    for (const team of state.teams) {
      assert.ok(team.name.startsWith('Club Atlético Monte Grande - '), team.name);
    }
    for (const match of state.matches) {
      assert.ok(!/Hoop/.test(`${match.ownTeamName} ${match.venue ?? ''}`), match.id);
    }
    for (const user of state.users) {
      assert.ok(!user.email.includes('hoop'), user.email);
    }
  });
});

describe('seed free-throw trips in the chart', () => {
  it('charts a rival free-throw trip with exactly the free throws made, never zero', () => {
    const state = createSeedState(NOW);
    let checked = 0;
    for (const match of state.matches) {
      match.events.forEach((event, index) => {
        if (event.type !== 'CHART' || event.chart?.code !== 'UNNECESSARY_FOUL') return;
        if (event.chart.category !== 'POINTS_ALLOWED') return;
        let start = index;
        const isRivalFt = (i: number) =>
          !match.events[i].isOwnTeam && (match.events[i].type === 'FT_MADE' || match.events[i].type === 'FT_MISS');
        while (start > 0 && isRivalFt(start - 1)) start--;
        const made = match.events.slice(start, index).filter((e) => e.type === 'FT_MADE').length;
        assert.ok(made > 0, `${event.id} charted a trip without made free throws`);
        assert.strictEqual(event.chart.points, made, event.id);
        checked++;
      });
    }
    assert.ok(checked > 0, 'the seed charts at least one free-throw trip');
  });
});
