'use client';

import React, { useRef } from 'react';
import gsap from 'gsap';
import clsx from 'clsx';
import {
  TouchButtonContent,
  touchButtonClassName,
  type TouchButtonSize,
  type TouchButtonVariant,
} from './touch-button-styles';

export { TouchButtonContent, touchButtonClassName };
export type { TouchButtonContentProps, TouchButtonSize, TouchButtonVariant } from './touch-button-styles';

export interface TouchButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: TouchButtonVariant;
  size?: TouchButtonSize;
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
      type = 'button',
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
        type={type}
        disabled={disabled}
        className={clsx(touchButtonClassName(variant, size, fullWidth), className)}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerRelease}
        onPointerLeave={handlePointerLeave}
        {...props}
      >
        <TouchButtonContent leftIcon={leftIcon} rightIcon={rightIcon}>
          {children}
        </TouchButtonContent>
      </button>
    );
  }
);

TouchButton.displayName = 'TouchButton';
