'use client';

import React, { useEffect, useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save } from 'lucide-react';
import { Match, MatchConditionSchema } from '@/core/domain/entities/match.types';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { CLUB_PROFILE } from '@/core/infrastructure/mocks/seed-data';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { ModalSheet } from '@/presentation/molecules/ModalSheet/ModalSheet';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { TextField } from '@/presentation/atoms/TextField/TextField';
import { SelectField, type SelectFieldOption } from '@/presentation/atoms/SelectField/SelectField';
import { MATCH_CONDITION_LABELS } from '@/presentation/organisms/MatchCard/match-display';
import styles from './MatchFormModal.module.css';

const MatchFormSchema = z.object({
  divisionId: z.string().min(1, 'Elige una división'),
  rivalTeamName: z.string().trim().min(2, 'Ingresa el nombre del rival'),
  /** `datetime-local` value (local time, no zone). */
  dateTime: z
    .string()
    .min(1, 'Elige fecha y hora')
    .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Fecha u hora inválida'),
  condition: MatchConditionSchema,
  tournament: z.string().trim().min(2, 'Ingresa el torneo o competencia'),
  venue: z.string().trim(),
});

type MatchFormData = z.infer<typeof MatchFormSchema>;

const CONDITION_OPTIONS: SelectFieldOption[] = MatchConditionSchema.options.map((condition) => ({
  value: condition,
  label: MATCH_CONDITION_LABELS[condition],
}));

const pad = (value: number) => value.toString().padStart(2, '0');

/** ISO timestamp -> `YYYY-MM-DDTHH:mm` in local time, as expected by `datetime-local`. */
const toDateTimeLocal = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
};

/** Tomorrow at 21:00 local time. */
const defaultKickoff = (): string => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(21, 0, 0, 0);
  return toDateTimeLocal(date.toISOString());
};

export interface MatchFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Edits this (scheduled) match; creates a new one when absent. */
  matchToEdit?: Match | null;
  /** Preselected division for a new match. */
  defaultDivisionId?: string;
}

export const MatchFormModal: React.FC<MatchFormModalProps> = ({
  isOpen,
  onClose,
  matchToEdit,
  defaultDivisionId,
}) => {
  const formId = useId();
  const divisions = useClubStore((state) => state.divisions);
  const teams = useClubStore((state) => state.teams);
  const addMatch = useClubStore((state) => state.addMatch);
  const updateMatch = useClubStore((state) => state.updateMatch);

  const divisionOptions: SelectFieldOption[] = divisions.map((d) => ({ value: d.id, label: d.name }));

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<MatchFormData>({
    resolver: zodResolver(MatchFormSchema),
    defaultValues: {
      divisionId: '',
      rivalTeamName: '',
      dateTime: '',
      condition: 'HOME',
      tournament: '',
      venue: '',
    },
  });

  useEffect(() => {
    if (!isOpen) return;
    const divisionExists = (id: string | undefined) => divisions.some((d) => d.id === id);
    reset(
      matchToEdit
        ? {
            // A match whose division was deleted asks for a new one.
            divisionId: divisionExists(matchToEdit.divisionId) ? matchToEdit.divisionId : '',
            rivalTeamName: matchToEdit.rivalTeamName,
            dateTime: toDateTimeLocal(matchToEdit.date),
            condition: matchToEdit.condition,
            tournament: matchToEdit.tournament,
            venue: matchToEdit.venue ?? '',
          }
        : {
            divisionId: divisionExists(defaultDivisionId) ? (defaultDivisionId ?? '') : (divisions[0]?.id ?? ''),
            rivalTeamName: '',
            dateTime: defaultKickoff(),
            condition: 'HOME',
            tournament: '',
            venue: '',
          }
    );
  }, [isOpen, matchToEdit, defaultDivisionId, divisions, reset]);

  const onSubmit = (data: MatchFormData) => {
    const team = teams.find((t) => t.divisionId === data.divisionId);
    if (!team) {
      setError('divisionId', { message: 'La división elegida no tiene un equipo asociado' });
      return;
    }

    const fields = {
      divisionId: data.divisionId,
      ownTeamId: team.id,
      ownTeamName: team.name || CLUB_PROFILE.name,
      rivalTeamName: data.rivalTeamName,
      date: new Date(data.dateTime).toISOString(),
      condition: data.condition,
      tournament: data.tournament,
      venue: data.venue || undefined,
    };

    if (matchToEdit) {
      // Changing the team invalidates the players called up for the previous one.
      const teamChanged = matchToEdit.ownTeamId !== team.id;
      updateMatch(matchToEdit.id, {
        ...fields,
        ...(teamChanged && { rosterOwnPlayerIds: [], startingLineupOwn: [], activeLineupOwn: [] }),
      });
    } else {
      addMatch({ ...fields, clubId: CLUB_PROFILE.id });
    }
    onClose();
  };

  return (
    <ModalSheet
      isOpen={isOpen}
      onClose={onClose}
      title={matchToEdit ? 'Editar partido' : 'Nuevo partido'}
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
            {matchToEdit ? 'Guardar cambios' : 'Crear partido'}
          </TouchButton>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
        <SelectField
          label="División"
          placeholder={divisions.length === 0 ? 'No hay divisiones creadas' : 'Elige una división'}
          options={divisionOptions}
          required
          error={errors.divisionId?.message}
          {...register('divisionId')}
        />
        <TextField
          label="Equipo rival"
          placeholder="Ej. Club Atlético Platense"
          required
          error={errors.rivalTeamName?.message}
          {...register('rivalTeamName')}
        />
        <TextField
          label="Fecha y hora"
          type="datetime-local"
          required
          error={errors.dateTime?.message}
          {...register('dateTime')}
        />
        <SelectField
          label="Condición"
          options={CONDITION_OPTIONS}
          error={errors.condition?.message}
          {...register('condition')}
        />
        <TextField
          label="Torneo o competencia"
          placeholder="Ej. Torneo Federal - Fecha 14"
          required
          error={errors.tournament?.message}
          {...register('tournament')}
        />
        <TextField
          label="Estadio o cancha"
          placeholder="Ej. Estadio CAMG"
          error={errors.venue?.message}
          {...register('venue')}
        />
      </form>
    </ModalSheet>
  );
};
