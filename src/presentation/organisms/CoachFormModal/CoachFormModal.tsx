'use client';

import React, { useMemo } from 'react';
import { COACH_ROLE_LABELS, CoachRoleSchema, type Coach } from '@/core/domain/entities/coach.types';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { TextField } from '@/presentation/atoms/TextField/TextField';
import { SelectField, type SelectFieldOption } from '@/presentation/atoms/SelectField/SelectField';
import { notify } from '@/presentation/organisms/DialogHost/dialog-store';
import { FormModalSheet } from '@/presentation/templates/FormModalSheet/FormModalSheet';
import { useModalForm } from '@/presentation/hooks/useModalForm';
import { applyRefusal } from '@/presentation/hooks/apply-refusal';
import {
  COACH_RECORD_REFUSAL_MESSAGES,
  CoachFormSchema,
  coachRefusalField,
  toCoachFormData,
  toCoachInput,
  type CoachFormData,
} from './coach-form';
import styles from './CoachFormModal.module.css';

const ROLE_OPTIONS: SelectFieldOption[] = CoachRoleSchema.options.map((role) => ({
  value: role,
  label: COACH_ROLE_LABELS[role],
}));

export interface CoachFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Edits this coach; creates a new one when absent. */
  coachToEdit?: Coach | null;
}

/** Coach record without login (S5): name, optional license and role. */
export const CoachFormModal: React.FC<CoachFormModalProps> = ({ isOpen, onClose, coachToEdit }) => {
  const createCoach = useClubStore((state) => state.createCoach);
  const updateCoach = useClubStore((state) => state.updateCoach);

  const defaults = useMemo(() => toCoachFormData(coachToEdit), [coachToEdit]);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useModalForm({ schema: CoachFormSchema, isOpen, defaults });

  const onSubmit = async (data: CoachFormData) => {
    const input = toCoachInput(data);
    const result = coachToEdit ? updateCoach(coachToEdit.id, input) : createCoach(input);
    await applyRefusal(result, {
      messages: COACH_RECORD_REFUSAL_MESSAGES,
      fieldOf: coachRefusalField,
      setError,
      close: onClose,
      warn: (message) => notify({ title: 'No se pudo guardar el entrenador', message, tone: 'warning' }),
    });
  };

  return (
    <FormModalSheet
      isOpen={isOpen}
      onClose={onClose}
      title={coachToEdit ? 'Editar entrenador' : 'Nuevo entrenador'}
      submitLabel={coachToEdit ? 'Guardar cambios' : 'Crear entrenador'}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit(onSubmit)}
      formClassName={styles.form}
    >
      <TextField
        label="Nombre"
        placeholder="Ej. Pérez, J. A."
        hint="De 2 a 60 caracteres, como figura en el acta."
        required
        autoComplete="off"
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        label="Licencia"
        placeholder="Ej. 090"
        hint="Opcional, hasta 20 caracteres."
        autoComplete="off"
        error={errors.license?.message}
        {...register('license')}
      />
      <SelectField label="Rol" options={ROLE_OPTIONS} required error={errors.role?.message} {...register('role')} />
      <p className={styles.note}>
        Los entrenadores son fichas sin usuario: no inician sesión. Se asignan a una división desde Divisiones.
      </p>
    </FormModalSheet>
  );
};
