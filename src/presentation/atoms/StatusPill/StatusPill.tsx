import React from 'react';
import clsx from 'clsx';
import { Ban, HeartPulse, type LucideIcon } from 'lucide-react';
import { PlayerPhysicalStatus, PLAYER_STATUS_LABELS } from '@/core/domain/entities/club.types';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import styles from './StatusPill.module.css';

// Danger and warning states carry an icon so they never rely on color alone.
const STATUS_ICON: Partial<Record<StatusPillProps['status'], LucideIcon>> = {
  INJURED: HeartPulse,
  SUSPENDED: Ban,
};

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

  const Icon = STATUS_ICON[status];

  return (
    <span className={clsx(styles.statusPill, statusClass, className)}>
      {Icon ? (
        <Icon size={ICON_SIZE.xs} aria-hidden="true" />
      ) : (
        <span className={styles.indicatorDot} aria-hidden="true" />
      )}
      <span>{label}</span>
    </span>
  );
};

