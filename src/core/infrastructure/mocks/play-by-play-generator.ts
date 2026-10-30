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
 * scores. Shots carry coordinates in the shot-chart geometry.
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

  return { events, activeLineup: lineup };
}
