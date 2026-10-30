'use client';

import React, { useEffect, useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import {
  BASKETBALL_POSITION_LABELS,
  BasketballPositionSchema,
  DominantHand,
  DominantHandSchema,
  PLAYER_STATUS_LABELS,
  Player,
  PlayerPhysicalStatusSchema,
} from '@/core/domain/entities/club.types';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { CLUB_PROFILE } from '@/core/infrastructure/mocks/seed-data';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { ModalSheet } from '@/presentation/molecules/ModalSheet/ModalSheet';
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
import styles from './PlayerFormModal.module.css';

export const DOMINANT_HAND_LABELS: Record<DominantHand, string> = {
  RIGHT: 'Diestro',
  LEFT: 'Zurdo',
  AMBIDEXTROUS: 'Ambidiestro',
};

const MEDICAL_NOTE_MAX = 240;

const PlayerFormSchema = z.object({
  firstName: z.string().trim().min(1, 'El nombre es obligatorio'),
  lastName: z.string().trim().min(1, 'El apellido es obligatorio'),
  dorsal: z
    .number({ message: 'Ingresa un número' })
    .int('Debe ser un número entero')
    .min(0, 'Mínimo 0')
    .max(99, 'Máximo 99'),
  heightCm: z
    .number({ message: 'Ingresa la altura en cm' })
    .int('Debe ser un número entero')
    .min(120, 'Mínimo 120 cm')
    .max(240, 'Máximo 240 cm'),
  weightKg: z.number({ message: 'Ingresa el peso en kg' }).positive('Debe ser positivo').optional(),
  position: BasketballPositionSchema,
  dominantHand: DominantHandSchema,
  status: PlayerPhysicalStatusSchema,
  /** Empty string = no team. */
  teamId: z.string(),
  medicalNote: z.string().trim().max(MEDICAL_NOTE_MAX, `Máximo ${MEDICAL_NOTE_MAX} caracteres`),
});

type PlayerFormData = z.infer<typeof PlayerFormSchema>;

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

const toFormData = (player: Player | null | undefined, teamId: string): PlayerFormData =>
  player
    ? {
        firstName: player.firstName,
        lastName: player.lastName,
        dorsal: player.dorsal,
        heightCm: player.heightCm,
        weightKg: player.weightKg,
        position: player.position,
        dominantHand: player.dominantHand,
        status: player.status,
        teamId: player.teamId ?? '',
        medicalNote: player.medicalNote ?? '',
      }
    : {
        firstName: '',
        lastName: '',
        dorsal: 0,
        heightCm: 190,
        weightKg: undefined,
        position: 'PG',
        dominantHand: 'RIGHT',
        status: 'ACTIVE',
        teamId,
        medicalNote: '',
      };

/** Empty number inputs become `undefined` instead of NaN. */
const optionalNumber = (value: unknown): number | undefined =>
  value === '' || value === null || value === undefined ? undefined : Number(value);

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
  const formId = useId();
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

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PlayerFormData>({
    resolver: zodResolver(PlayerFormSchema),
    defaultValues: toFormData(null, ''),
  });

  const initialTeamId = defaultTeamId ?? teams[0]?.id ?? '';

  useEffect(() => {
    if (!isOpen) return;
    reset(toFormData(playerToEdit, initialTeamId));
  }, [isOpen, playerToEdit, initialTeamId, reset]);

  const onSubmit = (data: PlayerFormData) => {
    const player: Omit<Player, 'id'> = {
      ...data,
      teamId: data.teamId || undefined,
      medicalNote: data.medicalNote || undefined,
      clubId: playerToEdit?.clubId ?? CLUB_PROFILE.id,
    };
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
    <ModalSheet
      isOpen={isOpen}
      onClose={onClose}
      title={playerToEdit ? 'Editar jugador' : 'Nuevo jugador'}
      size="lg"
      footer={
        <>
          {playerToEdit && (
            <TouchButton
              variant="danger"
              className={styles.deleteButton}
              leftIcon={<Trash2 size={ICON_SIZE.md} />}
              onClick={handleDelete}
            >
              Eliminar
            </TouchButton>
          )}
          <TouchButton variant="ghost" onClick={onClose}>
            Cancelar
          </TouchButton>
          <TouchButton
            type="submit"
            form={formId}
            disabled={isSubmitting}
            leftIcon={<Save size={ICON_SIZE.md} />}
          >
            {playerToEdit ? 'Guardar cambios' : 'Crear jugador'}
          </TouchButton>
        </>
      }
    >
      <form id={formId} className={styles.formGrid} onSubmit={handleSubmit(onSubmit)} noValidate>
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
          options={POSITION_OPTIONS}
          error={errors.position?.message}
          {...register('position')}
        />
        <TextField
          label="Altura (cm)"
          type="number"
          inputMode="numeric"
          required
          error={errors.heightCm?.message}
          {...register('heightCm', { valueAsNumber: true })}
        />
        <TextField
          label="Peso (kg)"
          type="number"
          inputMode="decimal"
          placeholder="Opcional"
          error={errors.weightKg?.message}
          {...register('weightKg', { setValueAs: optionalNumber })}
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
      </form>
    </ModalSheet>
  );
};
