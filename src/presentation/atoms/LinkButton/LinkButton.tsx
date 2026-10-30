import React from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  TouchButtonContent,
  touchButtonClassName,
  type TouchButtonSize,
  type TouchButtonVariant,
} from '../TouchButton/touch-button-styles';

export interface LinkButtonProps
  extends Omit<React.ComponentProps<typeof Link>, 'className' | 'children'> {
  variant?: TouchButtonVariant;
  size?: TouchButtonSize;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

/** Next.js `Link` with TouchButton looks. Use it instead of nesting a button inside a link. */
export const LinkButton: React.FC<LinkButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  leftIcon,
  rightIcon,
  className,
  children,
  ...linkProps
}) => (
  <Link className={clsx(touchButtonClassName(variant, size, fullWidth), className)} {...linkProps}>
    <TouchButtonContent leftIcon={leftIcon} rightIcon={rightIcon}>
      {children}
    </TouchButtonContent>
  </Link>
);
