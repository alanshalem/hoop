'use client';

import React from 'react';
import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { FormField, describedBy, formFieldStyles as fieldStyles, useFieldIds } from '../FormField/FormField';
import styles from './SelectField.module.css';

export interface SelectFieldOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  error?: string;
  /** Options to render; `children` can be used instead for custom markup. */
  options?: SelectFieldOption[];
  /** Renders a first empty option with this text. */
  placeholder?: string;
  containerClassName?: string;
}

/** Labeled native select (48px) compatible with react-hook-form `register`. */
export const SelectField = React.forwardRef<HTMLSelectElement, SelectFieldProps>(
  (
    { label, hint, error, options, placeholder, containerClassName, className, id, required, children, ...props },
    ref
  ) => {
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
        <div className={fieldStyles.controlWrapper}>
          <select
            ref={ref}
            id={ids.controlId}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(ids, hasHint, error)}
            className={clsx(
              fieldStyles.control,
              fieldStyles.withRightIcon,
              styles.select,
              error && fieldStyles.controlInvalid,
              className
            )}
            {...props}
          >
            {placeholder !== undefined && <option value="">{placeholder}</option>}
            {options?.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
            {children}
          </select>
          <span className={fieldStyles.adornmentRight} aria-hidden="true">
            <ChevronDown size={ICON_SIZE.md} />
          </span>
        </div>
      </FormField>
    );
  }
);

SelectField.displayName = 'SelectField';
