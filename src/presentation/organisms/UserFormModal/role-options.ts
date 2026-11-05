import { UserRoleSchema, USER_ROLE_LABELS } from '@/core/domain/entities/club.types';
import type { SelectFieldOption } from '@/presentation/atoms/SelectField/SelectField';

/** The role choices of the user forms, in the domain order. */
export const USER_ROLE_OPTIONS: SelectFieldOption[] = UserRoleSchema.options.map((role) => ({
  value: role,
  label: USER_ROLE_LABELS[role],
}));
