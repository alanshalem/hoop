import React, { useId } from 'react';
import clsx from 'clsx';
import { CircleAlert } from 'lucide-react';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import styles from './FormField.module.css';

export { styles as formFieldStyles };

export interface FieldIds {
  controlId: string;
  hintId: string;
  errorId: string;
}

/** Stable ids that link a control with its label, hint and error. */
export const useFieldIds = (id?: string): FieldIds => {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  return { controlId, hintId: `${controlId}-hint`, errorId: `${controlId}-error` };
};

/** `aria-describedby` value for a control with optional hint and error. */
export const describedBy = (ids: FieldIds, hint?: string, error?: string): string | undefined =>
  clsx(hint && ids.hintId, error && ids.errorId) || undefined;

export interface FormFieldProps {
  ids: FieldIds;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** Label + control + hint/error layout shared by every form control. */
export const FormField: React.FC<FormFieldProps> = ({
  ids,
  label,
  hint,
  error,
  required,
  className,
  children,
}) => (
  <div className={clsx(styles.field, className)}>
    <label htmlFor={ids.controlId} className={styles.label}>
      {label}
      {required && (
        <span className={styles.required} aria-hidden="true">
          *
        </span>
      )}
    </label>
    {children}
    {hint && !error && (
      <span id={ids.hintId} className={styles.hint}>
        {hint}
      </span>
    )}
    {error && (
      <span id={ids.errorId} className={styles.error} role="alert">
        <CircleAlert size={ICON_SIZE.sm} aria-hidden="true" />
        {error}
      </span>
    )}
  </div>
);
