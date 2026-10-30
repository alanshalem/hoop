import React from 'react';
import clsx from 'clsx';
import { BasketballPosition, BASKETBALL_POSITION_LABELS } from '@/core/domain/entities/club.types';
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

  const displayLabel = label || (position ? BASKETBALL_POSITION_LABELS[position]?.short : '');

  return (
    <span className={clsx(styles.statBadge, positionClass, className)}>
      {displayLabel}
    </span>
  );
};

