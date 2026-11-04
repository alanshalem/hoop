import 'server-only';
import type { UserRole } from '@/core/domain/entities/club.types';
import { can, type Permission } from '@/core/domain/rules/permissions';
import type { SyncRecordKind } from '@/core/application/sync/record-kinds';

/**
 * =============================================================================
 * HOOP - SERVER-SIDE RBAC FOR SYNC WRITES
 * Maps each (entity kind, operation) to the domain permissions that allow it.
 * A write is allowed when the role holds ANY of the required permissions.
 * =============================================================================
 */

export type SyncEntityKind = SyncRecordKind | 'event';
export type WriteOperation = 'create' | 'update' | 'delete';

const ALL_OPERATIONS = (permissions: readonly Permission[]): Record<WriteOperation, readonly Permission[]> => ({
  create: permissions,
  update: permissions,
  delete: permissions,
});

const REQUIRED_PERMISSIONS: Record<SyncEntityKind, Record<WriteOperation, readonly Permission[]>> = {
  division: ALL_OPERATIONS(['MANAGE_DIVISIONS']),
  team: ALL_OPERATIONS(['MANAGE_DIVISIONS']),
  player: ALL_OPERATIONS(['MANAGE_PLAYERS']),
  match: {
    create: ['MANAGE_MATCHES'],
    // Lineups, the live console (clock, timeouts, status) and match edits all update the match record.
    update: ['MANAGE_MATCHES', 'MANAGE_LINEUP', 'RECORD_LIVE'],
    delete: ['MANAGE_MATCHES'],
  },
  // Chart codes are archived, never deleted: old charted entries keep rendering them (S9).
  chartCode: { create: ['MANAGE_CHART_CATALOG'], update: ['MANAGE_CHART_CATALOG'], delete: [] },
  // Rival rosters belong to match preparation (S14, L18).
  rivalTeam: ALL_OPERATIONS(['MANAGE_MATCHES']),
  // Coaches are the staff assigned to divisions (S5).
  coach: ALL_OPERATIONS(['MANAGE_DIVISIONS']),
  event: ALL_OPERATIONS(['RECORD_LIVE']),
};

export function requiredPermissions(kind: SyncEntityKind, operation: WriteOperation): readonly Permission[] {
  return REQUIRED_PERMISSIONS[kind][operation];
}

export function canWrite(role: UserRole, kind: SyncEntityKind, operation: WriteOperation): boolean {
  return requiredPermissions(kind, operation).some((permission) => can(role, permission));
}

export type WriteDecision = { allowed: true } | { allowed: false; status: 401 | 403 };

export function authorizeWrite(
  user: { role: UserRole } | null,
  kind: SyncEntityKind,
  operation: WriteOperation
): WriteDecision {
  if (!user) return { allowed: false, status: 401 };
  return canWrite(user.role, kind, operation) ? { allowed: true } : { allowed: false, status: 403 };
}
