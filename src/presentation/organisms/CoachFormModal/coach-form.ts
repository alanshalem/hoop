import { z } from 'zod';
import { LICENSE_MAX_LENGTH, type Division, type Team } from '@/core/domain/entities/club.types';
import {
  COACH_NAME_MAX_LENGTH,
  COACH_NAME_MIN_LENGTH,
  CoachRoleSchema,
  type Coach,
  type CoachRole,
} from '@/core/domain/entities/coach.types';
import type { CoachInput, CoachReason } from '@/core/application/use-cases/coach-use-cases';

const NAME_MESSAGE = `El nombre debe tener de ${COACH_NAME_MIN_LENGTH} a ${COACH_NAME_MAX_LENGTH} caracteres.`;
const LICENSE_MESSAGE = `La licencia puede tener hasta ${LICENSE_MAX_LENGTH} caracteres.`;

/** Same limits as the coach use-cases (S5), so the form refuses what the store would refuse. */
export const CoachFormSchema = z.object({
  name: z.string().trim().min(COACH_NAME_MIN_LENGTH, NAME_MESSAGE).max(COACH_NAME_MAX_LENGTH, NAME_MESSAGE),
  /** Empty string = no license. */
  license: z.string().trim().max(LICENSE_MAX_LENGTH, LICENSE_MESSAGE),
  role: z.enum(CoachRoleSchema.options, { message: 'Elige el rol del entrenador.' }),
});
export type CoachFormData = z.infer<typeof CoachFormSchema>;

export type CoachRefusal = CoachReason | 'COACH_NOT_FOUND';

export const COACH_RECORD_REFUSAL_MESSAGES: Record<CoachRefusal, string> = {
  INVALID_NAME: NAME_MESSAGE,
  INVALID_LICENSE: LICENSE_MESSAGE,
  COACH_NOT_FOUND: 'El entrenador ya no existe.',
};

/** Form field a refusal belongs to; null when it closes the form with a notice. */
export function coachRefusalField(reason: CoachRefusal): 'name' | 'license' | null {
  if (reason === 'INVALID_NAME') return 'name';
  if (reason === 'INVALID_LICENSE') return 'license';
  return null;
}

export const toCoachFormData = (coach: Coach | null | undefined): CoachFormData =>
  coach
    ? { name: coach.name, license: coach.license ?? '', role: coach.role }
    : { name: '', license: '', role: 'HEAD' };

/** The license goes as typed: the use-case stores a blank one as absent (and clears it on edit). */
export const toCoachInput = (data: CoachFormData): CoachInput => ({
  name: data.name,
  license: data.license,
  role: data.role,
});

export interface CoachAssignment {
  divisionId: string;
  divisionName: string;
  role: CoachRole;
}

/** Divisions where the coach leads or assists, by division name; teams of deleted divisions are skipped. */
export function coachAssignments(
  coachId: string,
  teams: readonly Team[],
  divisions: readonly Division[]
): CoachAssignment[] {
  return teams
    .flatMap((team): CoachAssignment[] => {
      const division = divisions.find((d) => d.id === team.divisionId);
      if (!division) return [];
      const role: CoachRole | null =
        team.headCoachId === coachId ? 'HEAD' : team.assistantCoachIds.includes(coachId) ? 'ASSISTANT' : null;
      return role ? [{ divisionId: division.id, divisionName: division.name, role }] : [];
    })
    .sort((a, b) => a.divisionName.localeCompare(b.divisionName, 'es'));
}

const ASSIGNMENT_ROLE_LABELS: Record<CoachRole, string> = {
  HEAD: 'principal',
  ASSISTANT: 'ayudante',
};

export function formatCoachAssignments(assignments: readonly CoachAssignment[]): string {
  if (assignments.length === 0) return 'Sin divisiones asignadas';
  return assignments
    .map((assignment) => `${assignment.divisionName} (${ASSIGNMENT_ROLE_LABELS[assignment.role]})`)
    .join(' · ');
}

/** Head coaches first, then alphabetical (accents ignored). */
export function sortCoaches(coaches: readonly Coach[]): Coach[] {
  return [...coaches].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'HEAD' ? -1 : 1;
    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  });
}

const joinNames = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`;

/** Delete confirmation: deleting a coach also unassigns it from every division (S5). */
export function deleteCoachMessage(coach: Pick<Coach, 'name'>, assignments: readonly CoachAssignment[]): string {
  const unassigned =
    assignments.length === 0
      ? 'No está asignado a ninguna división.'
      : `Se quitará del cuerpo técnico de ${joinNames(assignments.map((a) => a.divisionName))}.`;
  return `Se eliminará la ficha de ${coach.name}. ${unassigned}`;
}
