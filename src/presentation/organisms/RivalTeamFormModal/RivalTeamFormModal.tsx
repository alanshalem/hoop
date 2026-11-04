'use client';

import React, { useEffect, useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import type { RivalTeam } from '@/core/domain/entities/rival.types';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { ModalSheet } from '@/presentation/molecules/ModalSheet/ModalSheet';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { TextField } from '@/presentation/atoms/TextField/TextField';
import { SelectField, type SelectFieldOption } from '@/presentation/atoms/SelectField/SelectField';
import { notify } from '@/presentation/organisms/DialogHost/dialog-store';
import { RIVAL_TEAM_REFUSAL_MESSAGES, RivalTeamFormSchema, type RivalTeamFormData } from './rival-roster';
import styles from './RivalTeamFormModal.module.css';

export interface RivalTeamFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Renames this team (its division stays); creates a new one when absent. */
  teamToEdit?: RivalTeam | null;
  /** Division preselected for a new team. */
  defaultDivisionId: string;
  /** Called with the id of a newly created team. */
  onCreated?: (teamId: string) => void;
}

export const RivalTeamFormModal: React.FC<RivalTeamFormModalProps> = ({
  isOpen,
  onClose,
  teamToEdit,
  defaultDivisionId,
  onCreated,
}) => {
  const formId = useId();
  const divisions = useClubStore((state) => state.divisions);
  const createRivalTeam = useClubStore((state) => state.createRivalTeam);
  const renameRivalTeam = useClubStore((state) => state.renameRivalTeam);

  const divisionOptions: SelectFieldOption[] = divisions.map((d) => ({ value: d.id, label: d.name }));
  const editedDivision = teamToEdit ? divisions.find((d) => d.id === teamToEdit.divisionId) : undefined;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RivalTeamFormData>({
    resolver: zodResolver(RivalTeamFormSchema),
    defaultValues: { divisionId: defaultDivisionId, name: '' },
  });

  useEffect(() => {
    if (!isOpen) return;
    reset(
      teamToEdit
        ? { divisionId: teamToEdit.divisionId, name: teamToEdit.name }
        : { divisionId: defaultDivisionId, name: '' }
    );
  }, [isOpen, teamToEdit, defaultDivisionId, reset]);

  const onSubmit = async (data: RivalTeamFormData) => {
    if (!teamToEdit) {
      const result = createRivalTeam(data);
      if (!result.ok) {
        setError('name', { message: RIVAL_TEAM_REFUSAL_MESSAGES[result.reason] });
        return;
      }
      onClose();
      onCreated?.(result.id);
      return;
    }

    const result = renameRivalTeam(teamToEdit.id, data.name);
    if (result.ok) {
      onClose();
      return;
    }
    if (result.reason === 'INVALID_NAME') {
      setError('name', { message: RIVAL_TEAM_REFUSAL_MESSAGES.INVALID_NAME });
      return;
    }
    onClose();
    await notify({
      title: 'No se pudo renombrar el rival',
      message: RIVAL_TEAM_REFUSAL_MESSAGES[result.reason],
      tone: 'warning',
    });
  };

  return (
    <ModalSheet
      isOpen={isOpen}
      onClose={onClose}
      title={teamToEdit ? 'Renombrar rival' : 'Nuevo rival'}
      footer={
        <>
          <TouchButton variant="ghost" onClick={onClose}>
            Cancelar
          </TouchButton>
          <TouchButton type="submit" form={formId} disabled={isSubmitting} leftIcon={<Save size={ICON_SIZE.md} />}>
            {teamToEdit ? 'Guardar cambios' : 'Crear rival'}
          </TouchButton>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
        {teamToEdit ? (
          <p className={styles.division}>División: {editedDivision?.name ?? 'División eliminada'}</p>
        ) : (
          <SelectField
            label="División"
            options={divisionOptions}
            required
            error={errors.divisionId?.message}
            {...register('divisionId')}
          />
        )}
        <TextField
          label="Nombre del equipo"
          placeholder="Ej. Obras Sanitarias"
          hint="De 1 a 60 caracteres."
          required
          autoComplete="off"
          error={errors.name?.message}
          {...register('name')}
        />
        <p className={styles.note}>
          Escribe el nombre igual que en los partidos (sin importar mayúsculas ni acentos): así la consola en vivo
          encuentra este plantel en los partidos de la división contra este rival.
        </p>
      </form>
    </ModalSheet>
  );
};
