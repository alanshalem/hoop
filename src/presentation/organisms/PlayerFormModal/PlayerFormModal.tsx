'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  BasketballPositionSchema,
  DominantHandSchema,
  Player,
  PlayerPhysicalStatusSchema,
} from '@/core/domain/entities/club.types';
import { ModalSheet } from '@/presentation/molecules/ModalSheet/ModalSheet';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { useClubStore } from '@/core/application/stores/useClubStore';
import styles from './PlayerFormModal.module.css';

const FormSchema = z.object({
  firstName: z.string().min(1, 'El nombre es obligatorio'),
  lastName: z.string().min(1, 'El apellido es obligatorio'),
  dorsal: z
    .number({ message: 'Dorsal debe ser un número' })
    .int('Debe ser entero')
    .min(0, 'Mínimo 0')
    .max(99, 'Máximo 99'),
  heightCm: z
    .number({ message: 'Altura debe ser un número' })
    .int('Debe ser entero')
    .min(120, 'Mínimo 120 cm')
    .max(240, 'Máximo 240 cm'),
  weightKg: z
    .number({ message: 'Peso debe ser un número' })
    .positive('Debe ser positivo')
    .optional(),
  position: BasketballPositionSchema,
  dominantHand: DominantHandSchema,
  status: PlayerPhysicalStatusSchema,
  teamId: z.string().optional(),
});

type PlayerFormData = z.infer<typeof FormSchema>;

export interface PlayerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerToEdit?: Player | null;
  defaultTeamId?: string;
}

export const PlayerFormModal: React.FC<PlayerFormModalProps> = ({
  isOpen,
  onClose,
  playerToEdit,
  defaultTeamId,
}) => {
  const { addPlayer, updatePlayer, teams } = useClubStore();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PlayerFormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      dorsal: 0,
      heightCm: 190,
      weightKg: 85,
      position: 'PG',
      dominantHand: 'RIGHT',
      status: 'ACTIVE',
      teamId: defaultTeamId || teams[0]?.id || '',
    },
  });

  useEffect(() => {
    if (playerToEdit) {
      reset({
        firstName: playerToEdit.firstName,
        lastName: playerToEdit.lastName,
        dorsal: playerToEdit.dorsal,
        heightCm: playerToEdit.heightCm,
        weightKg: playerToEdit.weightKg,
        position: playerToEdit.position,
        dominantHand: playerToEdit.dominantHand,
        status: playerToEdit.status,
        teamId: playerToEdit.teamId || defaultTeamId || teams[0]?.id || '',
      });
    } else {
      reset({
        firstName: '',
        lastName: '',
        dorsal: 0,
        heightCm: 190,
        weightKg: 85,
        position: 'PG',
        dominantHand: 'RIGHT',
        status: 'ACTIVE',
        teamId: defaultTeamId || teams[0]?.id || '',
      });
    }
  }, [playerToEdit, defaultTeamId, teams, reset]);

  const onSubmit = (data: PlayerFormData) => {
    if (playerToEdit) {
      updatePlayer(playerToEdit.id, data);
    } else {
      addPlayer({
        ...data,
        clubId: 'club-hoop-arg',
      });
    }
    onClose();
  };

  return (
    <ModalSheet
      isOpen={isOpen}
      onClose={onClose}
      title={playerToEdit ? 'Editar Jugador' : 'Nuevo Jugador'}
    >
      <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Nombre</label>
            <input
              type="text"
              className={styles.input}
              placeholder="Ej. Facundo"
              {...register('firstName')}
            />
            {errors.firstName && (
              <span className={styles.error}>{errors.firstName.message}</span>
            )}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Apellido</label>
            <input
              type="text"
              className={styles.input}
              placeholder="Ej. Campazzo"
              {...register('lastName')}
            />
            {errors.lastName && (
              <span className={styles.error}>{errors.lastName.message}</span>
            )}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Dorsal (0-99)</label>
            <input
              type="number"
              className={styles.input}
              min={0}
              max={99}
              {...register('dorsal', { valueAsNumber: true })}
            />
            {errors.dorsal && (
              <span className={styles.error}>{errors.dorsal.message}</span>
            )}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Posición FIBA</label>
            <select className={styles.select} {...register('position')}>
              <option value="PG">Base (Point Guard - 1)</option>
              <option value="SG">Escolta (Shooting Guard - 2)</option>
              <option value="SF">Alero (Small Forward - 3)</option>
              <option value="PF">Ala-Pívot (Power Forward - 4)</option>
              <option value="C">Pívot (Center - 5)</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Altura (cm)</label>
            <input
              type="number"
              className={styles.input}
              placeholder="195"
              {...register('heightCm', { valueAsNumber: true })}
            />
            {errors.heightCm && (
              <span className={styles.error}>{errors.heightCm.message}</span>
            )}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Peso (kg)</label>
            <input
              type="number"
              className={styles.input}
              placeholder="90"
              {...register('weightKg', { valueAsNumber: true })}
            />
            {errors.weightKg && (
              <span className={styles.error}>{errors.weightKg.message}</span>
            )}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Mano Hábil</label>
            <select className={styles.select} {...register('dominantHand')}>
              <option value="RIGHT">Diestro</option>
              <option value="LEFT">Zurdo</option>
              <option value="AMBIDEXTROUS">Ambidiestro</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Estado Físico</label>
            <select className={styles.select} {...register('status')}>
              <option value="ACTIVE">Disponible (Activo)</option>
              <option value="INJURED">Lesionado</option>
              <option value="SUSPENDED">Suspendido</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Equipo / Plantel</label>
            <select className={styles.select} {...register('teamId')}>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.footerActions}>
          <TouchButton
            type="button"
            variant="ghost"
            size="md"
            onClick={onClose}
          >
            Cancelar
          </TouchButton>
          <TouchButton
            type="submit"
            variant="primary"
            size="md"
            disabled={isSubmitting}
          >
            {playerToEdit ? 'Guardar Cambios' : 'Crear Jugador'}
          </TouchButton>
        </div>
      </form>
    </ModalSheet>
  );
};
