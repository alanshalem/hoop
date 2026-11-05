'use client';

import React from 'react';
import { Dices } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { TextField } from '@/presentation/atoms/TextField/TextField';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import styles from './UserFormModal.module.css';

export interface TemporaryPasswordFieldProps {
  registration: UseFormRegisterReturn<'temporaryPassword'>;
  error?: string;
  /** Fills the field with a random temporary password. */
  onGenerate: () => void;
}

/**
 * Temporary password the admin hands out (S2). It stays visible so the admin
 * can copy it; the browser must not save it as the admin's own password.
 */
export const TemporaryPasswordField: React.FC<TemporaryPasswordFieldProps> = ({ registration, error, onGenerate }) => (
  <div className={styles.passwordRow}>
    <TextField
      label="Contraseña temporal"
      hint="De 8 a 256 caracteres. Anótala para entregarla: la persona deberá cambiarla al ingresar."
      required
      autoComplete="off"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      className={styles.passwordInput}
      containerClassName={styles.passwordField}
      error={error}
      {...registration}
    />
    <TouchButton variant="secondary" leftIcon={<Dices size={ICON_SIZE.md} />} onClick={onGenerate} className={styles.generateButton}>
      Generar
    </TouchButton>
  </div>
);
