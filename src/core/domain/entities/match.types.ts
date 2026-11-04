import { z } from 'zod';
import { ChartEntrySchema } from './chart.types';

/**
 * =============================================================================
 * HOOP - MATCH & PLAY-BY-PLAY EVENT DOMAIN TYPES & ZOD SCHEMAS
 * =============================================================================
 */

// -----------------------------------------------------------------------------
// MATCH STATUS & QUARTER ENUMS
// -----------------------------------------------------------------------------

export const MatchStatusSchema = z.enum([
  'SCHEDULED', // Programado
  'LIVE',      // En Juego
  'HALFTIME',  // Entretiempo (descanso tras Q2)
  'FINISHED',  // Finalizado
]);
export type MatchStatus = z.infer<typeof MatchStatusSchema>;

export const QuarterSchema = z.enum([
  'Q1',
  'Q2',
  'Q3',
  'Q4',
  'OT1',
  'OT2',
  'OT3',
  'OT4',
]);
export type Quarter = z.infer<typeof QuarterSchema>;

export const MatchConditionSchema = z.enum(['HOME', 'AWAY']);
export type MatchCondition = z.infer<typeof MatchConditionSchema>;

// -----------------------------------------------------------------------------
// PLAY-BY-PLAY ATOMIC EVENT TYPES
// -----------------------------------------------------------------------------

export const PlayByPlayEventTypeSchema = z.enum([
  'FT_MADE',             // Tiro Libre Convertido (+1 punto)
  'FT_MISS',             // Tiro Libre Fallado
  'FG2_MADE',            // Tiro de Campo 2 Puntos Convertido (+2 puntos)
  'FG2_MISS',            // Tiro de Campo 2 Puntos Fallado
  'FG3_MADE',            // Triple Convertido (+3 puntos)
  'FG3_MISS',            // Triple Fallado
  'OREB',                // Rebote Ofensivo
  'DREB',                // Rebote Defensivo
  'AST',                 // Asistencia
  'STL',                 // Robo / Recupero
  'BLK',                 // Tapón / Bloqueo
  'TOV',                 // Pérdida de Balón
  'FOUL_PERSONAL',       // Falta Personal
  'FOUL_TECHNICAL',      // Falta Técnica
  'FOUL_UNSPORTSMANLIKE',// Falta Antideportiva
  'CHART',               // Entrada de la planilla táctica (no cambia estadísticas)
]);
export type PlayByPlayEventType = z.infer<typeof PlayByPlayEventTypeSchema>;

// -----------------------------------------------------------------------------
// EVENT DEFINITIONS & SCHEMAS
// -----------------------------------------------------------------------------

export const ScoreSnapshotSchema = z.object({
  home: z.number().int().min(0),
  away: z.number().int().min(0),
});
export type ScoreSnapshot = z.infer<typeof ScoreSnapshotSchema>;

export const PlayByPlayEventSchema = z.object({
  id: z.string().min(1, 'Event ID is required'),
  matchId: z.string().min(1, 'Match ID is required'),
  quarter: QuarterSchema,
  /**
   * Remaining seconds on the game clock for this quarter.
   * Standard FIBA quarter is 10 minutes (600 seconds down to 0). Overtime is 5 minutes (300s).
   */
  quarterTimeRemainingSeconds: z
    .number()
    .min(0, 'Seconds cannot be negative')
    .max(600, 'Max quarter length is 600 seconds'),
  /**
   * Human readable game clock string, e.g., "07:42".
   */
  gameClockFormatted: z.string().optional(),
  teamId: z.string().min(1, 'Team ID is required'),
  isOwnTeam: z.boolean(),
  /**
   * Player ID involved in the action (optional for team-level turnovers or tech fouls).
   */
  playerId: z.string().optional(),
  /**
   * Assisted by Player ID (populated when a field goal is made with an assist).
   */
  assistedByPlayerId: z.string().optional(),
  type: PlayByPlayEventTypeSchema,
  /**
   * Tactical charting entry (only on CHART events).
   */
  chart: ChartEntrySchema.optional(),
  scoreAtEvent: ScoreSnapshotSchema,
  timestamp: z.string().datetime().or(z.date()),
});
export type PlayByPlayEvent = z.infer<typeof PlayByPlayEventSchema>;

// -----------------------------------------------------------------------------
// TIMEOUTS TRACKER (FIBA Rules)
// -----------------------------------------------------------------------------

export const TeamTimeoutsSchema = z.object({
  /**
   * First half timeouts remaining (Max 2 across Q1 and Q2).
   */
  firstHalfRemaining: z.number().int().min(0).max(2).default(2),
  /**
   * Second half timeouts remaining (Max 3 across Q3 and Q4; max 2 in last 2 mins of Q4).
   */
  secondHalfRemaining: z.number().int().min(0).max(3).default(3),
  /**
   * Overtime timeouts remaining for current OT (1 per OT period).
   */
  overtimeRemaining: z.number().int().min(0).max(1).default(1),
});
export type TeamTimeouts = z.infer<typeof TeamTimeoutsSchema>;

// -----------------------------------------------------------------------------
// OFFICIAL RESULT (S3)
// -----------------------------------------------------------------------------

const sumOf = (scores: readonly ScoreSnapshot[], side: keyof ScoreSnapshot) =>
  scores.reduce((total, score) => total + score[side], 0);

/**
 * Final score and points per period from the official match report, for matches
 * without play-by-play. `home`/`away` are the scoreboard sides; quarters are in
 * order (Q1-Q4, then overtimes) and, when present, add up to the final score.
 */
export const OfficialResultSchema = z
  .object({
    home: z.number().int().min(0),
    away: z.number().int().min(0),
    quarters: z.array(ScoreSnapshotSchema).max(QuarterSchema.options.length),
  })
  .refine(
    (result) =>
      result.quarters.length === 0 ||
      (sumOf(result.quarters, 'home') === result.home && sumOf(result.quarters, 'away') === result.away),
    { message: 'Official quarters must add up to the final score' }
  );
export type OfficialResult = z.infer<typeof OfficialResultSchema>;

// -----------------------------------------------------------------------------
// MATCH
// -----------------------------------------------------------------------------

export const MatchSchema = z.object({
  id: z.string().min(1, 'Match ID is required'),
  clubId: z.string().min(1, 'Club ID is required'),
  divisionId: z.string().min(1, 'Division ID is required'),
  ownTeamId: z.string().min(1, 'Own Team ID is required'),
  ownTeamName: z.string().min(1, 'Own Team Name is required'),
  rivalTeamName: z.string().min(1, 'Rival Team Name is required'),
  rivalLogoUrl: z.string().url().optional(),
  date: z.string().min(1, 'Match date is required'),
  condition: MatchConditionSchema, // HOME (Local) | AWAY (Visitante)
  tournament: z.string().min(1, 'Tournament name is required'),
  venue: z.string().optional(),
  status: MatchStatusSchema.default('SCHEDULED'),
  currentQuarter: QuarterSchema.default('Q1'),
  quarterTimeRemainingSeconds: z.number().int().min(0).max(600).default(600),
  homeScore: z.number().int().min(0).default(0),
  awayScore: z.number().int().min(0).default(0),
  homeFoulsQuarter: z.number().int().min(0).default(0),
  awayFoulsQuarter: z.number().int().min(0).default(0),
  homeTimeouts: TeamTimeoutsSchema.default({
    firstHalfRemaining: 2,
    secondHalfRemaining: 3,
    overtimeRemaining: 1,
  }),
  awayTimeouts: TeamTimeoutsSchema.default({
    firstHalfRemaining: 2,
    secondHalfRemaining: 3,
    overtimeRemaining: 1,
  }),
  /**
   * Starting five of the own team, chosen on the lineup page.
   */
  startingLineupOwn: z.array(z.string()).max(5).default([]),
  /**
   * Full match roster player IDs for own team.
   */
  rosterOwnPlayerIds: z.array(z.string()).default([]),
  /**
   * Official result of the match report; the scoreboard shows it while the
   * match has no scoring plays (S3).
   */
  officialResult: OfficialResultSchema.optional(),
  events: z.array(PlayByPlayEventSchema).default([]),
  createdAt: z.string().datetime().or(z.date()).optional(),
  updatedAt: z.string().datetime().or(z.date()).optional(),
});
export type Match = z.infer<typeof MatchSchema>;

