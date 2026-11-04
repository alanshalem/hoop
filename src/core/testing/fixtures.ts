import { chartCodeRecordId, type ChartCodeRecord } from '@/core/domain/entities/chart.types';
import type { Division, Player, Team } from '@/core/domain/entities/club.types';
import type { Coach } from '@/core/domain/entities/coach.types';
import type { Match, PlayByPlayEvent } from '@/core/domain/entities/match.types';
import type { RivalTeam } from '@/core/domain/entities/rival.types';

/**
 * Test fixtures shared by core tests. Not imported by production code.
 */

let eventCounter = 0;

export function makeEvent(overrides: Partial<PlayByPlayEvent> = {}): PlayByPlayEvent {
  eventCounter += 1;
  const isOwnTeam = overrides.isOwnTeam ?? true;
  return {
    id: `ev-test-${eventCounter}`,
    matchId: 'm-test',
    quarter: 'Q1',
    quarterTimeRemainingSeconds: 500,
    teamId: isOwnTeam ? 'team-own' : 'rival-team',
    isOwnTeam,
    type: 'FG2_MADE',
    scoreAtEvent: { home: 0, away: 0 },
    timestamp: '2026-10-01T20:00:00.000Z',
    ...overrides,
  };
}

/** A club override of a built-in code; pass `category` and `code` to target another one. */
export function makeChartCode(overrides: Partial<ChartCodeRecord> = {}): ChartCodeRecord {
  const clubId = overrides.clubId ?? 'club-test';
  const category = overrides.category ?? 'TURNOVER';
  const code = overrides.code ?? 'BAD_PASS';
  return {
    id: chartCodeRecordId(clubId, category, code),
    clubId,
    category,
    code,
    symbol: 'PM',
    label: 'Pase malo',
    tone: 'NEGATIVE',
    archived: false,
    order: 0,
    ...overrides,
  };
}

/** The roster of `makeMatch()`'s rival (same division and name): #5 and #11. */
export function makeRivalTeam(overrides: Partial<RivalTeam> = {}): RivalTeam {
  return {
    id: 'rival-test',
    clubId: 'club-test',
    divisionId: 'div-test',
    name: 'Rival Team',
    players: [
      { id: 'rp-1', dorsal: 5, firstName: 'Juan', lastName: 'Pérez' },
      { id: 'rp-2', dorsal: 11, firstName: 'Diego', lastName: 'García' },
    ],
    ...overrides,
  };
}

export function makeCoach(overrides: Partial<Coach> = {}): Coach {
  return {
    id: 'coach-test',
    clubId: 'club-test',
    name: 'PEREZ, J.',
    license: '123',
    role: 'HEAD',
    ...overrides,
  };
}

export function makeDivision(overrides: Partial<Division> = {}): Division {
  return {
    id: 'div-test',
    name: 'Primera Test',
    category: 'PRIMERA',
    gender: 'MALE',
    clubId: 'club-test',
    ...overrides,
  };
}

export function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'team-own',
    name: 'Own Team',
    divisionId: 'div-test',
    season: '2026',
    assistantCoachIds: [],
    playerIds: [],
    clubId: 'club-test',
    ...overrides,
  };
}

export function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    firstName: 'Test',
    lastName: 'Player',
    dorsal: 7,
    heightCm: 190,
    dominantHand: 'RIGHT',
    position: 'PG',
    status: 'ACTIVE',
    teamId: 'team-own',
    clubId: 'club-test',
    ...overrides,
  };
}

export function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm-test',
    clubId: 'club-test',
    divisionId: 'div-test',
    ownTeamId: 'team-own',
    ownTeamName: 'Own Team',
    rivalTeamName: 'Rival Team',
    date: '2026-10-01T20:00:00.000Z',
    condition: 'HOME',
    tournament: 'Test Cup',
    status: 'LIVE',
    currentQuarter: 'Q1',
    quarterTimeRemainingSeconds: 600,
    homeScore: 0,
    awayScore: 0,
    homeFoulsQuarter: 0,
    awayFoulsQuarter: 0,
    homeTimeouts: { firstHalfRemaining: 2, secondHalfRemaining: 3, overtimeRemaining: 1 },
    awayTimeouts: { firstHalfRemaining: 2, secondHalfRemaining: 3, overtimeRemaining: 1 },
    startingLineupOwn: ['p1', 'p2', 'p3', 'p4', 'p5'],
    activeLineupOwn: ['p1', 'p2', 'p3', 'p4', 'p5'],
    rosterOwnPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'],
    events: [],
    ...overrides,
  };
}
