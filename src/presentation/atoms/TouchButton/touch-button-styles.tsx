import React from 'react';
import clsx from 'clsx';
import styles from './TouchButton.module.css';

/* Server-safe TouchButton styling shared by TouchButton and LinkButton. */

export type TouchButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost' | 'courtAction';
export type TouchButtonSize = 'md' | 'lg' | 'xl';

const VARIANT_CLASS: Record<TouchButtonVariant, string> = {
  primary: styles.variantPrimary,
  secondary: styles.variantSecondary,
  success: styles.variantSuccess,
  danger: styles.variantDanger,
  ghost: styles.variantGhost,
  courtAction: styles.variantCourtAction,
};

const SIZE_CLASS: Record<TouchButtonSize, string> = {
  md: styles.sizeMd,
  lg: styles.sizeLg,
  xl: styles.sizeXl,
};

/** Single source of TouchButton styles, shared with LinkButton. */
export const touchButtonClassName = (
  variant: TouchButtonVariant = 'primary',
  size: TouchButtonSize = 'md',
  fullWidth = false
): string =>
  clsx(styles.touchButton, VARIANT_CLASS[variant], SIZE_CLASS[size], fullWidth && styles.fullWidth);

export interface TouchButtonContentProps {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children?: React.ReactNode;
}

/** Inner layout (icons + label) shared by TouchButton and LinkButton. */
export const TouchButtonContent: React.FC<TouchButtonContentProps> = ({ leftIcon, rightIcon, children }) => (
  <>
    {leftIcon && (
      <span className={styles.icon} aria-hidden="true">
        {leftIcon}
      </span>
    )}
    {children !== undefined && children !== null && <span className={styles.label}>{children}</span>}
    {rightIcon && (
      <span className={styles.icon} aria-hidden="true">
        {rightIcon}
      </span>
    )}
  </>
);
