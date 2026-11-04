'use client';

import React, { useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import clsx from 'clsx';
import {
  BASKETBALL_POSITION_LABELS,
  BasketballPositionSchema,
  DominantHand,
  DominantHandSchema,
  LICENSE_MAX_LENGTH,
  PLAYER_STATUS_LABELS,
  Player,
  PlayerPhysicalStatusSchema,
} from '@/core/domain/entities/club.types';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { CLUB_PROFILE } from '@/core/domain/club-profile';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { TextField } from '@/presentation/atoms/TextField/TextField';
import { SelectField, type SelectFieldOption } from '@/presentation/atoms/SelectField/SelectField';
import {
  FormField,
  describedBy,
  formFieldStyles,
  useFieldIds,
} from '@/presentation/atoms/FormField/FormField';
import { confirm } from '@/presentation/organisms/DialogHost/dialog-store';
import { FormModalSheet } from '@/presentation/templates/FormModalSheet/FormModalSheet';
import { useModalForm } from '@/presentation/hooks/useModalForm';
import {
  MEDICAL_NOTE_MAX,
  optionalNumber,
  PlayerFormSchema,
  toPlayerFormData,
  toPlayerInput,
  type PlayerFormData,
} from './player-form';
import styles from './PlayerFormModal.module.css';

export const DOMINANT_HAND_LABELS: Record<DominantHand, string> = {
  RIGHT: 'Diestro',
  LEFT: 'Zurdo',
  AMBIDEXTROUS: 'Ambidiestro',
};

const POSITION_OPTIONS: SelectFieldOption[] = BasketballPositionSchema.options.map((position) => ({
  value: position,
  label: `${BASKETBALL_POSITION_LABELS[position].short} (${BASKETBALL_POSITION_LABELS[position].number})`,
}));

const HAND_OPTIONS: SelectFieldOption[] = DominantHandSchema.options.map((hand) => ({
  value: hand,
  label: DOMINANT_HAND_LABELS[hand],
}));

const STATUS_OPTIONS: SelectFieldOption[] = PlayerPhysicalStatusSchema.options.map((status) => ({
  value: status,
  label: PLAYER_STATUS_LABELS[status],
}));

export interface PlayerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Edits this player (and offers to delete it); creates a new one when absent. */
  playerToEdit?: Player | null;
  /** Preselected team for a new player. */
  defaultTeamId?: string;
}

export const PlayerFormModal: React.FC<PlayerFormModalProps> = ({
  isOpen,
  onClose,
  playerToEdit,
  defaultTeamId,
}) => {
  const noteIds = useFieldIds();
  const teams = useClubStore((state) => state.teams);
  const divisions = useClubStore((state) => state.divisions);
  const addPlayer = useClubStore((state) => state.addPlayer);
  const updatePlayer = useClubStore((state) => state.updatePlayer);
  const deletePlayer = useClubStore((state) => state.deletePlayer);

  const teamOptions: SelectFieldOption[] = teams.map((team) => ({
    value: team.id,
    label: divisions.find((d) => d.id === team.divisionId)?.name ?? team.name,
  }));

  const initialTeamId = defaultTeamId ?? teams[0]?.id ?? '';

  const defaults = useMemo(() => toPlayerFormData(playerToEdit, initialTeamId), [playerToEdit, initialTeamId]);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useModalForm({ schema: PlayerFormSchema, isOpen, defaults });

  const onSubmit = (data: PlayerFormData) => {
    const player = toPlayerInput(data, playerToEdit?.clubId ?? CLUB_PROFILE.id);
    if (playerToEdit) {
      updatePlayer(playerToEdit.id, player);
    } else {
      addPlayer(player);
    }
    onClose();
  };

  const handleDelete = async () => {
    if (!playerToEdit) return;
    const accepted = await confirm({
      title: 'Eliminar jugador',
      message: `Se eliminará a ${playerToEdit.firstName} ${playerToEdit.lastName} (#${playerToEdit.dorsal}) del plantel y de todos los equipos. Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (!accepted) return;
    deletePlayer(playerToEdit.id);
    onClose();
  };

  return (
    <FormModalSheet
      isOpen={isOpen}
      onClose={onClose}
      title={playerToEdit ? 'Editar jugador' : 'Nuevo jugador'}
      size="lg"
      submitLabel={playerToEdit ? 'Guardar cambios' : 'Crear jugador'}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit(onSubmit)}
      formClassName={styles.formGrid}
      extraActions={
        playerToEdit && (
          <TouchButton
            variant="danger"
            className={styles.deleteButton}
            leftIcon={<Trash2 size={ICON_SIZE.md} />}
            onClick={handleDelete}
          >
            Eliminar
          </TouchButton>
        )
      }
    >
      <TextField
        label="Nombre"
        placeholder="Ej. Facundo"
        required
        autoComplete="off"
        error={errors.firstName?.message}
        {...register('firstName')}
      />
      <TextField
        label="Apellido"
        placeholder="Ej. Campazzo"
        required
        autoComplete="off"
        error={errors.lastName?.message}
        {...register('lastName')}
      />
      <TextField
        label="Dorsal"
        type="number"
        inputMode="numeric"
        min={0}
        max={99}
        hint="De 0 a 99"
        required
        error={errors.dorsal?.message}
        {...register('dorsal', { valueAsNumber: true })}
      />
      <SelectField
        label="Posición"
        placeholder="Sin posición"
        options={POSITION_OPTIONS}
        error={errors.position?.message}
        {...register('position')}
      />
      <TextField
        label="Altura (cm)"
        type="number"
        inputMode="numeric"
        placeholder="Opcional"
        error={errors.heightCm?.message}
        {...register('heightCm', { setValueAs: optionalNumber })}
      />
      <TextField
        label="Peso (kg)"
        type="number"
        inputMode="decimal"
        placeholder="Opcional"
        error={errors.weightKg?.message}
        {...register('weightKg', { setValueAs: optionalNumber })}
      />
      <TextField
        label="Licencia"
        placeholder="Opcional"
        autoComplete="off"
        maxLength={LICENSE_MAX_LENGTH}
        hint="Número de licencia de la federación"
        error={errors.license?.message}
        {...register('license')}
      />
      <SelectField
        label="Mano hábil"
        options={HAND_OPTIONS}
        error={errors.dominantHand?.message}
        {...register('dominantHand')}
      />
      <SelectField
        label="Estado físico"
        options={STATUS_OPTIONS}
        error={errors.status?.message}
        {...register('status')}
      />
      <SelectField
        label="División"
        placeholder="Sin equipo asignado"
        options={teamOptions}
        error={errors.teamId?.message}
        containerClassName={styles.fullRow}
        {...register('teamId')}
      />
      <FormField
        ids={noteIds}
        label="Parte médico"
        hint="Lesión, tratamiento o fecha estimada de alta. Se muestra en las alertas médicas."
        error={errors.medicalNote?.message}
        className={styles.fullRow}
      >
        <textarea
          id={noteIds.controlId}
          rows={3}
          maxLength={MEDICAL_NOTE_MAX}
          placeholder="Ej. Esguince de tobillo derecho. Alta estimada en 2 semanas."
          aria-invalid={errors.medicalNote ? true : undefined}
          aria-describedby={describedBy(
            noteIds,
            errors.medicalNote ? undefined : 'hint',
            errors.medicalNote?.message
          )}
          className={clsx(
            formFieldStyles.control,
            styles.textarea,
            errors.medicalNote && formFieldStyles.controlInvalid
          )}
          {...register('medicalNote')}
        />
      </FormField>
    </FormModalSheet>
  );
};
