import type { Coach } from '@/core/domain/entities/coach.types';

export interface DivisionStaffValues {
  headCoachId: string | undefined;
  assistantCoachIds: string[];
}

/** Form values as coach ids (S5): empty head coach is none; the head coach is never an assistant too. */
export function toDivisionStaff(headCoachId: string, assistantCoachIds: readonly string[]): DivisionStaffValues {
  const head = headCoachId || undefined;
  return { headCoachId: head, assistantCoachIds: assistantCoachIds.filter((id) => id !== head) };
}

/** Names of the coaches with these ids, in order; ids that are not coaches are skipped. */
export function coachNames(ids: readonly string[], coaches: readonly Coach[]): string[] {
  return ids.flatMap((id) => coaches.find((coach) => coach.id === id)?.name ?? []);
}

export const COACH_REFUSAL_MESSAGES: Record<'COACH_NOT_FOUND' | 'TEAM_NOT_FOUND', string> = {
  COACH_NOT_FOUND: 'El entrenador elegido ya no existe.',
  TEAM_NOT_FOUND: 'La división no tiene un equipo asociado.',
};
