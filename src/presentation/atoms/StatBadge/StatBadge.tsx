import React from 'react';
import clsx from 'clsx';
import { BasketballPosition, BASKETBALL_POSITION_LABELS } from '@/core/domain/entities/club.types';
import { MISSING_VALUE } from '@/presentation/player-display';
import styles from './StatBadge.module.css';

export interface StatBadgeProps {
  position?: BasketballPosition;
  label?: string;
  className?: string;
}

export const StatBadge: React.FC<StatBadgeProps> = ({
  position,
  label,
  className,
}) => {
  const positionClass = position
    ? {
        PG: styles.posPG,
        SG: styles.posSG,
        SF: styles.posSF,
        PF: styles.posPF,
        C: styles.posC,
      }[position]
    : undefined;

  // A player without a position shows a dash (S4).
  const displayLabel = label || (position ? BASKETBALL_POSITION_LABELS[position]?.short : MISSING_VALUE);

  return (
    <span className={clsx(styles.statBadge, positionClass, className)}>
      {displayLabel}
    </span>
  );
};

