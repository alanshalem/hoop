import { UserRoleSchema, type UserRole } from '@/core/domain/entities/club.types';
import { can, type Permission } from '@/core/domain/rules/permissions';

/**
 * Guided tour model (S12): pure, framework-free step logic shared by the
 * overlay, the tour store and the replay picker.
 */

export const WELCOME_TOUR_ID = 'welcome';

export const SCREEN_TOUR_IDS = [
  'dashboard',
  'divisions',
  'players',
  'matches',
  'lineup',
  'live',
  'stats',
  'help',
] as const;

export const TOUR_IDS = [WELCOME_TOUR_ID, ...SCREEN_TOUR_IDS] as const;

export type ScreenTourId = (typeof SCREEN_TOUR_IDS)[number];
export type TourId = (typeof TOUR_IDS)[number];

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'auto';

export interface TourStep {
  /** `data-tour` id of the highlighted element, or null for a centered intro/outro card. */
  target: string | null;
  title: string;
  body: string;
  /** Concrete usage example, shown as a highlighted note. */
  example?: string;
  placement?: TourPlacement;
  /** Only these roles see the step. Every role when omitted. */
  roles?: readonly UserRole[];
}

export interface TourDefinition {
  id: string;
  title: string;
  steps: TourStep[];
}

export interface TourProgress {
  /** 1-based. */
  current: number;
  total: number;
  isFirst: boolean;
  isLast: boolean;
}

export const isTourId = (value: string): value is TourId => (TOUR_IDS as readonly string[]).includes(value);

/** Roles that hold `permission`, so tour steps follow the domain RBAC matrix. */
export const rolesWith = (permission: Permission): UserRole[] =>
  UserRoleSchema.options.filter((role) => can(role, permission));

export const filterStepsByRole = (steps: readonly TourStep[], role: UserRole): TourStep[] =>
  steps.filter((step) => !step.roles || step.roles.includes(role));

/**
 * Steps the user will see: allowed for the role and whose target is on screen.
 * Missing targets are skipped so a tour never blocks; centered cards always stay.
 */
export const resolveTourSteps = (
  tour: TourDefinition,
  { role, isTargetPresent }: { role: UserRole; isTargetPresent: (target: string) => boolean }
): TourStep[] =>
  filterStepsByRole(tour.steps, role).filter((step) => step.target === null || isTargetPresent(step.target));

/** Next index, or null when `index` is the last step (the tour ends). */
export const nextStepIndex = (index: number, total: number): number | null => (index + 1 < total ? index + 1 : null);

/** Previous index, or null on the first step. */
export const previousStepIndex = (index: number): number | null => (index > 0 ? index - 1 : null);

export const tourProgress = (index: number, total: number): TourProgress => ({
  current: index + 1,
  total,
  isFirst: index === 0,
  isLast: index === total - 1,
});
