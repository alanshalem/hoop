import { Division, Player, Team, User } from '@/core/domain/entities/club.types';
import { Match } from '@/core/domain/entities/match.types';
import type { RivalPlayer, RivalTeam } from '@/core/domain/entities/rival.types';
import { createMatch } from '@/core/application/use-cases/match-use-cases';
import { withDerivedScoreboard } from '@/core/domain/rules/match-derivations';
import { CLUB_PROFILE } from '@/core/domain/club-profile';
import { generatePlayByPlay, PeriodPlan } from './play-by-play-generator';

/**
 * =============================================================================
 * HOOP - SEED DATA
 * Deterministic mock club. Match dates are relative to `now` so the dashboard
 * always shows a live match today, recent results and an upcoming fixture.
 * =============================================================================
 */

export const SEED_CLUB_ID = CLUB_PROFILE.id;

export const SEED_LIVE_MATCH_ID = 'match-live-today';
export const SEED_ACTIVE_DIVISION_ID = 'div-primera';

const SEED_CREATED_AT = '2025-08-01T12:00:00.000Z';

function seedUser(id: string, name: string, email: string, role: User['role']): User {
  return {
    id,
    name,
    email,
    role,
    clubId: SEED_CLUB_ID,
    createdAt: SEED_CREATED_AT,
    updatedAt: SEED_CREATED_AT,
  };
}

export const SEED_USERS: User[] = [
  seedUser('user-coach-1', 'Federico Balbi', 'fbalbi@camg.com.ar', 'HEAD_COACH'),
  seedUser('user-assistant-1', 'Mariano Ginóbili', 'mginobili@camg.com.ar', 'ASSISTANT_STATISTICIAN'),
  seedUser('user-admin-1', 'Alejandro Montecchia', 'admin@camg.com.ar', 'ADMIN'),
  seedUser('user-coach-2', 'Sergio Hernández', 'shernandez@camg.com.ar', 'HEAD_COACH'),
  seedUser('user-coach-3', 'Julio Lamas', 'jlamas@camg.com.ar', 'HEAD_COACH'),
];

export const SEED_DIVISIONS: Division[] = [
  {
    id: 'div-primera',
    name: 'Primera División',
    category: 'PRIMERA',
    gender: 'MALE',
    clubId: SEED_CLUB_ID,
    description: 'Plantel Superior - Torneo Federal de Básquet',
  },
  {
    id: 'div-u19',
    name: 'Sub-19 (U19)',
    category: 'U19',
    gender: 'MALE',
    clubId: SEED_CLUB_ID,
    description: 'Juveniles - Liga Formativa U19',
  },
  {
    id: 'div-u17',
    name: 'Sub-17 (U17)',
    category: 'U17',
    gender: 'MALE',
    clubId: SEED_CLUB_ID,
    description: 'Cadetes - Liga Formativa U17',
  },
];

export const SEED_PLAYERS: Player[] = [
  // PRIMERA DIVISIÓN (12 JUGADORES COMPLETOS)
  {
    id: 'p-1',
    firstName: 'Facundo',
    lastName: 'Campagna',
    dorsal: 7,
    heightCm: 182,
    weightKg: 84,
    dominantHand: 'RIGHT',
    position: 'PG',
    status: 'ACTIVE',
    teamId: 'team-primera',
    clubId: SEED_CLUB_ID,
  },
  {
    id: 'p-2',
    firstName: 'Nicolás',
    lastName: 'Laprovíttola',
    dorsal: 10,
    heightCm: 191,
    weightKg: 87,
    dominantHand: 'RIGHT',
    position: 'PG',
    status: 'ACTIVE',
    teamId: 'team-primera',
    clubId: SEED_CLUB_ID,
  },
  {
    id: 'p-3',
    firstName: 'Carlos',
    lastName: 'Delfino',
    dorsal: 9,
    heightCm: 198,
    weightKg: 98,
    dominantHand: 'RIGHT',
    position: 'SG',
    status: 'ACTIVE',
    teamId: 'team-primera',
    clubId: SEED_CLUB_ID,
  },
  {
    id: 'p-4',
    firstName: 'Leandro',
    lastName: 'Bolmaro',
    dorsal: 23,
    heightCm: 198,
    weightKg: 91,
    dominantHand: 'RIGHT',
    position: 'SG',
    status: 'ACTIVE',
    teamId: 'team-primera',
    clubId: SEED_CLUB_ID,
  },
  {
    id: 'p-5',
    firstName: 'Marcos',
    lastName: 'Mata',
    dorsal: 8,
    heightCm: 201,
    weightKg: 100,
    dominantHand: 'RIGHT',
    position: 'SF',
    status: 'ACTIVE',
    teamId: 'team-primera',
    clubId: SEED_CLUB_ID,
  },
  {
    id: 'p-6',
    firstName: 'Patricio',
    lastName: 'Garino',
    dorsal: 29,
    heightCm: 198,
    weightKg: 94,
    dominantHand: 'RIGHT',
    position: 'SF',
    status: 'ACTIVE',
    teamId: 'team-primera',
    clubId: SEED_CLUB_ID,
  },
  {
    id: 'p-7',
    firstName: 'Gabriel',
    lastName: 'Deck',
    dorsal: 14,
    heightCm: 198,
    weightKg: 105,
    dominantHand: 'RIGHT',
    position: 'PF',
    status: 'ACTIVE',
    teamId: 'team-primera',
    clubId: SEED_CLUB_ID,
  },
  {
    id: 'p-8',
    firstName: 'Luis',
    lastName: 'Scola',
    dorsal: 4,
    heightCm: 206,
    weightKg: 110,
    dominantHand: 'RIGHT',
    position: 'PF',
    status: 'ACTIVE',
    teamId: 'team-primera',
    clubId: SEED_CLUB_ID,
  },
  {
    id: 'p-9',
    firstName: 'Marcos',
    lastName: 'Delía',
    dorsal: 12,
    heightCm: 209,
    weightKg: 112,
    dominantHand: 'RIGHT',
    position: 'C',
    status: 'ACTIVE',
    teamId: 'team-primera',
    clubId: SEED_CLUB_ID,
  },
  {
    id: 'p-10',
    firstName: 'Tayavek',
    lastName: 'Gallizzi',
    dorsal: 83,
    heightCm: 206,
    weightKg: 108,
    dominantHand: 'RIGHT',
    position: 'C',
    status: 'ACTIVE',
    teamId: 'team-primera',
    clubId: SEED_CLUB_ID,
  },
  {
    id: 'p-11',
    firstName: 'Lucas',
    lastName: 'Faggiano',
    dorsal: 3,
    heightCm: 188,
    weightKg: 85,
    dominantHand: 'RIGHT',
    position: 'PG',
    status: 'ACTIVE',
    teamId: 'team-primera',
    clubId: SEED_CLUB_ID,
  },
  {
    id: 'p-12',
    firstName: 'Agustín',
    lastName: 'Cáffaro',
    dorsal: 22,
    heightCm: 208,
    weightKg: 104,
    dominantHand: 'LEFT',
    position: 'C',
    status: 'INJURED',
    medicalNote: 'Esguince de tobillo derecho (grado II). Alta estimada en 2 semanas.',
    teamId: 'team-primera',
    clubId: SEED_CLUB_ID,
  },

  // SUB-19 JUVENILES (Disponibles para convocar al primer equipo)
  {
    id: 'p-u19-1',
    firstName: 'Juan Ignacio',
    lastName: 'Marcos',
    dorsal: 15,
    heightCm: 188,
    weightKg: 82,
    dominantHand: 'RIGHT',
    position: 'PG',
    status: 'ACTIVE',
    teamId: 'team-u19',
    clubId: SEED_CLUB_ID,
  },
  {
    id: 'p-u19-2',
    firstName: 'Bautista',
    lastName: 'Lugarini',
    dorsal: 11,
    heightCm: 203,
    weightKg: 95,
    dominantHand: 'RIGHT',
    position: 'SF',
    status: 'ACTIVE',
    teamId: 'team-u19',
    clubId: SEED_CLUB_ID,
  },
  {
    id: 'p-u19-3',
    firstName: 'Gonzalo',
    lastName: 'Bressan',
    dorsal: 33,
    heightCm: 207,
    weightKg: 105,
    dominantHand: 'RIGHT',
    position: 'C',
    status: 'ACTIVE',
    teamId: 'team-u19',
    clubId: SEED_CLUB_ID,
  },

  // SUB-17 CADETES
  {
    id: 'p-u17-1',
    firstName: 'Felipe',
    lastName: 'Minzer',
    dorsal: 6,
    heightCm: 195,
    weightKg: 88,
    dominantHand: 'RIGHT',
    position: 'SG',
    status: 'ACTIVE',
    teamId: 'team-u17',
    clubId: SEED_CLUB_ID,
  },
  {
    id: 'p-u17-2',
    firstName: 'Tomás',
    lastName: 'Fernández',
    dorsal: 5,
    heightCm: 184,
    weightKg: 76,
    dominantHand: 'LEFT',
    position: 'PG',
    status: 'ACTIVE',
    teamId: 'team-u17',
    clubId: SEED_CLUB_ID,
  },
];

export const SEED_TEAMS: Team[] = [
  {
    id: 'team-primera',
    name: `${CLUB_PROFILE.name} - Primera`,
    divisionId: 'div-primera',
    season: CLUB_PROFILE.season,
    headCoachId: 'user-coach-1',
    assistantCoachIds: ['user-assistant-1'],
    playerIds: [
      'p-1', 'p-2', 'p-3', 'p-4', 'p-5', 'p-6',
      'p-7', 'p-8', 'p-9', 'p-10', 'p-11', 'p-12',
    ],
    clubId: SEED_CLUB_ID,
  },
  {
    id: 'team-u19',
    name: `${CLUB_PROFILE.name} - U19`,
    divisionId: 'div-u19',
    season: CLUB_PROFILE.season,
    headCoachId: 'user-coach-2',
    assistantCoachIds: ['user-assistant-1'],
    playerIds: ['p-u19-1', 'p-u19-2', 'p-u19-3'],
    clubId: SEED_CLUB_ID,
  },
  {
    id: 'team-u17',
    name: `${CLUB_PROFILE.name} - U17`,
    divisionId: 'div-u17',
    season: CLUB_PROFILE.season,
    headCoachId: 'user-coach-3',
    assistantCoachIds: [],
    playerIds: ['p-u17-1', 'p-u17-2'],
    clubId: SEED_CLUB_ID,
  },
];

const PRIMERA_ROSTER = ['p-1', 'p-2', 'p-3', 'p-4', 'p-5', 'p-6', 'p-7', 'p-8', 'p-9', 'p-10', 'p-11'];

const PRIMERA_SCORING_WEIGHTS: Record<string, number> = {
  'p-1': 1.2,
  'p-2': 1.3,
  'p-3': 1.5,
  'p-7': 1.6,
  'p-8': 1.4,
  'p-9': 1.1,
};

const OWN_TEAM = {
  clubId: SEED_CLUB_ID,
  divisionId: 'div-primera',
  ownTeamId: 'team-primera',
  ownTeamName: CLUB_PROFILE.name,
};

function atDayOffset(now: Date, days: number, hourUtc: number, minuteUtc = 0): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, hourUtc, minuteUtc)
  );
}

function period(
  quarter: PeriodPlan['quarter'],
  own: number,
  rival: number,
  ownFouls: number,
  rivalFouls: number,
  endClock?: number
): PeriodPlan {
  return { quarter, own, rival, ownFouls, rivalFouls, endClock };
}

interface PlayedMatchSpec {
  id: string;
  seed: number;
  kickoff: Date;
  rivalTeamName: string;
  condition: Match['condition'];
  tournament: string;
  venue: string;
  status: 'LIVE' | 'FINISHED';
  starterIds: string[];
  periods: PeriodPlan[];
  homeTimeouts: Match['homeTimeouts'];
  awayTimeouts: Match['awayTimeouts'];
}

function buildPlayedMatch(spec: PlayedMatchSpec): Match {
  const events = generatePlayByPlay({
    matchId: spec.id,
    ownTeamId: OWN_TEAM.ownTeamId,
    condition: spec.condition,
    kickoff: spec.kickoff,
    seed: spec.seed,
    players: SEED_PLAYERS,
    starterIds: spec.starterIds,
    scoringWeights: PRIMERA_SCORING_WEIGHTS,
    periods: spec.periods,
  });
  const lastPeriod = spec.periods[spec.periods.length - 1];
  const base = createMatch(
    {
      ...OWN_TEAM,
      rivalTeamName: spec.rivalTeamName,
      date: spec.kickoff.toISOString(),
      condition: spec.condition,
      tournament: spec.tournament,
      venue: spec.venue,
    },
    { id: spec.id }
  );
  return withDerivedScoreboard({
    ...base,
    status: spec.status,
    currentQuarter: lastPeriod.quarter,
    quarterTimeRemainingSeconds: lastPeriod.endClock ?? 0,
    homeTimeouts: spec.homeTimeouts,
    awayTimeouts: spec.awayTimeouts,
    rosterOwnPlayerIds: PRIMERA_ROSTER,
    startingLineupOwn: spec.starterIds,
    events,
  });
}

export function createSeedMatches(now: Date): Match[] {
  return [
    buildPlayedMatch({
      id: 'match-past-3',
      seed: 3103,
      kickoff: atDayOffset(now, -20, 23),
      rivalTeamName: 'Peñarol de Mar del Plata',
      condition: 'HOME',
      tournament: 'Torneo Federal - Fecha 9',
      venue: 'Estadio CAMG',
      status: 'FINISHED',
      starterIds: ['p-1', 'p-3', 'p-6', 'p-7', 'p-10'],
      periods: [
        period('Q1', 24, 18, 3, 2),
        period('Q2', 20, 21, 4, 3),
        period('Q3', 19, 22, 2, 4),
        period('Q4', 25, 19, 3, 5),
      ],
      homeTimeouts: { firstHalfRemaining: 1, secondHalfRemaining: 1, overtimeRemaining: 1 },
      awayTimeouts: { firstHalfRemaining: 0, secondHalfRemaining: 0, overtimeRemaining: 1 },
    }),
    buildPlayedMatch({
      id: 'match-past-2',
      seed: 2207,
      kickoff: atDayOffset(now, -13, 0),
      rivalTeamName: 'Quimsa',
      condition: 'AWAY',
      tournament: 'Torneo Federal - Fecha 10',
      venue: 'Estadio Ciudad, Santiago del Estero',
      status: 'FINISHED',
      starterIds: ['p-2', 'p-4', 'p-5', 'p-8', 'p-9'],
      periods: [
        period('Q1', 18, 20, 3, 2),
        period('Q2', 17, 19, 4, 3),
        period('Q3', 20, 18, 3, 3),
        period('Q4', 16, 22, 5, 2),
      ],
      homeTimeouts: { firstHalfRemaining: 1, secondHalfRemaining: 2, overtimeRemaining: 1 },
      awayTimeouts: { firstHalfRemaining: 0, secondHalfRemaining: 0, overtimeRemaining: 1 },
    }),
    buildPlayedMatch({
      id: 'match-past-1',
      seed: 1024,
      kickoff: atDayOffset(now, -6, 23, 30),
      rivalTeamName: 'Ferro Carril Oeste',
      condition: 'HOME',
      tournament: 'Torneo Federal - Fecha 11',
      venue: 'Estadio CAMG',
      status: 'FINISHED',
      starterIds: ['p-1', 'p-3', 'p-5', 'p-7', 'p-9'],
      periods: [
        period('Q1', 22, 19, 2, 3),
        period('Q2', 14, 12, 4, 3),
        period('Q3', 26, 24, 3, 4),
        period('Q4', 22, 23, 3, 4),
      ],
      homeTimeouts: { firstHalfRemaining: 0, secondHalfRemaining: 1, overtimeRemaining: 1 },
      awayTimeouts: { firstHalfRemaining: 0, secondHalfRemaining: 0, overtimeRemaining: 1 },
    }),
    {
      ...buildPlayedMatch({
        id: SEED_LIVE_MATCH_ID,
        seed: 4242,
        // Tip-off 45 minutes ago so every event timestamp is in the past.
        kickoff: new Date(now.getTime() - 45 * 60 * 1000),
        rivalTeamName: 'Obras Sanitarias',
        condition: 'HOME',
        tournament: 'Torneo Federal - Fecha 12',
        venue: 'Estadio CAMG',
        status: 'LIVE',
        starterIds: ['p-1', 'p-4', 'p-5', 'p-7', 'p-9'],
        periods: [
          period('Q1', 26, 22, 3, 3),
          // 07:08 left in Q2 and the rival already in bonus (4 team fouls).
          period('Q2', 10, 9, 2, 4, 428),
        ],
        homeTimeouts: { firstHalfRemaining: 1, secondHalfRemaining: 3, overtimeRemaining: 1 },
        awayTimeouts: { firstHalfRemaining: 0, secondHalfRemaining: 3, overtimeRemaining: 1 },
      }),
      date: now.toISOString(),
    },
    createMatch(
      {
        ...OWN_TEAM,
        rivalTeamName: 'Boca Juniors',
        date: atDayOffset(now, 7, 0).toISOString(),
        condition: 'AWAY',
        tournament: 'Torneo Federal - Fecha 13',
        venue: 'Microestadio Luis Conde (La Bombonerita)',
        rosterOwnPlayerIds: PRIMERA_ROSTER,
      },
      { id: 'match-upcoming-1' }
    ),
  ];
}

type RivalPlayerRow = [dorsal: number, firstName: string, lastName: string];

/** Players get stable ids `<teamId>-p<n>` in roster order. */
function seedRivalTeam(id: string, name: string, rows: RivalPlayerRow[]): RivalTeam {
  const players: RivalPlayer[] = rows.map(([dorsal, firstName, lastName], index) => ({
    id: `${id}-p${index + 1}`,
    dorsal,
    firstName,
    lastName,
  }));
  return { id, clubId: SEED_CLUB_ID, divisionId: 'div-primera', name, players };
}

/** Rival rosters (S14): the live match rival, the rival of the last finished match and the next rival. */
export const SEED_RIVAL_TEAMS: RivalTeam[] = [
  seedRivalTeam('rival-obras', 'Obras Sanitarias', [
    [1, 'Martín', 'Aguirre'],
    [4, 'Tomás', 'Benítez'],
    [5, 'Federico', 'Cáceres'],
    [7, 'Lautaro', 'Domínguez'],
    [8, 'Ignacio', 'Ferraro'],
    [10, 'Matías', 'Giménez'],
    [11, 'Nahuel', 'Herrera'],
    [13, 'Joaquín', 'Ledesma'],
    [15, 'Emiliano', 'Medina'],
    [21, 'Gonzalo', 'Olivera'],
    [32, 'Franco', 'Peralta'],
    [44, 'Ramiro', 'Sosa'],
  ]),
  seedRivalTeam('rival-ferro', 'Ferro Carril Oeste', [
    [0, 'Bruno', 'Acosta'],
    [2, 'Iván', 'Castro'],
    [6, 'Leonel', 'Díaz'],
    [9, 'Facundo', 'Ríos'],
    [12, 'Agustín', 'Morales'],
    [14, 'Valentín', 'Ortiz'],
    [17, 'Nicolás', 'Paz'],
    [20, 'Santino', 'Quiroga'],
    [24, 'Mauro', 'Romero'],
    [33, 'Ezequiel', 'Vega'],
  ]),
  seedRivalTeam('rival-boca', 'Boca Juniors', [
    [3, 'Lucas', 'Fernández'],
    [5, 'Thiago', 'Suárez'],
    [6, 'Maximiliano', 'Rojas'],
    [7, 'Juan Cruz', 'Molina'],
    [9, 'Pablo', 'Navarro'],
    [11, 'Damián', 'Luna'],
    [14, 'Gabriel', 'Ponce'],
    [18, 'Cristian', 'Silva'],
    [22, 'Rodrigo', 'Torres'],
    [23, 'Alan', 'Vera'],
    [30, 'Kevin', 'Godoy'],
    [41, 'Esteban', 'Ruiz'],
  ]),
];

export interface SeedState {
  users: User[];
  divisions: Division[];
  teams: Team[];
  players: Player[];
  matches: Match[];
  rivalTeams: RivalTeam[];
}

export function createSeedState(now: Date = new Date()): SeedState {
  return {
    users: SEED_USERS,
    divisions: SEED_DIVISIONS,
    teams: SEED_TEAMS,
    players: SEED_PLAYERS,
    matches: createSeedMatches(now),
    rivalTeams: SEED_RIVAL_TEAMS,
  };
}
