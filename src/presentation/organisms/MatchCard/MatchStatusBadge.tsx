import React from 'react';
import clsx from 'clsx';
import type { MatchStatus } from '@/core/domain/entities/match.types';
import { MATCH_STATUS_LABELS } from './match-display';
import styles from './MatchCard.module.css';

const STATUS_CLASS: Record<MatchStatus, string> = {
  SCHEDULED: styles.statusScheduled,
  LIVE: styles.statusLive,
  HALFTIME: styles.statusLive,
  FINISHED: styles.statusFinished,
};

export interface MatchStatusBadgeProps {
  status: MatchStatus;
  /** Extra text after the status label, e.g. the current quarter. */
  detail?: string;
  className?: string;
}

/** Status pill for a match (pulsing dot while in play). */
export const MatchStatusBadge: React.FC<MatchStatusBadgeProps> = ({ status, detail, className }) => (
  <span className={clsx(styles.statusBadge, STATUS_CLASS[status], className)}>
    <span className={styles.statusDot} aria-hidden="true" />
    <span>
      {MATCH_STATUS_LABELS[status]}
      {detail && ` · ${detail}`}
    </span>
  </span>
);
