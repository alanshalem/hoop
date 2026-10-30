'use client';

import React from 'react';
import clsx from 'clsx';
import { FormField, describedBy, formFieldStyles as styles, useFieldIds } from '../FormField/FormField';

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  /** Decorative icon rendered inside the input, on the left. */
  leftIcon?: React.ReactNode;
  containerClassName?: string;
}

/** Labeled text input (48px) compatible with react-hook-form `register`. */
export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, hint, error, leftIcon, containerClassName, className, id, type = 'text', required, ...props }, ref) => {
    const ids = useFieldIds(id);
    const hasHint = hint && !error ? hint : undefined;

    return (
      <FormField
        ids={ids}
        label={label}
        hint={hint}
        error={error}
        required={required}
        className={containerClassName}
      >
        <div className={styles.controlWrapper}>
          {leftIcon && (
            <span className={styles.adornmentLeft} aria-hidden="true">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={ids.controlId}
            type={type}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(ids, hasHint, error)}
            className={clsx(
              styles.control,
              leftIcon && styles.withLeftIcon,
              error && styles.controlInvalid,
              className
            )}
            {...props}
          />
        </div>
      </FormField>
    );
  }
);

TextField.displayName = 'TextField';
