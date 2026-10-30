import React from 'react';
import clsx from 'clsx';
import styles from './FilterChip.module.css';

export interface FilterChipProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> {
  label: string;
  pressed: boolean;
  /** Optional result count shown next to the label. */
  count?: number;
  icon?: React.ReactNode;
}

/** Toggleable filter pill (48px touch target, `aria-pressed`). */
export const FilterChip: React.FC<FilterChipProps> = ({
  label,
  pressed,
  count,
  icon,
  className,
  type = 'button',
  ...props
}) => (
  <button
    type={type}
    aria-pressed={pressed}
    className={clsx(styles.chip, pressed && styles.chipPressed, className)}
    {...props}
  >
    {icon && (
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
    )}
    <span>{label}</span>
    {count !== undefined && <span className={clsx(styles.count, 'tabular-nums')}>{count}</span>}
  </button>
);
