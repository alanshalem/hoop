import type { Player } from '../entities/club.types';
import type { Match } from '../entities/match.types';
import { calculatePercentage, PlayerBoxScore } from './basketball-rules';
import { calculateMatchBoxScore, getOwnRivalScore } from './match-derivations';

/**
 * =============================================================================
 * HOOP - SEASON ANALYTICS
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
}

export interface SeasonLeader {
  player: Player;
  /** Per-game average, one decimal. */
  value: number;
  gamesPlayed: number;
}

/** Only points: the sheet records scoring plays, nothing else per player. */
export interface SeasonLeaders {
  points: SeasonLeader | null;
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

  for (const match of finished) {
    const { own, rival } = getOwnRivalScore(match);
    pointsFor += own;
    pointsAgainst += rival;
    if (own > rival) wins += 1;
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
  };
}

interface PlayerTotals {
  games: number;
  points: number;
}

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
      const current = totals.get(playerId) ?? { games: 0, points: 0 };
      totals.set(playerId, { games: current.games + 1, points: current.points + stats.points });
    }
  }

  const findLeader = (): SeasonLeader | null => {
    let leader: SeasonLeader | null = null;
    for (const player of players) {
      const t = totals.get(player.id);
      if (!t) continue;
      const value = average(t.points, t.games);
      if (!leader || value > leader.value) {
        leader = { player, value, gamesPlayed: t.games };
      }
    }
    return leader;
  };

  return { points: findLeader() };
}
