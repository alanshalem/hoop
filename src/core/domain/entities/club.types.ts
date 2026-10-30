import { z } from 'zod';

/**
 * =============================================================================
 * HOOP OS - CLUB & ROSTER DOMAIN TYPES & ZOD SCHEMAS
 * Clean Architecture - Domain Layer
 * =============================================================================
 */

// -----------------------------------------------------------------------------
// USER & ROLES
// -----------------------------------------------------------------------------

export const UserRoleSchema = z.enum([
  'ADMIN',
  'HEAD_COACH',
  'ASSISTANT_STATISTICIAN',
]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserSchema = z.object({
  id: z.string().min(1, 'User ID is required'),
  email: z.string().email('Invalid email address'),
  name: z.string().min(2, 'Name must have at least 2 characters'),
  role: UserRoleSchema,
  clubId: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  createdAt: z.string().datetime().or(z.date()),
  updatedAt: z.string().datetime().or(z.date()),
});
export type User = z.infer<typeof UserSchema>;

// -----------------------------------------------------------------------------
// DIVISION
// -----------------------------------------------------------------------------

export const DivisionCategorySchema = z.enum([
  'PRIMERA',
  'U21',
  'U19',
  'U17',
  'U15',
  'U13',
  'MINI',
  'FEMENINO',
  'CUSTOM',
]);
export type DivisionCategory = z.infer<typeof DivisionCategorySchema>;

export const GenderCategorySchema = z.enum(['MALE', 'FEMALE', 'MIXED']);
export type GenderCategory = z.infer<typeof GenderCategorySchema>;

export const DivisionSchema = z.object({
  id: z.string().min(1, 'Division ID is required'),
  name: z.string().min(2, 'Division name is required'), // e.g., "Primera División", "U19 Masculino"
  category: DivisionCategorySchema,
  gender: GenderCategorySchema.default('MALE'),
  clubId: z.string().min(1, 'Club ID is required'),
  description: z.string().optional(),
  createdAt: z.string().datetime().or(z.date()).optional(),
  updatedAt: z.string().datetime().or(z.date()).optional(),
});
export type Division = z.infer<typeof DivisionSchema>;

// -----------------------------------------------------------------------------
// TEAM
// -----------------------------------------------------------------------------

export const TeamSchema = z.object({
  id: z.string().min(1, 'Team ID is required'),
  name: z.string().min(2, 'Team name is required'),
  divisionId: z.string().min(1, 'Division ID is required'),
  season: z.string().min(4, 'Season identifier is required'), // e.g., "2025/2026"
  headCoachId: z.string().min(1, 'Head Coach ID is required'),
  assistantCoachIds: z.array(z.string()).default([]),
  playerIds: z.array(z.string()).default([]),
  clubId: z.string().min(1, 'Club ID is required'),
  badgeUrl: z.string().url().optional(),
  createdAt: z.string().datetime().or(z.date()).optional(),
  updatedAt: z.string().datetime().or(z.date()).optional(),
});
export type Team = z.infer<typeof TeamSchema>;

// -----------------------------------------------------------------------------
// PLAYER
// -----------------------------------------------------------------------------

export const BasketballPositionSchema = z.enum([
  'PG', // Point Guard / Base
  'SG', // Shooting Guard / Escolta
  'SF', // Small Forward / Alero
  'PF', // Power Forward / Ala-Pívot
  'C',  // Center / Pívot
]);
export type BasketballPosition = z.infer<typeof BasketballPositionSchema>;

export const PlayerPhysicalStatusSchema = z.enum([
  'ACTIVE',
  'INJURED',
  'SUSPENDED',
]);
export type PlayerPhysicalStatus = z.infer<typeof PlayerPhysicalStatusSchema>;

export const DominantHandSchema = z.enum(['RIGHT', 'LEFT', 'AMBIDEXTROUS']);
export type DominantHand = z.infer<typeof DominantHandSchema>;

export const PlayerSchema = z.object({
  id: z.string().min(1, 'Player ID is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  dorsal: z
    .number()
    .int('Dorsal must be an integer')
    .min(0, 'Dorsal must be between 0 and 99')
    .max(99, 'Dorsal must be between 0 and 99'),
  heightCm: z
    .number()
    .int('Height must be an integer in cm')
    .positive('Height must be positive')
    .min(120, 'Minimum height is 120 cm')
    .max(240, 'Maximum height is 240 cm'),
  weightKg: z
    .number()
    .positive('Weight must be positive')
    .optional(),
  dominantHand: DominantHandSchema.default('RIGHT'),
  position: BasketballPositionSchema,
  status: PlayerPhysicalStatusSchema.default('ACTIVE'),
  birthDate: z.string().optional(),
  teamId: z.string().optional(),
  clubId: z.string().min(1, 'Club ID is required'),
  photoUrl: z.string().url().optional(),
  createdAt: z.string().datetime().or(z.date()).optional(),
  updatedAt: z.string().datetime().or(z.date()).optional(),
});
export type Player = z.infer<typeof PlayerSchema>;

/**
 * Human-readable position names in Spanish for courtside UI.
 */
export const BASKETBALL_POSITION_LABELS: Record<
  BasketballPosition,
  { short: string; full: string; number: number }
> = {
  PG: { short: 'Base', full: 'Point Guard / Base', number: 1 },
  SG: { short: 'Escolta', full: 'Shooting Guard / Escolta', number: 2 },
  SF: { short: 'Alero', full: 'Small Forward / Alero', number: 3 },
  PF: { short: 'Ala-Pívot', full: 'Power Forward / Ala-Pívot', number: 4 },
  C: { short: 'Pívot', full: 'Center / Pívot', number: 5 },
};

/**
 * Status labels in Spanish for display.
 */
export const PLAYER_STATUS_LABELS: Record<PlayerPhysicalStatus, string> = {
  ACTIVE: 'Disponible',
  INJURED: 'Lesionado',
  SUSPENDED: 'Suspendido',
};

