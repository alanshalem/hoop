import type { Team } from '@/core/domain/entities/club.types';
import { LicenseSchema } from '@/core/domain/entities/club.types';
import { CoachNameSchema, type Coach, type CoachRole } from '@/core/domain/entities/coach.types';

/**
 * =============================================================================
 * HOOP OS - COACH USE-CASES (S5)
 * Pure functions over the club's coaches: coaches in, new coaches (or a typed
 * refusal) out. Untouched coaches and teams keep their reference so the sync
 * diff only sends what changed.
 * =============================================================================
 */

export type CoachReason = 'INVALID_NAME' | 'INVALID_LICENSE';

export interface CoachInput {
  name: string;
  /** Empty or blank means no license. */
  license?: string;
  role: CoachRole;
}

export type CoachResult<Reason extends string> =
  | { ok: true; coaches: Coach[] }
  | { ok: false; reason: Reason };

export type CreateCoachResult =
  | { ok: true; coaches: Coach[]; id: string }
  | { ok: false; reason: CoachReason };

export interface CoachTeams {
  coaches: Coach[];
  teams: Team[];
}

export type DeleteCoachResult =
  | ({ ok: true } & CoachTeams)
  | { ok: false; reason: 'COACH_NOT_FOUND' };

type FieldsResult = { ok: true; value: Partial<CoachInput> } | { ok: false; reason: CoachReason };

/** Trims name and license; absent fields are not checked, a blank license clears it. */
function validateFields(fields: Partial<CoachInput>): FieldsResult {
  const value: Partial<CoachInput> = { ...fields };
  if (fields.name !== undefined) {
    const name = CoachNameSchema.safeParse(fields.name);
    if (!name.success) return { ok: false, reason: 'INVALID_NAME' };
    value.name = name.data;
  }
  if ('license' in fields) {
    const trimmed = fields.license?.trim() ?? '';
    const license = LicenseSchema.safeParse(trimmed);
    if (trimmed !== '' && !license.success) return { ok: false, reason: 'INVALID_LICENSE' };
    value.license = trimmed === '' ? undefined : license.data;
  }
  return { ok: true, value };
}

/** A coach without an empty `license` key, so stored records omit it. */
function toCoach(coach: Coach): Coach {
  const { license, ...rest } = coach;
  return license === undefined ? rest : { ...rest, license };
}

export function createCoach(
  coaches: readonly Coach[],
  input: CoachInput,
  ctx: { id: string; clubId: string }
): CreateCoachResult {
  const checked = validateFields(input);
  if (!checked.ok) return checked;
  const { name, license, role } = checked.value as CoachInput;
  const coach = toCoach({ id: ctx.id, clubId: ctx.clubId, name, license, role });
  return { ok: true, coaches: [...coaches, coach], id: ctx.id };
}

/** Edits name, license or role of a coach. */
export function updateCoach(
  coaches: readonly Coach[],
  coachId: string,
  updates: Partial<CoachInput>
): CoachResult<CoachReason | 'COACH_NOT_FOUND'> {
  const index = coaches.findIndex((coach) => coach.id === coachId);
  if (index === -1) return { ok: false, reason: 'COACH_NOT_FOUND' };
  const checked = validateFields(updates);
  if (!checked.ok) return checked;
  const updated = toCoach({ ...coaches[index], ...checked.value });
  return { ok: true, coaches: coaches.map((coach, i) => (i === index ? updated : coach)) };
}

/** Removes a coach and unassigns it from every team (head coach and assistants). */
export function deleteCoach(data: CoachTeams, coachId: string): DeleteCoachResult {
  if (!data.coaches.some((coach) => coach.id === coachId)) return { ok: false, reason: 'COACH_NOT_FOUND' };
  const teams = data.teams.map((team) => {
    const isHead = team.headCoachId === coachId;
    const isAssistant = team.assistantCoachIds.includes(coachId);
    if (!isHead && !isAssistant) return team;
    const next: Team = { ...team, assistantCoachIds: team.assistantCoachIds.filter((id) => id !== coachId) };
    if (isHead) delete next.headCoachId;
    return next;
  });
  return { ok: true, coaches: data.coaches.filter((coach) => coach.id !== coachId), teams };
}
