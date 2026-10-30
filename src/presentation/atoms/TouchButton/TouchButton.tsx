'use client';

import React, { useRef } from 'react';
import gsap from 'gsap';
import clsx from 'clsx';
import styles from './TouchButton.module.css';

export interface TouchButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost' | 'courtAction';
  size?: 'md' | 'lg' | 'xl';
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const TouchButton = React.forwardRef<HTMLButtonElement, TouchButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      leftIcon,
      rightIcon,
      className,
      disabled,
      onPointerDown,
      onPointerUp,
      onPointerLeave,
      ...props
    },
    forwardedRef
  ) => {
    const internalRef = useRef<HTMLButtonElement | null>(null);

    const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!disabled && internalRef.current) {
        gsap.to(internalRef.current, {
          scale: 0.95,
          duration: 0.1,
          ease: 'power2.out',
        });
      }
      onPointerDown?.(e);
    };

    const handlePointerRelease = (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!disabled && internalRef.current) {
        gsap.to(internalRef.current, {
          scale: 1,
          duration: 0.25,
          ease: 'elastic.out(1.2, 0.4)',
        });
      }
      onPointerUp?.(e);
    };

    const handlePointerLeave = (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!disabled && internalRef.current) {
        gsap.to(internalRef.current, {
          scale: 1,
          duration: 0.15,
          ease: 'power1.out',
        });
      }
      onPointerLeave?.(e);
    };

    const variantClass = {
      primary: styles.variantPrimary,
      secondary: styles.variantSecondary,
      success: styles.variantSuccess,
      danger: styles.variantDanger,
      ghost: styles.variantGhost,
      courtAction: styles.variantCourtAction,
    }[variant];

    const sizeClass = {
      md: styles.sizeMd,
      lg: styles.sizeLg,
      xl: styles.sizeXl,
    }[size];

    return (
      <button
        ref={(el) => {
          internalRef.current = el;
          if (typeof forwardedRef === 'function') {
            forwardedRef(el);
          } else if (forwardedRef) {
            forwardedRef.current = el;
          }
        }}
        disabled={disabled}
        className={clsx(
          styles.touchButton,
          variantClass,
          sizeClass,
          fullWidth && styles.fullWidth,
          className
        )}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerRelease}
        onPointerLeave={handlePointerLeave}
        {...props}
      >
        {leftIcon && <span className={styles.icon}>{leftIcon}</span>}
        <span>{children}</span>
        {rightIcon && <span className={styles.icon}>{rightIcon}</span>}
      </button>
    );
  }
);

TouchButton.displayName = 'TouchButton';
