'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Match, MatchConditionSchema } from '@/core/domain/entities/match.types';
import type { RivalPlayer } from '@/core/domain/entities/rival.types';
import { can } from '@/core/domain/rules/permissions';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { CLUB_PROFILE } from '@/core/domain/club-profile';
import { FilterChipGroup } from '@/presentation/molecules/FilterChipGroup/FilterChipGroup';
import { FilterChip } from '@/presentation/atoms/FilterChip/FilterChip';
import { TextField } from '@/presentation/atoms/TextField/TextField';
import { SelectField, type SelectFieldOption } from '@/presentation/atoms/SelectField/SelectField';
import { notify } from '@/presentation/organisms/DialogHost/dialog-store';
import { MATCH_CONDITION_LABELS } from '@/presentation/organisms/MatchCard/match-display';
import { RivalPlayerFormModal } from '@/presentation/organisms/RivalPlayerFormModal/RivalPlayerFormModal';
import { FormModalSheet } from '@/presentation/templates/FormModalSheet/FormModalSheet';
import { useModalForm } from '@/presentation/hooks/useModalForm';
import { useEditModal } from '@/presentation/hooks/useEditModal';
import type { RivalPlayerFormData } from '@/presentation/organisms/RivalTeamFormModal/rival-roster';
import {
  EMPTY_ROSTER_DRAFT,
  applyRosterOperations,
  divisionRivalSuggestions,
  planRosterOperations,
  removeDraftPlayer,
  resolveMatchRivalRoster,
  rosterRows,
  saveDraftPlayer,
  type RosterRow,
} from './match-rival-roster';
import { MatchRivalRosterSection } from './MatchRivalRosterSection';
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

const EMPTY_FORM: MatchFormData = {
  divisionId: '',
  rivalTeamName: '',
  dateTime: '',
  condition: 'HOME',
  tournament: '',
  venue: '',
};

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
  const divisions = useClubStore((state) => state.divisions);
  const teams = useClubStore((state) => state.teams);
  const rivalTeams = useClubStore((state) => state.rivalTeams);
  const role = useClubStore((state) => state.currentUser.role);
  const addMatch = useClubStore((state) => state.addMatch);
  const updateMatch = useClubStore((state) => state.updateMatch);
  const createRivalTeam = useClubStore((state) => state.createRivalTeam);
  const addRivalPlayer = useClubStore((state) => state.addRivalPlayer);
  const updateRivalPlayer = useClubStore((state) => state.updateRivalPlayer);
  const removeRivalPlayer = useClubStore((state) => state.removeRivalPlayer);

  const canManageRoster = can(role, 'MANAGE_MATCHES');
  // Rival roster changes stay in the form until the match is saved (S16).
  const [rosterDraft, setRosterDraft] = useState(EMPTY_ROSTER_DRAFT);
  const playerForm = useEditModal<RivalPlayer>();
  const draftKeyCounter = useRef(0);

  const divisionOptions: SelectFieldOption[] = divisions.map((d) => ({ value: d.id, label: d.name }));

  // Recomputed on every open, so a new match always starts at the next kickoff.
  const defaults = useMemo((): MatchFormData => {
    if (!isOpen) return EMPTY_FORM;
    const divisionExists = (id: string | undefined) => divisions.some((d) => d.id === id);
    return matchToEdit
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
        };
  }, [isOpen, matchToEdit, defaultDivisionId, divisions]);
  const {
    control,
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useModalForm({ schema: MatchFormSchema, isOpen, defaults });

  const [divisionId, rivalName] = useWatch({ control, name: ['divisionId', 'rivalTeamName'] });
  const roster = resolveMatchRivalRoster(rivalTeams, divisionId, rivalName);
  const baseline = roster.kind === 'FOUND' ? roster.team.players : [];
  const rows = rosterRows(baseline, rosterDraft);
  const hasPendingRoster = planRosterOperations(roster, divisionId, rosterDraft).length > 0;
  const suggestions = divisionRivalSuggestions(rivalTeams, divisionId);
  const divisionName = divisions.find((d) => d.id === divisionId)?.name ?? '';
  const rosterName = roster.kind === 'FOUND' ? roster.team.name : roster.kind === 'MISSING' ? roster.name : '';

  // Every way out (Cancelar, close button, Escape, overlay, save) drops the draft.
  const close = () => {
    setRosterDraft(EMPTY_ROSTER_DRAFT);
    playerForm.close();
    onClose();
  };

  const openPlayerForm = (row: RosterRow | null) =>
    playerForm.open(row && { id: row.key, dorsal: row.dorsal, firstName: row.firstName, lastName: row.lastName });

  const saveDraftRow = (data: RivalPlayerFormData) => {
    draftKeyCounter.current += 1;
    const result = saveDraftPlayer(
      baseline,
      rosterDraft,
      data,
      playerForm.item?.id ?? null,
      `draft-${draftKeyCounter.current}`
    );
    if (!result.ok) return result;
    setRosterDraft(result.draft);
    return { ok: true as const };
  };

  /** Turns the roster draft into rival-team actions once the match is saved; refusals keep the match. */
  const saveRosterDraft = async (data: MatchFormData) => {
    if (!canManageRoster) return;
    const savedRoster = resolveMatchRivalRoster(rivalTeams, data.divisionId, data.rivalTeamName);
    const refusals = applyRosterOperations(
      planRosterOperations(savedRoster, data.divisionId, rosterDraft),
      savedRoster.kind === 'FOUND' ? savedRoster.team.id : null,
      { createRivalTeam, addRivalPlayer, updateRivalPlayer, removeRivalPlayer }
    );
    if (refusals.length === 0) return;
    await notify({
      title: 'El partido se guardó, pero no todo el plantel rival',
      message: refusals.join('\n'),
      tone: 'warning',
    });
  };

  const onSubmit = async (data: MatchFormData) => {
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
        ...(teamChanged && { rosterOwnPlayerIds: [], startingLineupOwn: [] }),
      });
    } else {
      addMatch({ ...fields, clubId: CLUB_PROFILE.id });
    }
    const rosterSaved = saveRosterDraft(data);
    close();
    await rosterSaved;
  };

  return (
    <>
      <FormModalSheet
        isOpen={isOpen}
        onClose={close}
        title={matchToEdit ? 'Editar partido' : 'Nuevo partido'}
        submitLabel={matchToEdit ? 'Guardar cambios' : 'Crear partido'}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit(onSubmit)}
        formClassName={styles.form}
      >
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
          autoComplete="off"
          error={errors.rivalTeamName?.message}
          {...register('rivalTeamName')}
        />
        {suggestions.length > 0 && (
          <FilterChipGroup label="Rivales de esta división" className={styles.fullRow}>
            {suggestions.map((rival) => (
              <FilterChip
                key={rival.id}
                label={rival.name}
                pressed={roster.kind === 'FOUND' && roster.team.id === rival.id}
                onClick={() => setValue('rivalTeamName', rival.name, { shouldDirty: true, shouldValidate: true })}
              />
            ))}
          </FilterChipGroup>
        )}
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

        {roster.kind !== 'NONE' && (
          <MatchRivalRosterSection
            roster={roster}
            rows={rows}
            divisionName={divisionName}
            rosterName={rosterName}
            canManageRoster={canManageRoster}
            hasPendingRoster={hasPendingRoster}
            onEditPlayer={openPlayerForm}
            onRemovePlayer={(rowKey) => setRosterDraft(removeDraftPlayer(baseline, rosterDraft, rowKey))}
          />
        )}
      </FormModalSheet>
      {/* Sibling, not child: the match sheet is transformed by its animation and already holds a form. */}
      <RivalPlayerFormModal
        isOpen={isOpen && playerForm.isOpen}
        onClose={playerForm.close}
        team={null}
        teamName={rosterName}
        playerToEdit={playerForm.item}
        onSave={saveDraftRow}
      />
    </>
  );
};
