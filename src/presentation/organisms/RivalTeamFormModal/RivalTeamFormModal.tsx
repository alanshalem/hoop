'use client';

import React, { useMemo } from 'react';
import type { RivalTeam } from '@/core/domain/entities/rival.types';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { TextField } from '@/presentation/atoms/TextField/TextField';
import { SelectField, type SelectFieldOption } from '@/presentation/atoms/SelectField/SelectField';
import { notify } from '@/presentation/organisms/DialogHost/dialog-store';
import { FormModalSheet } from '@/presentation/templates/FormModalSheet/FormModalSheet';
import { useModalForm } from '@/presentation/hooks/useModalForm';
import { applyRefusal } from '@/presentation/hooks/apply-refusal';
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
  const divisions = useClubStore((state) => state.divisions);
  const createRivalTeam = useClubStore((state) => state.createRivalTeam);
  const renameRivalTeam = useClubStore((state) => state.renameRivalTeam);

  const divisionOptions: SelectFieldOption[] = divisions.map((d) => ({ value: d.id, label: d.name }));
  const editedDivision = teamToEdit ? divisions.find((d) => d.id === teamToEdit.divisionId) : undefined;

  const defaults = useMemo(
    () =>
      teamToEdit
        ? { divisionId: teamToEdit.divisionId, name: teamToEdit.name }
        : { divisionId: defaultDivisionId, name: '' },
    [teamToEdit, defaultDivisionId]
  );
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useModalForm({ schema: RivalTeamFormSchema, isOpen, defaults });

  const onSubmit = async (data: RivalTeamFormData) => {
    const outcome = {
      messages: RIVAL_TEAM_REFUSAL_MESSAGES,
      setError,
      close: onClose,
      warn: (message: string) => notify({ title: 'No se pudo renombrar el rival', message, tone: 'warning' }),
    };

    if (!teamToEdit) {
      const result = createRivalTeam(data);
      await applyRefusal(result, { ...outcome, fieldOf: () => 'name' });
      if (result.ok) onCreated?.(result.id);
      return;
    }

    await applyRefusal(renameRivalTeam(teamToEdit.id, data.name), {
      ...outcome,
      fieldOf: (reason) => (reason === 'INVALID_NAME' ? 'name' : null),
    });
  };

  return (
    <FormModalSheet
      isOpen={isOpen}
      onClose={onClose}
      title={teamToEdit ? 'Renombrar rival' : 'Nuevo rival'}
      submitLabel={teamToEdit ? 'Guardar cambios' : 'Crear rival'}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit(onSubmit)}
      formClassName={styles.form}
    >
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
    </FormModalSheet>
  );
};
