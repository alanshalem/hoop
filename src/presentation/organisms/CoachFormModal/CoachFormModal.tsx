'use client';

import React, { useEffect, useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { COACH_ROLE_LABELS, CoachRoleSchema, type Coach } from '@/core/domain/entities/coach.types';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { ModalSheet } from '@/presentation/molecules/ModalSheet/ModalSheet';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { TextField } from '@/presentation/atoms/TextField/TextField';
import { SelectField, type SelectFieldOption } from '@/presentation/atoms/SelectField/SelectField';
import { notify } from '@/presentation/organisms/DialogHost/dialog-store';
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
  const formId = useId();
  const createCoach = useClubStore((state) => state.createCoach);
  const updateCoach = useClubStore((state) => state.updateCoach);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CoachFormData>({
    resolver: zodResolver(CoachFormSchema),
    defaultValues: toCoachFormData(null),
  });

  useEffect(() => {
    if (isOpen) reset(toCoachFormData(coachToEdit));
  }, [isOpen, coachToEdit, reset]);

  const onSubmit = async (data: CoachFormData) => {
    const input = toCoachInput(data);
    const result = coachToEdit ? updateCoach(coachToEdit.id, input) : createCoach(input);
    if (result.ok) {
      onClose();
      return;
    }
    const field = coachRefusalField(result.reason);
    if (field) {
      setError(field, { message: COACH_RECORD_REFUSAL_MESSAGES[result.reason] });
      return;
    }
    onClose();
    await notify({
      title: 'No se pudo guardar el entrenador',
      message: COACH_RECORD_REFUSAL_MESSAGES[result.reason],
      tone: 'warning',
    });
  };

  return (
    <ModalSheet
      isOpen={isOpen}
      onClose={onClose}
      title={coachToEdit ? 'Editar entrenador' : 'Nuevo entrenador'}
      footer={
        <>
          <TouchButton variant="ghost" onClick={onClose}>
            Cancelar
          </TouchButton>
          <TouchButton type="submit" form={formId} disabled={isSubmitting} leftIcon={<Save size={ICON_SIZE.md} />}>
            {coachToEdit ? 'Guardar cambios' : 'Crear entrenador'}
          </TouchButton>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
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
      </form>
    </ModalSheet>
  );
};
