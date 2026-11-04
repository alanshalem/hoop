import React from 'react';
import clsx from 'clsx';
import { FileText } from 'lucide-react';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { OFFICIAL_RESULT_LABEL } from './match-display';
import styles from './MatchCard.module.css';

export interface OfficialResultBadgeProps {
  className?: string;
}

/** Marks a score taken from the official report, without play-by-play (S3). */
export const OfficialResultBadge: React.FC<OfficialResultBadgeProps> = ({ className }) => (
  <span className={clsx(styles.officialBadge, className)}>
    <FileText size={ICON_SIZE.sm} aria-hidden="true" />
    {OFFICIAL_RESULT_LABEL}
  </span>
);
