import { CHART_CATEGORIES, type ChartCategory, type ChartEntry } from '@/core/domain/entities/chart.types';
import type { BasketballPosition, Player } from '@/core/domain/entities/club.types';
import type {
  MatchCondition,
  PlayByPlayEvent,
  PlayByPlayEventType,
  Quarter,
} from '@/core/domain/entities/match.types';
import type { CourtCoordinates } from '@/core/domain/value-objects/coordinates';
import { FIBA_FOUL_TROUBLE_THRESHOLD } from '@/core/domain/rules/basketball-rules';
import {
  getEventPoints,
  isHomeTeamEvent,
  RIVAL_TEAM_ID,
} from '@/core/domain/rules/event-rules';
import { formatGameClock, getQuarterLengthSeconds } from '@/core/domain/rules/game-clock';
import { createRandom, Random } from './prng';

/**
 * =============================================================================
 * HOOP OS - MOCK PLAY-BY-PLAY GENERATOR
 * Builds a realistic, deterministic event log that reproduces exact period
 * scores. Shots carry coordinates in the shot-chart geometry. Tactical chart
 * entries ("Planilla") are added on top, anchored to the plays they explain.
 * =============================================================================
 */

export interface PeriodPlan {
  quarter: Quarter;
  own: number;
  rival: number;
  /** Team fouls committed in the period (raised if free-throw trips need more). */
  ownFouls: number;
  rivalFouls: number;
  /** Clock where the log stops (0 for a completed period). */
  endClock?: number;
}

export interface MatchPlan {
  matchId: string;
  ownTeamId: string;
  condition: MatchCondition;
  kickoff: Date;
  seed: number;
  players: Player[];
  rosterIds: string[];
  starterIds: string[];
  /** Relative shooting usage per player (default 1). */
  scoringWeights?: Record<string, number>;
  periods: PeriodPlan[];
}

export interface GeneratedPlayByPlay {
  events: PlayByPlayEvent[];
  activeLineup: string[];
}

type Side = 'OWN' | 'RIVAL';

type Action =
  | { kind: 'FG'; side: Side; value: 2 | 3; made: boolean }
  | { kind: 'FT_TRIP'; side: Side; made: 1 | 2 }
  | { kind: 'TOV'; side: Side }
  | { kind: 'FOUL'; side: Side }
  | { kind: 'SUB' };

// Shot-chart geometry (SVG 500x470, basket at (250, 60), 3pt radius 235).
const COURT_W = 500;
const COURT_H = 470;
const BASKET = { x: 250, y: 60 };

const REBOUND_WEIGHT: Record<BasketballPosition, number> = { C: 3, PF: 2.5, SF: 1.5, SG: 1, PG: 0.8 };
const ASSIST_WEIGHT: Record<BasketballPosition, number> = { PG: 3, SG: 1.5, SF: 1.2, PF: 1, C: 0.6 };

const other = (side: Side): Side => (side === 'OWN' ? 'RIVAL' : 'OWN');

function toPercent(svgX: number, svgY: number): CourtCoordinates {
  return {
    x: Math.round((svgX / COURT_W) * 1000) / 10,
    y: Math.round((svgY / COURT_H) * 1000) / 10,
  };
}

/** A spot inside the arc, away from the corner lanes. */
function twoPointSpot(rng: Random): CourtCoordinates {
  const radius = 15 + rng.next() * 180;
  const angle = -0.15 + rng.next() * (Math.PI + 0.3);
  return toPercent(BASKET.x + radius * Math.cos(angle), BASKET.y + radius * Math.sin(angle));
}

/** A corner three or a spot beyond the arc. */
function threePointSpot(rng: Random): CourtCoordinates {
  if (rng.chance(0.25)) {
    const x = rng.chance(0.5) ? 12 + rng.next() * 26 : 462 + rng.next() * 26;
    return toPercent(x, 20 + rng.next() * 90);
  }
  const radius = 248 + rng.next() * 40;
  const angle = Math.PI * (0.2 + rng.next() * 0.6);
  return toPercent(BASKET.x + radius * Math.cos(angle), BASKET.y + radius * Math.sin(angle));
}

/** Splits field-goal points into 2s and 3s (about a quarter of them from three). */
function splitFieldGoals(points: number, rng: Random): { twos: number; threes: number; leftover: number } {
  if (points < 2) return { twos: 0, threes: 0, leftover: points };
  let threes = Math.round((points * (0.2 + rng.next() * 0.15)) / 3);
  if ((points - threes * 3) % 2 !== 0) {
    threes += threes * 3 + 3 <= points ? 1 : -1;
  }
  threes = Math.max(0, threes);
  if ((points - threes * 3) % 2 !== 0) threes += 1;
  return { twos: (points - threes * 3) / 2, threes, leftover: 0 };
}

function freeThrowTrips(points: number, maxTrips: number, rng: Random): Array<1 | 2> {
  const trips: Array<1 | 2> = [];
  let remaining = points;
  while (remaining > 0) {
    // A 1-of-2 trip is only allowed if the rest still fits in the foul budget.
    const canMakeOne = trips.length + 1 + Math.ceil((remaining - 1) / 2) <= maxTrips;
    const made: 1 | 2 = remaining >= 2 && (!canMakeOne || rng.chance(0.7)) ? 2 : 1;
    trips.push(made);
    remaining -= made;
  }
  return trips;
}

function sideActions(
  side: Side,
  points: number,
  opponentFouls: number,
  periodShare: number,
  rng: Random
): { actions: Action[]; trips: number } {
  const ftBudget = Math.min(points, opponentFouls * 2, Math.round(points * (0.1 + rng.next() * 0.1)));
  const split = splitFieldGoals(points - ftBudget, rng);
  const ftPoints = ftBudget + split.leftover;
  const trips = freeThrowTrips(ftPoints, opponentFouls, rng);

  const actions: Action[] = [];
  for (let i = 0; i < split.twos; i++) actions.push({ kind: 'FG', side, value: 2, made: true });
  for (let i = 0; i < split.threes; i++) actions.push({ kind: 'FG', side, value: 3, made: true });
  const missedTwos = Math.round(split.twos * (0.7 + rng.next() * 0.4));
  const missedThrees = Math.round(split.threes * (1.3 + rng.next() * 0.6)) + (rng.chance(0.5) ? 1 : 0);
  for (let i = 0; i < missedTwos; i++) actions.push({ kind: 'FG', side, value: 2, made: false });
  for (let i = 0; i < missedThrees; i++) actions.push({ kind: 'FG', side, value: 3, made: false });
  for (const made of trips) actions.push({ kind: 'FT_TRIP', side, made });
  const turnovers = Math.max(1, Math.round((2 + rng.int(0, 2)) * periodShare));
  for (let i = 0; i < turnovers; i++) actions.push({ kind: 'TOV', side });
  return { actions, trips: trips.length };
}

export function generatePlayByPlay(plan: MatchPlan): GeneratedPlayByPlay {
  const rng = createRandom(plan.seed);
  const playerById = new Map(plan.players.map((p) => [p.id, p]));
  const position = (id: string): BasketballPosition => playerById.get(id)?.position ?? 'SF';
  const scoringWeight = (id: string) => plan.scoringWeights?.[id] ?? 1;

  const lineup = [...plan.starterIds];
  const fouls = new Map<string, number>();
  const events: PlayByPlayEvent[] = [];
  let homeScore = 0;
  let awayScore = 0;

  plan.periods.forEach((period, periodIndex) => {
    const length = getQuarterLengthSeconds(period.quarter);
    const endClock = period.endClock ?? 0;
    const share = (length - endClock) / length;

    const own = sideActions('OWN', period.own, period.rivalFouls, share, rng);
    const rival = sideActions('RIVAL', period.rival, period.ownFouls, share, rng);
    const actions: Action[] = [...own.actions, ...rival.actions];
    for (let i = own.trips; i < period.rivalFouls; i++) actions.push({ kind: 'FOUL', side: 'RIVAL' });
    for (let i = rival.trips; i < period.ownFouls; i++) actions.push({ kind: 'FOUL', side: 'OWN' });
    const subs = Math.max(1, Math.round(3 * share));
    for (let i = 0; i < subs; i++) actions.push({ kind: 'SUB' });

    const ordered = rng.shuffle(actions);
    const step = (length - endClock) / (ordered.length + 1);

    ordered.forEach((action, index) => {
      const jitter = (rng.next() - 0.5) * step * 0.6;
      const clock = Math.max(endClock, Math.min(length, Math.round(length - (index + 1) * step + jitter)));
      const realSeconds = periodIndex * 25 * 60 + (length - clock) * 2;
      const timestamp = new Date(plan.kickoff.getTime() + realSeconds * 1000).toISOString();

      const emit = (
        side: Side,
        type: PlayByPlayEventType,
        extra: Partial<PlayByPlayEvent> = {}
      ): void => {
        const isOwnTeam = side === 'OWN';
        const points = getEventPoints(type);
        if (isHomeTeamEvent(plan.condition, isOwnTeam)) homeScore += points;
        else awayScore += points;
        events.push({
          id: `${plan.matchId}-ev-${String(events.length + 1).padStart(3, '0')}`,
          matchId: plan.matchId,
          quarter: period.quarter,
          quarterTimeRemainingSeconds: clock,
          gameClockFormatted: formatGameClock(clock),
          teamId: isOwnTeam ? plan.ownTeamId : RIVAL_TEAM_ID,
          isOwnTeam,
          type,
          scoreAtEvent: { home: homeScore, away: awayScore },
          timestamp,
          ...extra,
        });
      };

      const onCourt = (weight: (id: string) => number, exclude?: string): string =>
        rng.weightedPick(lineup.filter((id) => id !== exclude), weight);

      const ownFoul = (): void => {
        const candidates = lineup.filter((id) => (fouls.get(id) ?? 0) < FIBA_FOUL_TROUBLE_THRESHOLD);
        const playerId = candidates.length > 0 ? rng.pick(candidates) : undefined;
        if (playerId) fouls.set(playerId, (fouls.get(playerId) ?? 0) + 1);
        emit('OWN', 'FOUL_PERSONAL', { playerId });
      };

      const rebound = (shooter: Side): void => {
        const offensive = rng.chance(0.27);
        const side = offensive ? shooter : other(shooter);
        const playerId = side === 'OWN' ? onCourt((id) => REBOUND_WEIGHT[position(id)]) : undefined;
        emit(side, offensive ? 'OREB' : 'DREB', { playerId });
      };

      switch (action.kind) {
        case 'FG': {
          const type: PlayByPlayEventType = `FG${action.value}_${action.made ? 'MADE' : 'MISS'}`;
          if (action.side === 'RIVAL') {
            emit('RIVAL', type);
            if (!action.made && rng.chance(0.15)) {
              emit('OWN', 'BLK', { playerId: onCourt((id) => REBOUND_WEIGHT[position(id)]) });
            }
          } else {
            const shooter = onCourt(scoringWeight);
            const assisted = action.made && rng.chance(0.6);
            emit('OWN', type, {
              playerId: shooter,
              assistedByPlayerId: assisted
                ? onCourt((id) => ASSIST_WEIGHT[position(id)], shooter)
                : undefined,
              coordinates: action.value === 3 ? threePointSpot(rng) : twoPointSpot(rng),
            });
          }
          if (!action.made) rebound(action.side);
          break;
        }
        case 'FT_TRIP': {
          if (action.side === 'OWN') emit('RIVAL', 'FOUL_PERSONAL');
          else ownFoul();
          const shooter = action.side === 'OWN' ? onCourt(scoringWeight) : undefined;
          const attempts: PlayByPlayEventType[] =
            action.made === 2 ? ['FT_MADE', 'FT_MADE'] : ['FT_MISS', 'FT_MADE'];
          for (const type of attempts) emit(action.side, type, { playerId: shooter });
          break;
        }
        case 'TOV': {
          if (action.side === 'OWN') {
            emit('OWN', 'TOV', { playerId: onCourt(() => 1) });
          } else {
            emit('RIVAL', 'TOV');
            if (rng.chance(0.6)) emit('OWN', 'STL', { playerId: onCourt(() => 1) });
          }
          break;
        }
        case 'FOUL':
          if (action.side === 'OWN') ownFoul();
          else emit('RIVAL', 'FOUL_PERSONAL');
          break;
        case 'SUB': {
          const bench = plan.rosterIds.filter((id) => !lineup.includes(id));
          if (bench.length === 0) break;
          const playerOutId = rng.pick(lineup);
          const playerInId = rng.pick(bench);
          lineup[lineup.indexOf(playerOutId)] = playerInId;
          emit('OWN', 'SUBSTITUTION', { substitution: { playerInId, playerOutId } });
          break;
        }
      }
    });
  });

  return { events: withChartEntries(events, plan), activeLineup: lineup };
}

// Separate stream so chart entries never change the stat events of a seed.
const CHART_SEED_SALT = 0x5ce7;

type Weighted = readonly (readonly [code: string, weight: number])[];

const TURNOVER_CODES: Weighted = [
  ['BAD_PASS', 3],
  ['TRAVELLING', 2],
  ['BALL_HANDLING', 2],
  ['OUT_OF_BOUNDS', 1.5],
  ['OFFENSIVE_FOUL', 1.5],
  ['TIME_VIOLATION', 1],
  ['DOUBLE_DRIBBLE', 0.5],
  ['UNNECESSARY_FOUL', 0.5],
  ['OTHER', 0.3],
];
const TWO_ALLOWED_CODES: Weighted = [
  ['CUT', 2],
  ['ONE_ON_ONE', 2],
  ['PICK', 2],
  ['NO_DEF_REBOUND', 1.5],
  ['TURNOVER_FAST_BREAK', 1.2],
  ['NO_TRANSITION_D', 1],
  ['BAD_SHOT_TRANSITION', 1],
  ['NO_ROTATION', 1],
  ['OPPONENT_MERIT', 1],
];
const THREE_ALLOWED_CODES: Weighted = [
  ['NO_CLOSEOUT', 3],
  ['NO_ROTATION', 2],
  ['PICK', 1],
  ['BAD_SHOT_TRANSITION', 1],
  ['OPPONENT_MERIT', 1.5],
];
/** Allowed baskets the coach charts as a team breakdown, without a player. */
const TEAM_ALLOWED_CODES = new Set(['NO_TRANSITION_D', 'BAD_SHOT_TRANSITION', 'OPPONENT_MERIT']);
const OWN_MISS_CODES: Weighted = [
  ['GOOD_SHOT', 4],
  ['BAD_SHOT', 3.5],
  ['FORCED_SHOT', 2.5],
];
const RIVAL_MISS_CODES: Weighted = [
  ['CONTEST', 3],
  ['HELP', 2],
  ['ROTATION', 1.5],
  ['PRESSURE', 1],
  ['TRANSITION_D', 0.7],
  ['CUT', 0.5],
  ['PICK', 0.5],
];

interface ChartAnchor {
  index: number;
  category: ChartCategory;
  build(rng: Random): { chart: ChartEntry; playerId?: string };
}

const pickCode = (rng: Random, codes: Weighted): string => rng.weightedPick(codes, ([, w]) => w)[0];

/** Plays the coach could chart, each anchored to the stat event it explains. */
function chartAnchors(events: PlayByPlayEvent[], starterIds: string[]): ChartAnchor[] {
  const anchors: ChartAnchor[] = [];
  let lineup = [...starterIds];
  const isRivalFt = (event?: PlayByPlayEvent) =>
    event !== undefined && !event.isOwnTeam && (event.type === 'FT_MADE' || event.type === 'FT_MISS');

  events.forEach((event, index) => {
    if (event.type === 'SUBSTITUTION' && event.substitution) {
      const { playerInId, playerOutId } = event.substitution;
      lineup = lineup.map((id) => (id === playerOutId ? playerInId : id));
      return;
    }
    const onCourt = [...lineup];
    const add = (category: ChartCategory, build: ChartAnchor['build']) =>
      anchors.push({ index, category, build });
    const own = event.playerId;

    if (event.isOwnTeam) {
      switch (event.type) {
        case 'TOV':
          add('TURNOVER', (rng) => ({
            chart: { category: 'TURNOVER', code: pickCode(rng, TURNOVER_CODES) },
            playerId: own,
          }));
          break;
        case 'FG2_MADE':
        case 'FG3_MADE':
          add('OFFENSE', (rng) => ({
            chart: {
              category: 'OFFENSE',
              code: event.type === 'FG2_MADE' && rng.chance(0.4) ? 'LAYUP' : 'GOOD_SHOT',
              made: true,
              points: event.type === 'FG3_MADE' ? 3 : 2,
            },
            playerId: own,
          }));
          break;
        case 'FG2_MISS':
        case 'FG3_MISS':
          add('OFFENSE', (rng) => ({
            chart: { category: 'OFFENSE', code: pickCode(rng, OWN_MISS_CODES), made: false },
            playerId: own,
          }));
          break;
        case 'DREB':
          add('DEFENSE', (rng) =>
            rng.chance(0.6)
              ? { chart: { category: 'DEFENSE', code: 'DEF_REBOUND' }, playerId: own }
              : { chart: { category: 'DEFENSE', code: 'BOX_OUT' }, playerId: rng.pick(onCourt) }
          );
          break;
        case 'STL':
          add('DEFENSE', (rng) => ({
            chart: { category: 'DEFENSE', code: rng.chance(0.65) ? 'STEAL' : 'DEFLECTION' },
            playerId: own,
          }));
          break;
        case 'BLK':
          add('DEFENSE', () => ({ chart: { category: 'DEFENSE', code: 'CONTEST' }, playerId: own }));
          break;
        case 'FOUL_PERSONAL':
          // Shooting fouls are charted as points allowed once the free throws are in.
          if (isRivalFt(events[index + 1])) break;
          add('DEFENSE', (rng) => ({
            chart: { category: 'DEFENSE', code: rng.chance(0.55) ? 'GOOD_FOUL' : 'BAD_FOUL' },
            playerId: own,
          }));
          break;
      }
      return;
    }

    switch (event.type) {
      case 'FG2_MADE':
      case 'FG3_MADE': {
        const points = event.type === 'FG3_MADE' ? 3 : 2;
        add('POINTS_ALLOWED', (rng) => {
          const code = pickCode(rng, points === 3 ? THREE_ALLOWED_CODES : TWO_ALLOWED_CODES);
          return {
            chart: { category: 'POINTS_ALLOWED', code, points },
            playerId: TEAM_ALLOWED_CODES.has(code) ? undefined : rng.pick(onCourt),
          };
        });
        break;
      }
      case 'FT_MADE':
      case 'FT_MISS': {
        // Charted once, on the last free throw of the trip, with exactly the points made.
        if (isRivalFt(events[index + 1])) break;
        let start = index;
        while (isRivalFt(events[start - 1])) start--;
        const made = events.slice(start, index + 1).filter((e) => e.type === 'FT_MADE').length;
        if (made === 0) break;
        const points = Math.min(made, 3) as 1 | 2 | 3;
        const fouler = events[start - 1]?.isOwnTeam ? events[start - 1].playerId : undefined;
        add('POINTS_ALLOWED', () => ({
          chart: { category: 'POINTS_ALLOWED', code: 'UNNECESSARY_FOUL', points },
          playerId: fouler,
        }));
        break;
      }
      case 'FG2_MISS':
      case 'FG3_MISS':
        add('DEFENSE', (rng) => ({
          chart: { category: 'DEFENSE', code: pickCode(rng, RIVAL_MISS_CODES) },
          playerId: rng.pick(onCourt),
        }));
        break;
      case 'OREB':
        add('DEFENSE', (rng) => ({
          chart: { category: 'DEFENSE', code: 'SECOND_CHANCE' },
          playerId: rng.chance(0.7) ? rng.pick(onCourt) : undefined,
        }));
        break;
      case 'TOV':
        add('DEFENSE', (rng) => ({ chart: { category: 'DEFENSE', code: 'PRESSURE' }, playerId: rng.pick(onCourt) }));
        break;
    }
  });
  return anchors;
}

/**
 * Picks 6-14 chart entries per full period (fewer for a period in progress),
 * covering every category, and inserts each right after the play it explains
 * with the same clock and score, like an entry recorded live from the console.
 */
function withChartEntries(events: PlayByPlayEvent[], plan: MatchPlan): PlayByPlayEvent[] {
  const rng = createRandom(plan.seed ^ CHART_SEED_SALT);
  const anchors = chartAnchors(events, plan.starterIds);
  const selected = new Map<number, ChartAnchor>();

  for (const period of plan.periods) {
    const length = getQuarterLengthSeconds(period.quarter);
    const share = (length - (period.endClock ?? 0)) / length;
    const pool = rng.shuffle(anchors.filter((a) => events[a.index].quarter === period.quarter));
    const target = Math.min(pool.length, Math.max(1, Math.round(rng.int(6, 14) * share)));
    const picked = new Set<ChartAnchor>();
    for (const category of CHART_CATEGORIES) {
      const first = pool.find((a) => a.category === category);
      if (first && picked.size < target) picked.add(first);
    }
    for (const anchor of pool) {
      if (picked.size >= target) break;
      picked.add(anchor);
    }
    picked.forEach((anchor) => selected.set(anchor.index, anchor));
  }

  const result: PlayByPlayEvent[] = [];
  let chartCount = 0;
  events.forEach((event, index) => {
    result.push(event);
    const anchor = selected.get(index);
    if (!anchor) return;
    const { chart, playerId } = anchor.build(rng);
    chartCount += 1;
    result.push({
      id: `${plan.matchId}-ch-${String(chartCount).padStart(3, '0')}`,
      matchId: plan.matchId,
      quarter: event.quarter,
      quarterTimeRemainingSeconds: event.quarterTimeRemainingSeconds,
      gameClockFormatted: event.gameClockFormatted,
      teamId: plan.ownTeamId,
      isOwnTeam: true,
      playerId,
      type: 'CHART',
      chart,
      scoreAtEvent: event.scoreAtEvent,
      timestamp: event.timestamp,
    });
  });
  return result;
}
