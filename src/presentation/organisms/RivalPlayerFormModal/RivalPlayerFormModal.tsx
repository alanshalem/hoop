'use client';

import React, { useMemo } from 'react';
import type { RivalPlayer, RivalTeam } from '@/core/domain/entities/rival.types';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { TextField } from '@/presentation/atoms/TextField/TextField';
import { notify } from '@/presentation/organisms/DialogHost/dialog-store';
import { FormModalSheet } from '@/presentation/templates/FormModalSheet/FormModalSheet';
import { useModalForm } from '@/presentation/hooks/useModalForm';
import { applyRefusal } from '@/presentation/hooks/apply-refusal';
import {
  RIVAL_PLAYER_REFUSAL_MESSAGES,
  RivalPlayerFormSchema,
  rivalPlayerRefusalField,
  type RivalPlayerFormData,
  type RivalPlayerRefusal,
} from '@/presentation/organisms/RivalTeamFormModal/rival-roster';
import styles from './RivalPlayerFormModal.module.css';

const EMPTY_FORM = { firstName: '', lastName: '' };

export interface RivalPlayerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Kept by the parent while the sheet animates out. */
  team: RivalTeam | null;
  /** Edits this player; adds a new one to `team` when absent. */
  playerToEdit?: RivalPlayer | null;
  /** Title name when there is no stored `team` (a roster drafted in the match form, S16). */
  teamName?: string;
  /** Draft mode (S16): saves through this instead of the store; a refusal shows like a store refusal. */
  onSave?: (data: RivalPlayerFormData) => { ok: true } | { ok: false; reason: RivalPlayerRefusal };
}

export const RivalPlayerFormModal: React.FC<RivalPlayerFormModalProps> = ({
  isOpen,
  onClose,
  team,
  playerToEdit,
  teamName,
  onSave,
}) => {
  const addRivalPlayer = useClubStore((state) => state.addRivalPlayer);
  const updateRivalPlayer = useClubStore((state) => state.updateRivalPlayer);

  // A new player starts without dorsal so 0 is never saved by accident.
  const defaults = useMemo(
    () =>
      playerToEdit
        ? { dorsal: playerToEdit.dorsal, firstName: playerToEdit.firstName, lastName: playerToEdit.lastName }
        : EMPTY_FORM,
    [playerToEdit]
  );
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useModalForm({ schema: RivalPlayerFormSchema, isOpen, defaults });

  const onSubmit = async (data: RivalPlayerFormData) => {
    let result: { ok: true } | { ok: false; reason: RivalPlayerRefusal };
    if (onSave) {
      result = onSave(data);
    } else {
      if (!team) return;
      result = playerToEdit ? updateRivalPlayer(team.id, playerToEdit.id, data) : addRivalPlayer(team.id, data);
    }
    await applyRefusal(result, {
      messages: RIVAL_PLAYER_REFUSAL_MESSAGES,
      fieldOf: rivalPlayerRefusalField,
      setError,
      close: onClose,
      warn: (message) => notify({ title: 'No se pudo guardar el jugador', message, tone: 'warning' }),
    });
  };

  const titleTeam = team?.name ?? teamName;

  return (
    <FormModalSheet
      isOpen={isOpen}
      onClose={onClose}
      title={`${playerToEdit ? 'Editar jugador' : 'Nuevo jugador'}${titleTeam ? ` · ${titleTeam}` : ''}`}
      submitLabel={playerToEdit ? 'Guardar cambios' : 'Agregar jugador'}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit(onSubmit)}
      formClassName={styles.form}
    >
      <TextField
        label="Dorsal"
        type="number"
        inputMode="numeric"
        min={0}
        max={99}
        hint="De 0 a 99, sin repetir en el equipo."
        required
        error={errors.dorsal?.message}
        containerClassName={styles.fullRow}
        {...register('dorsal', { valueAsNumber: true })}
      />
      <TextField
        label="Nombre"
        placeholder="Ej. Juan"
        required
        autoComplete="off"
        error={errors.firstName?.message}
        {...register('firstName')}
      />
      <TextField
        label="Apellido"
        placeholder="Ej. Pérez"
        required
        autoComplete="off"
        error={errors.lastName?.message}
        {...register('lastName')}
      />
    </FormModalSheet>
  );
};
