'use client';

import React from 'react';
import { generateTemporaryPassword } from '@/core/application/users/temporary-password';
import type { ManagedUser } from '@/core/application/users/user-admin';
import { TextField } from '@/presentation/atoms/TextField/TextField';
import { SelectField } from '@/presentation/atoms/SelectField/SelectField';
import { FormModalSheet } from '@/presentation/templates/FormModalSheet/FormModalSheet';
import { useModalForm } from '@/presentation/hooks/useModalForm';
import { usersApi } from '@/presentation/session/sync-runtime';
import { reportUserAdminFailure } from './report-failure';
import { USER_ROLE_OPTIONS } from './role-options';
import { TemporaryPasswordField } from './TemporaryPasswordField';
import { CreateUserFormSchema, toUserFormData, userRefusalField, type CreateUserFormData } from './user-form';
import styles from './UserFormModal.module.css';

const DEFAULTS: CreateUserFormData = { ...toUserFormData(null), temporaryPassword: '' };

export interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The account was created with this temporary password. */
  onCreated: (user: ManagedUser, temporaryPassword: string) => void;
}

/** New account (S2): name, email, role and a temporary password it must change at the first login. */
export const CreateUserModal: React.FC<CreateUserModalProps> = ({ isOpen, onClose, onCreated }) => {
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useModalForm({ schema: CreateUserFormSchema, isOpen, defaults: DEFAULTS });

  const onSubmit = async (data: CreateUserFormData) => {
    const result = await usersApi.create(data);
    if (result.ok) {
      onClose();
      onCreated(result.value, data.temporaryPassword);
      return;
    }
    if (userRefusalField(result.reason) === 'email') {
      setError('email', { message: result.message ?? 'Ya existe un usuario con ese email.' });
      return;
    }
    if (await reportUserAdminFailure(result, 'No se pudo crear el usuario')) onClose();
  };

  return (
    <FormModalSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Nuevo usuario"
      submitLabel="Crear usuario"
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit(onSubmit)}
      formClassName={styles.form}
    >
      <TextField
        label="Nombre"
        placeholder="Ej. Federico Balbi"
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
        placeholder="nombre@camg.com.ar"
        hint="Con este email inicia sesión. No puede repetirse."
        required
        autoComplete="off"
        error={errors.email?.message}
        {...register('email')}
      />
      <SelectField label="Rol" options={USER_ROLE_OPTIONS} required error={errors.role?.message} {...register('role')} />
      <TemporaryPasswordField
        registration={register('temporaryPassword')}
        error={errors.temporaryPassword?.message}
        onGenerate={() =>
          setValue('temporaryPassword', generateTemporaryPassword(), { shouldDirty: true, shouldValidate: true })
        }
      />
      <p className={styles.note}>
        La cuenta queda activa. Al ingresar por primera vez, la persona deberá reemplazar la contraseña temporal por una propia.
      </p>
    </FormModalSheet>
  );
};
