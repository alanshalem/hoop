'use client';

import React, { useId } from 'react';
import clsx from 'clsx';
import styles from './FilterChipGroup.module.css';

export interface FilterChipGroupProps {
  label: string;
  /** FilterChip elements. */
  children: React.ReactNode;
  className?: string;
}

/** Labeled, horizontally scrollable row of FilterChip elements. */
export const FilterChipGroup: React.FC<FilterChipGroupProps> = ({ label, children, className }) => {
  const labelId = useId();

  return (
    <div className={clsx(styles.group, className)} role="group" aria-labelledby={labelId}>
      <span id={labelId} className={styles.label}>
        {label}
      </span>
      <div className={clsx(styles.row, 'no-scrollbar')}>{children}</div>
    </div>
  );
};
