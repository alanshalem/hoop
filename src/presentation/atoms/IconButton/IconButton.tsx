import React from 'react';
import clsx from 'clsx';
import styles from './IconButton.module.css';

export type IconButtonVariant = 'ghost' | 'secondary' | 'primary' | 'danger';
export type IconButtonSize = 'md' | 'lg';

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  /** Required: icon-only buttons need an accessible name. */
  'aria-label': string;
  icon: React.ReactNode;
  variant?: IconButtonVariant;
  /** md = 48px, lg = 56px (live console). */
  size?: IconButtonSize;
}

const VARIANT_CLASS: Record<IconButtonVariant, string> = {
  ghost: styles.variantGhost,
  secondary: styles.variantSecondary,
  primary: styles.variantPrimary,
  danger: styles.variantDanger,
};

/** Square icon-only button with a 48px (or 56px) touch target. */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, variant = 'ghost', size = 'md', className, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={clsx(styles.iconButton, VARIANT_CLASS[variant], size === 'lg' && styles.sizeLg, className)}
      {...props}
    >
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
    </button>
  )
);

IconButton.displayName = 'IconButton';
