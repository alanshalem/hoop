'use client';

import React, { useMemo } from 'react';
import type { ManagedUser } from '@/core/application/users/user-admin';
import { TextField } from '@/presentation/atoms/TextField/TextField';
import { SelectField } from '@/presentation/atoms/SelectField/SelectField';
import { FormModalSheet } from '@/presentation/templates/FormModalSheet/FormModalSheet';
import { useModalForm } from '@/presentation/hooks/useModalForm';
import { usersApi } from '@/presentation/session/sync-runtime';
import { reportUserAdminFailure } from './report-failure';
import { USER_ROLE_OPTIONS } from './role-options';
import { EditUserFormSchema, toUserFormData, toUserPatch, userRefusalField, type EditUserFormData } from './user-form';
import styles from './UserFormModal.module.css';

export interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: ManagedUser | null;
  /** The admin's own account: its role cannot change (S6). */
  isOwnAccount: boolean;
  onSaved: (user: ManagedUser) => void;
  /** The account no longer exists: the list must reload. */
  onGone: () => void;
}

/** Name, email and role of an account (S6); only the changed fields are sent. */
export const EditUserModal: React.FC<EditUserModalProps> = ({ isOpen, onClose, user, isOwnAccount, onSaved, onGone }) => {
  const defaults = useMemo(() => toUserFormData(user), [user]);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useModalForm({ schema: EditUserFormSchema, isOpen, defaults });

  const onSubmit = async (data: EditUserFormData) => {
    if (!user) return;
    const patch = toUserPatch(user, data);
    if (!patch) {
      onClose();
      return;
    }
    const result = await usersApi.update(user.id, patch);
    if (result.ok) {
      onClose();
      onSaved(result.value);
      return;
    }
    if (userRefusalField(result.reason) === 'email') {
      setError('email', { message: result.message ?? 'Ya existe un usuario con ese email.' });
      return;
    }
    if (await reportUserAdminFailure(result, 'No se pudo guardar el usuario')) {
      onClose();
      onGone();
    }
  };

  return (
    <FormModalSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Editar usuario"
      submitLabel="Guardar cambios"
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit(onSubmit)}
      formClassName={styles.form}
    >
      <TextField
        label="Nombre"
        hint="De 2 a 60 caracteres."
        required
        autoComplete="off"
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        label="Email"
        type="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        hint="Con este email inicia sesión. No puede repetirse."
        required
        autoComplete="off"
        error={errors.email?.message}
        {...register('email')}
      />
      {isOwnAccount ? (
        // Not registered: the form keeps the current role from its defaults.
        <SelectField
          key={user?.id}
          label="Rol"
          options={USER_ROLE_OPTIONS}
          defaultValue={user?.role}
          disabled
          hint="No puedes cambiar el rol de tu propia cuenta."
        />
      ) : (
        <SelectField label="Rol" options={USER_ROLE_OPTIONS} required error={errors.role?.message} {...register('role')} />
      )}
    </FormModalSheet>
  );
};
