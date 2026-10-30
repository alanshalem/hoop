import type { Player } from '../entities/club.types';
import type { Match } from '../entities/match.types';
import { calculatePercentage, PlayerBoxScore } from './basketball-rules';
import { isFieldGoalAttempt, isFieldGoalMade, isThreePointAttempt } from './event-rules';
import { calculateMatchBoxScore, getOwnRivalScore } from './match-derivations';

/**
 * =============================================================================
 * HOOP OS - SEASON ANALYTICS
 * Aggregates over the FINISHED matches of a team.
 * =============================================================================
 */

export interface SeasonSummary {
  played: number;
  wins: number;
  losses: number;
  /** 0-100, one decimal. */
  winPct: number;
  pointsForAvg: number;
  pointsAgainstAvg: number;
  diffAvg: number;
  fgPct: number;
  fg3Pct: number;
}

export interface SeasonLeader {
  player: Player;
  /** Per-game average, one decimal. */
  value: number;
  gamesPlayed: number;
}

export interface SeasonLeaders {
  points: SeasonLeader | null;
  rebounds: SeasonLeader | null;
  assists: SeasonLeader | null;
  pir: SeasonLeader | null;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(total: number, count: number): number {
  return count > 0 ? roundOne(total / count) : 0;
}

export function getFinishedTeamMatches(matches: Match[], teamId: string): Match[] {
  return matches.filter((m) => m.status === 'FINISHED' && m.ownTeamId === teamId);
}

export function calculateSeasonSummary(matches: Match[], teamId: string): SeasonSummary {
  const finished = getFinishedTeamMatches(matches, teamId);
  let wins = 0;
  let pointsFor = 0;
  let pointsAgainst = 0;
  let fgMade = 0;
  let fgAttempted = 0;
  let fg3Made = 0;
  let fg3Attempted = 0;

  for (const match of finished) {
    const { own, rival } = getOwnRivalScore(match);
    pointsFor += own;
    pointsAgainst += rival;
    if (own > rival) wins += 1;

    for (const event of match.events) {
      if (!event.isOwnTeam || !isFieldGoalAttempt(event.type)) continue;
      const made = isFieldGoalMade(event.type);
      fgAttempted += 1;
      if (made) fgMade += 1;
      if (isThreePointAttempt(event.type)) {
        fg3Attempted += 1;
        if (made) fg3Made += 1;
      }
    }
  }

  const played = finished.length;
  return {
    played,
    wins,
    losses: played - wins,
    winPct: calculatePercentage(wins, played),
    pointsForAvg: average(pointsFor, played),
    pointsAgainstAvg: average(pointsAgainst, played),
    diffAvg: average(pointsFor - pointsAgainst, played),
    fgPct: calculatePercentage(fgMade, fgAttempted),
    fg3Pct: calculatePercentage(fg3Made, fg3Attempted),
  };
}

interface PlayerTotals {
  games: number;
  points: number;
  rebounds: number;
  assists: number;
  pir: number;
}

type LeaderStat = keyof Omit<PlayerTotals, 'games'>;

/**
 * Per-game leaders. A player counts a game when listed in the match roster.
 */
export function calculateSeasonLeaders(
  matches: Match[],
  players: Player[],
  teamId: string
): SeasonLeaders {
  const totals = new Map<string, PlayerTotals>();

  for (const match of getFinishedTeamMatches(matches, teamId)) {
    const box = calculateMatchBoxScore(match);
    for (const playerId of match.rosterOwnPlayerIds) {
      const stats: PlayerBoxScore | undefined = box.players[playerId];
      if (!stats) continue;
      const current = totals.get(playerId) ?? { games: 0, points: 0, rebounds: 0, assists: 0, pir: 0 };
      totals.set(playerId, {
        games: current.games + 1,
        points: current.points + stats.points,
        rebounds: current.rebounds + stats.totalRebounds,
        assists: current.assists + stats.assists,
        pir: current.pir + stats.pir,
      });
    }
  }

  const findLeader = (stat: LeaderStat): SeasonLeader | null => {
    let leader: SeasonLeader | null = null;
    for (const player of players) {
      const t = totals.get(player.id);
      if (!t) continue;
      const value = average(t[stat], t.games);
      if (!leader || value > leader.value) {
        leader = { player, value, gamesPlayed: t.games };
      }
    }
    return leader;
  };

  return {
    points: findLeader('points'),
    rebounds: findLeader('rebounds'),
    assists: findLeader('assists'),
    pir: findLeader('pir'),
  };
}
