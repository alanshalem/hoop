'use client';

import React from 'react';
import clsx from 'clsx';
import { AlertTriangle, Cloud, CloudOff, RefreshCw, type LucideIcon } from 'lucide-react';
import { countPending } from '@/core/application/sync/outbox';
import { useSyncStore } from '@/core/application/stores/useSyncStore';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { requestSyncNow } from '@/presentation/session/sync-runtime';
import { useClock } from '@/presentation/session/useClock';
import { useHydrated } from '@/presentation/session/useHydrated';
import { describeSyncStatus, type SyncStatusInput, type SyncViewState } from './sync-status-view';
import styles from './SyncStatusIndicator.module.css';

const STATE_ICON: Record<SyncViewState, LucideIcon> = {
  synced: Cloud,
  syncing: RefreshCw,
  offline: CloudOff,
  error: AlertTriangle,
};

const STATE_CLASS: Record<SyncViewState, string> = {
  synced: styles.synced,
  syncing: styles.syncing,
  offline: styles.offline,
  error: styles.error,
};

/** Shown until the persisted sync state is readable (prerender and hydration). */
const PRERENDER_INPUT: SyncStatusInput = { status: 'syncing', pending: 0, lastSyncedAt: null, lastError: null };

export interface SyncStatusIndicatorProps {
  /** Icon + label only (mobile top bar). */
  compact?: boolean;
  className?: string;
}

/** Sync state (S10.8): Sincronizado / Sincronizando / Sin conexión / Error. Tap to sync now. */
export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({ compact = false, className }) => {
  const hydrated = useHydrated();
  const now = useClock();
  const status = useSyncStore((state) => state.status);
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  const lastError = useSyncStore((state) => state.lastError);
  const pending = useSyncStore((state) => countPending(state.outbox));

  const view = describeSyncStatus(hydrated ? { status, pending, lastSyncedAt, lastError } : PRERENDER_INPUT, now);
  const Icon = STATE_ICON[view.state];
  const action = view.state === 'error' ? 'Toca para reintentar' : 'Toca para sincronizar ahora';

  return (
    <button
      type="button"
      className={clsx(styles.indicator, STATE_CLASS[view.state], compact && styles.compact, className)}
      onClick={() => void requestSyncNow()}
      aria-label={`Sincronización: ${view.label}, ${view.detail}. ${action}.`}
      title={view.detail}
      data-tour="sync-status"
    >
      <Icon
        size={ICON_SIZE.md}
        className={clsx(styles.icon, view.state === 'syncing' && styles.spinning)}
        aria-hidden="true"
      />
      <span className={styles.text} aria-live="polite">
        <span className={styles.label}>{view.label}</span>
        {!compact && <span className={styles.detail}>{view.detail}</span>}
      </span>
    </button>
  );
};
