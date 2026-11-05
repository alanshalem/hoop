'use client';

import React from 'react';
import { generateTemporaryPassword } from '@/core/application/users/temporary-password';
import type { ManagedUser } from '@/core/application/users/user-admin';
import { confirm } from '@/presentation/organisms/DialogHost/dialog-store';
import { FormModalSheet } from '@/presentation/templates/FormModalSheet/FormModalSheet';
import { useModalForm } from '@/presentation/hooks/useModalForm';
import { usersApi } from '@/presentation/session/sync-runtime';
import { reportUserAdminFailure } from './report-failure';
import { TemporaryPasswordField } from './TemporaryPasswordField';
import { ResetPasswordFormSchema, resetPasswordMessage, type ResetPasswordFormData } from './user-form';
import styles from './UserFormModal.module.css';

const DEFAULTS: ResetPasswordFormData = { temporaryPassword: '' };

export interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: ManagedUser | null;
  isOwnAccount: boolean;
  /** The account now has this temporary password and every one of its sessions closed. */
  onReset: (user: ManagedUser, temporaryPassword: string) => void;
  /** The account no longer exists: the list must reload. */
  onGone: () => void;
}

/** New temporary password for an account (S2), confirmed before it is sent. */
export const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({
  isOpen,
  onClose,
  user,
  isOwnAccount,
  onReset,
  onGone,
}) => {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useModalForm({ schema: ResetPasswordFormSchema, isOpen, defaults: DEFAULTS });

  const onSubmit = async ({ temporaryPassword }: ResetPasswordFormData) => {
    if (!user) return;
    const accepted = await confirm({
      title: 'Restablecer contraseña',
      message: resetPasswordMessage(user, isOwnAccount),
      confirmLabel: 'Restablecer contraseña',
      tone: 'warning',
    });
    if (!accepted) return;

    const result = await usersApi.resetPassword(user.id, temporaryPassword);
    if (result.ok) {
      onClose();
      onReset(result.value, temporaryPassword);
      return;
    }
    if (await reportUserAdminFailure(result, 'No se pudo restablecer la contraseña')) {
      onClose();
      onGone();
    }
  };

  return (
    <FormModalSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Restablecer contraseña"
      submitLabel="Restablecer"
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit(onSubmit)}
      formClassName={styles.form}
    >
      <p className={styles.note}>
        {user ? `Cuenta de ${user.name} (${user.email}). ` : ''}
        Se cerrarán todas las sesiones de la cuenta y al volver a ingresar habrá que cambiar la contraseña temporal.
      </p>
      <TemporaryPasswordField
        registration={register('temporaryPassword')}
        error={errors.temporaryPassword?.message}
        onGenerate={() =>
          setValue('temporaryPassword', generateTemporaryPassword(), { shouldDirty: true, shouldValidate: true })
        }
      />
    </FormModalSheet>
  );
};
