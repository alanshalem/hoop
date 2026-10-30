import React from 'react';
import clsx from 'clsx';
import { PlayerPhysicalStatus, PLAYER_STATUS_LABELS } from '@/core/domain/entities/club.types';
import styles from './StatusPill.module.css';

export interface StatusPillProps {
  status: PlayerPhysicalStatus | 'NEUTRAL';
  customLabel?: string;
  className?: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({
  status,
  customLabel,
  className,
}) => {
  const statusClass = {
    ACTIVE: styles.statusActive,
    INJURED: styles.statusInjured,
    SUSPENDED: styles.statusSuspended,
    NEUTRAL: styles.statusNeutral,
  }[status];

  const label =
    customLabel ||
    (status === 'NEUTRAL' ? 'Inactivo' : PLAYER_STATUS_LABELS[status]);

  return (
    <span className={clsx(styles.statusPill, statusClass, className)}>
      <span className={styles.indicatorDot} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
};
