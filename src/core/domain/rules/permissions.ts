import type { UserRole } from '../entities/club.types';

/**
 * =============================================================================
 * HOOP OS - ROLE-BASED PERMISSIONS
 * =============================================================================
 */

export type Permission =
  | 'MANAGE_DIVISIONS'
  | 'MANAGE_PLAYERS'
  | 'MANAGE_MATCHES'
  | 'MANAGE_LINEUP'
  | 'RECORD_LIVE'
  /** Edit the club's charting codes (S9). */
  | 'MANAGE_CHART_CATALOG';

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  ADMIN: [
    'MANAGE_DIVISIONS',
    'MANAGE_PLAYERS',
    'MANAGE_MATCHES',
    'MANAGE_LINEUP',
    'RECORD_LIVE',
    'MANAGE_CHART_CATALOG',
  ],
  HEAD_COACH: ['MANAGE_PLAYERS', 'MANAGE_MATCHES', 'MANAGE_LINEUP', 'RECORD_LIVE', 'MANAGE_CHART_CATALOG'],
  ASSISTANT_STATISTICIAN: ['RECORD_LIVE'],
};

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
