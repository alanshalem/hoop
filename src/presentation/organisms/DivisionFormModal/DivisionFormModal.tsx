'use client';

import React, { useEffect, useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save } from 'lucide-react';
import { Division, DivisionCategorySchema } from '@/core/domain/entities/club.types';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { CLUB_PROFILE } from '@/core/infrastructure/mocks/seed-data';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { ModalSheet } from '@/presentation/molecules/ModalSheet/ModalSheet';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { TextField } from '@/presentation/atoms/TextField/TextField';
import { SelectField, type SelectFieldOption } from '@/presentation/atoms/SelectField/SelectField';
import { notify } from '@/presentation/organisms/DialogHost/dialog-store';
import { DIVISION_CATEGORY_LABELS } from './division-labels';
import styles from './DivisionFormModal.module.css';

const DivisionFormSchema = z.object({
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
  category: DivisionCategorySchema,
  description: z.string().trim().max(120, 'Máximo 120 caracteres'),
  /** Empty string = no head coach. */
  headCoachId: z.string(),
});

type DivisionFormData = z.infer<typeof DivisionFormSchema>;

const CATEGORY_OPTIONS: SelectFieldOption[] = DivisionCategorySchema.options.map((category) => ({
  value: category,
  label: DIVISION_CATEGORY_LABELS[category],
}));

const EMPTY_FORM: DivisionFormData = {
  name: '',
  category: 'U15',
  description: '',
  headCoachId: '',
};

export interface DivisionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Edits this division; creates a new one (with its team) when absent. */
  divisionToEdit?: Division | null;
}

export const DivisionFormModal: React.FC<DivisionFormModalProps> = ({ isOpen, onClose, divisionToEdit }) => {
  const formId = useId();
  const teams = useClubStore((state) => state.teams);
  const users = useClubStore((state) => state.users);
  const addDivision = useClubStore((state) => state.addDivision);
  const updateDivision = useClubStore((state) => state.updateDivision);
  const assignHeadCoach = useClubStore((state) => state.assignHeadCoach);

  const team = divisionToEdit ? teams.find((t) => t.divisionId === divisionToEdit.id) : undefined;
  const coachOptions: SelectFieldOption[] = [
    { value: '', label: 'Sin entrenador asignado' },
    ...users.filter((u) => u.role === 'HEAD_COACH').map((u) => ({ value: u.id, label: u.name })),
  ];

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DivisionFormData>({
    resolver: zodResolver(DivisionFormSchema),
    defaultValues: EMPTY_FORM,
  });

  const currentCoachId = team?.headCoachId ?? '';

  useEffect(() => {
    if (!isOpen) return;
    reset(
      divisionToEdit
        ? {
            name: divisionToEdit.name,
            category: divisionToEdit.category,
            description: divisionToEdit.description ?? '',
            headCoachId: currentCoachId,
          }
        : EMPTY_FORM
    );
  }, [isOpen, divisionToEdit, currentCoachId, reset]);

  const onSubmit = async (data: DivisionFormData) => {
    const description = data.description || undefined;
    const headCoachId = data.headCoachId || null;

    if (!divisionToEdit) {
      addDivision(
        {
          name: data.name,
          category: data.category,
          gender: data.category === 'FEMENINO' ? 'FEMALE' : 'MALE',
          clubId: CLUB_PROFILE.id,
          description,
        },
        headCoachId ?? undefined
      );
      onClose();
      return;
    }

    updateDivision(divisionToEdit.id, {
      name: data.name,
      category: data.category,
      gender: data.category === 'FEMENINO' ? 'FEMALE' : divisionToEdit.gender,
      description,
    });

    if (team && data.headCoachId !== currentCoachId) {
      const result = assignHeadCoach(team.id, headCoachId);
      if (!result.ok) {
        onClose();
        await notify({
          title: 'No se pudo asignar el entrenador',
          message:
            result.reason === 'USER_NOT_HEAD_COACH'
              ? 'El usuario elegido no tiene el rol de entrenador principal.'
              : 'La división no tiene un equipo asociado.',
          tone: 'warning',
        });
        return;
      }
    }
    onClose();
  };

  return (
    <ModalSheet
      isOpen={isOpen}
      onClose={onClose}
      title={divisionToEdit ? 'Editar división' : 'Nueva división'}
      footer={
        <>
          <TouchButton variant="ghost" onClick={onClose}>
            Cancelar
          </TouchButton>
          <TouchButton
            type="submit"
            form={formId}
            disabled={isSubmitting}
            leftIcon={<Save size={ICON_SIZE.md} />}
          >
            {divisionToEdit ? 'Guardar cambios' : 'Crear división'}
          </TouchButton>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
        <TextField
          label="Nombre"
          placeholder="Ej. Sub-15 Masculino"
          required
          error={errors.name?.message}
          containerClassName={styles.fullRow}
          {...register('name')}
        />
        <SelectField
          label="Categoría"
          options={CATEGORY_OPTIONS}
          error={errors.category?.message}
          {...register('category')}
        />
        <SelectField
          label="Entrenador principal"
          options={coachOptions}
          hint={divisionToEdit ? undefined : 'Puedes asignarlo más tarde.'}
          error={errors.headCoachId?.message}
          {...register('headCoachId')}
        />
        <TextField
          label="Descripción o torneo"
          placeholder="Ej. Liga Formativa U15"
          error={errors.description?.message}
          containerClassName={styles.fullRow}
          {...register('description')}
        />
        {!divisionToEdit && (
          <p className={styles.note}>
            Al crear la división se crea también su equipo para la temporada {CLUB_PROFILE.season}.
          </p>
        )}
      </form>
    </ModalSheet>
  );
};
