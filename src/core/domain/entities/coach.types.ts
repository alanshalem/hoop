import { z } from 'zod';
import { LicenseSchema } from './club.types';

/**
 * =============================================================================
 * HOOP OS - COACHES (S5)
 * The club's coaching staff as records without login: divisions assign a head
 * coach and assistants from them (`Team.headCoachId`, `Team.assistantCoachIds`).
 * Synced as whole records (last-write-wins).
 * =============================================================================
 */

export const COACH_NAME_MIN_LENGTH = 2;
export const COACH_NAME_MAX_LENGTH = 60;

export const CoachRoleSchema = z.enum(['HEAD', 'ASSISTANT']);
export type CoachRole = z.infer<typeof CoachRoleSchema>;

export const COACH_ROLE_LABELS: Record<CoachRole, string> = {
  HEAD: 'Entrenador principal',
  ASSISTANT: 'Ayudante',
};

export const CoachNameSchema = z.string().trim().min(COACH_NAME_MIN_LENGTH).max(COACH_NAME_MAX_LENGTH);

export const CoachSchema = z.object({
  id: z.string().min(1, 'Coach ID is required'),
  clubId: z.string().min(1, 'Club ID is required'),
  name: CoachNameSchema,
  license: LicenseSchema.optional(),
  role: CoachRoleSchema,
});
export type Coach = z.infer<typeof CoachSchema>;
