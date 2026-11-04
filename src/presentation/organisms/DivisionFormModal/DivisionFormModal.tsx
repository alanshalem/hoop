'use client';

import React, { useEffect, useId } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save } from 'lucide-react';
import { Division, DivisionCategorySchema } from '@/core/domain/entities/club.types';
import { COACH_ROLE_LABELS } from '@/core/domain/entities/coach.types';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { CLUB_PROFILE } from '@/core/infrastructure/club-profile';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { ModalSheet } from '@/presentation/molecules/ModalSheet/ModalSheet';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { TextField } from '@/presentation/atoms/TextField/TextField';
import { SelectField, type SelectFieldOption } from '@/presentation/atoms/SelectField/SelectField';
import { FilterChip } from '@/presentation/atoms/FilterChip/FilterChip';
import { FilterChipGroup } from '@/presentation/molecules/FilterChipGroup/FilterChipGroup';
import { notify } from '@/presentation/organisms/DialogHost/dialog-store';
import { DIVISION_CATEGORY_LABELS } from './division-labels';
import { COACH_REFUSAL_MESSAGES, toDivisionStaff } from './division-staff';
import styles from './DivisionFormModal.module.css';

const DivisionFormSchema = z.object({
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
  category: DivisionCategorySchema,
  description: z.string().trim().max(120, 'Máximo 120 caracteres'),
  /** Coach id (S5); empty string = no head coach. */
  headCoachId: z.string(),
  /** Coach ids (S5). */
  assistantCoachIds: z.array(z.string()),
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
  assistantCoachIds: [],
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
  const coaches = useClubStore((state) => state.coaches);
  const addDivision = useClubStore((state) => state.addDivision);
  const updateDivision = useClubStore((state) => state.updateDivision);
  const assignHeadCoach = useClubStore((state) => state.assignHeadCoach);
  const assignAssistantCoaches = useClubStore((state) => state.assignAssistantCoaches);

  const team = divisionToEdit ? teams.find((t) => t.divisionId === divisionToEdit.id) : undefined;
  // Any coach can lead a division (S5); the role is shown as a hint.
  const coachOptions: SelectFieldOption[] = [
    { value: '', label: 'Sin entrenador asignado' },
    ...coaches.map((coach) => ({ value: coach.id, label: `${coach.name} · ${COACH_ROLE_LABELS[coach.role]}` })),
  ];

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<DivisionFormData>({
    resolver: zodResolver(DivisionFormSchema),
    defaultValues: EMPTY_FORM,
  });

  const selectedHeadCoachId = useWatch({ control, name: 'headCoachId' });
  const selectedAssistantIds = useWatch({ control, name: 'assistantCoachIds' });
  const assistantChoices = coaches.filter((coach) => coach.id !== selectedHeadCoachId);

  const toggleAssistant = (coachId: string) =>
    setValue(
      'assistantCoachIds',
      selectedAssistantIds.includes(coachId)
        ? selectedAssistantIds.filter((id) => id !== coachId)
        : [...selectedAssistantIds, coachId],
      { shouldDirty: true }
    );

  const currentCoachId = team?.headCoachId ?? '';
  const currentAssistantIds = team?.assistantCoachIds;

  useEffect(() => {
    if (!isOpen) return;
    reset(
      divisionToEdit
        ? {
            name: divisionToEdit.name,
            category: divisionToEdit.category,
            description: divisionToEdit.description ?? '',
            headCoachId: currentCoachId,
            assistantCoachIds: currentAssistantIds ?? [],
          }
        : EMPTY_FORM
    );
  }, [isOpen, divisionToEdit, currentCoachId, currentAssistantIds, reset]);

  const warnRefusal = async (reason: keyof typeof COACH_REFUSAL_MESSAGES) => {
    onClose();
    await notify({
      title: 'No se pudo asignar el cuerpo técnico',
      message: COACH_REFUSAL_MESSAGES[reason],
      tone: 'warning',
    });
  };

  const onSubmit = async (data: DivisionFormData) => {
    const description = data.description || undefined;
    const staff = toDivisionStaff(data.headCoachId, data.assistantCoachIds);

    if (!divisionToEdit) {
      const created = addDivision(
        {
          name: data.name,
          category: data.category,
          gender: data.category === 'FEMENINO' ? 'FEMALE' : 'MALE',
          clubId: CLUB_PROFILE.id,
          description,
        },
        staff
      );
      if (!created.ok) {
        await warnRefusal(created.reason);
        return;
      }
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
      const result = assignHeadCoach(team.id, staff.headCoachId ?? null);
      if (!result.ok) {
        await warnRefusal(result.reason);
        return;
      }
    }
    const assistantsChanged = staff.assistantCoachIds.join() !== (currentAssistantIds ?? []).join();
    if (team && assistantsChanged) {
      const result = assignAssistantCoaches(team.id, staff.assistantCoachIds);
      if (!result.ok) {
        await warnRefusal(result.reason);
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
          hint={
            coaches.length === 0
              ? 'Todavía no hay entrenadores: cárgalos desde Entrenadores.'
              : divisionToEdit
                ? undefined
                : 'Puedes asignarlo más tarde.'
          }
          error={errors.headCoachId?.message}
          {...register('headCoachId')}
        />
        {assistantChoices.length > 0 && (
          <FilterChipGroup label="Ayudantes" className={styles.fullRow}>
            {assistantChoices.map((coach) => (
              <FilterChip
                key={coach.id}
                label={coach.name}
                pressed={selectedAssistantIds.includes(coach.id)}
                onClick={() => toggleAssistant(coach.id)}
              />
            ))}
          </FilterChipGroup>
        )}
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
