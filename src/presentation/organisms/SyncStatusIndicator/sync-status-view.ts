import type { SyncStatus } from '@/core/application/sync/sync-types';

/** What the shell shows about sync (S10.8). */
export type SyncViewState = 'synced' | 'syncing' | 'offline' | 'error';

export interface SyncStatusInput {
  status: SyncStatus;
  pending: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface SyncStatusView {
  state: SyncViewState;
  label: string;
  detail: string;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function formatTimeAgo(iso: string, nowMs: number): string {
  const elapsed = Math.max(0, nowMs - Date.parse(iso));
  if (elapsed < MINUTE_MS) return 'hace instantes';
  if (elapsed < HOUR_MS) return `hace ${Math.floor(elapsed / MINUTE_MS)} min`;
  if (elapsed < DAY_MS) return `hace ${Math.floor(elapsed / HOUR_MS)} h`;
  const date = new Date(iso);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `el ${day}/${month}`;
}

export function pendingLabel(count: number): string {
  if (count === 0) return 'sin cambios pendientes';
  return count === 1 ? '1 pendiente' : `${count} pendientes`;
}

export function describeSyncStatus(input: SyncStatusInput, nowMs: number): SyncStatusView {
  const { status, pending, lastSyncedAt, lastError } = input;
  if (status === 'error') {
    return {
      state: 'error',
      label: 'Error',
      detail: lastError ? `${lastError} Toca para reintentar.` : 'Toca para reintentar.',
    };
  }
  if (status === 'offline') {
    return { state: 'offline', label: 'Sin conexión', detail: pendingLabel(pending) };
  }
  if (status === 'syncing' || pending > 0 || lastSyncedAt === null) {
    return { state: 'syncing', label: 'Sincronizando', detail: pendingLabel(pending) };
  }
  return { state: 'synced', label: 'Sincronizado', detail: formatTimeAgo(lastSyncedAt, nowMs) };
}
