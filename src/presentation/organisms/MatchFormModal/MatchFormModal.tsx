'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Save, Trash2, UserPlus } from 'lucide-react';
import { Match, MatchConditionSchema } from '@/core/domain/entities/match.types';
import type { RivalPlayer } from '@/core/domain/entities/rival.types';
import { can } from '@/core/domain/rules/permissions';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { CLUB_PROFILE } from '@/core/infrastructure/club-profile';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { ModalSheet } from '@/presentation/molecules/ModalSheet/ModalSheet';
import { FilterChipGroup } from '@/presentation/molecules/FilterChipGroup/FilterChipGroup';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { IconButton } from '@/presentation/atoms/IconButton/IconButton';
import { FilterChip } from '@/presentation/atoms/FilterChip/FilterChip';
import { TextField } from '@/presentation/atoms/TextField/TextField';
import { SelectField, type SelectFieldOption } from '@/presentation/atoms/SelectField/SelectField';
import { notify } from '@/presentation/organisms/DialogHost/dialog-store';
import { MATCH_CONDITION_LABELS } from '@/presentation/organisms/MatchCard/match-display';
import { RivalPlayerFormModal } from '@/presentation/organisms/RivalPlayerFormModal/RivalPlayerFormModal';
import {
  formatRivalPlayerCount,
  type RivalPlayerFormData,
} from '@/presentation/organisms/RivalTeamFormModal/rival-roster';
import {
  EMPTY_ROSTER_DRAFT,
  applyRosterOperations,
  divisionRivalSuggestions,
  formatMissingRoster,
  planRosterOperations,
  removeDraftPlayer,
  resolveMatchRivalRoster,
  rosterRows,
  saveDraftPlayer,
  type RosterRow,
} from './match-rival-roster';
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
  const rosterTitleId = useId();
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
  const [playerForm, setPlayerForm] = useState<{ isOpen: boolean; player: RivalPlayer | null }>({
    isOpen: false,
    player: null,
  });
  const draftKeyCounter = useRef(0);

  const divisionOptions: SelectFieldOption[] = divisions.map((d) => ({ value: d.id, label: d.name }));

  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
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
    setPlayerForm((current) => ({ ...current, isOpen: false }));
    onClose();
  };

  const openPlayerForm = (row: RosterRow | null) =>
    setPlayerForm({
      isOpen: true,
      player: row && { id: row.key, dorsal: row.dorsal, firstName: row.firstName, lastName: row.lastName },
    });

  const saveDraftRow = (data: RivalPlayerFormData) => {
    draftKeyCounter.current += 1;
    const result = saveDraftPlayer(
      baseline,
      rosterDraft,
      data,
      playerForm.player?.id ?? null,
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
        ...(teamChanged && { rosterOwnPlayerIds: [], startingLineupOwn: [], activeLineupOwn: [] }),
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
      <ModalSheet
        isOpen={isOpen}
        onClose={close}
        title={matchToEdit ? 'Editar partido' : 'Nuevo partido'}
        footer={
          <>
            <TouchButton variant="ghost" onClick={close}>
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
            <section className={styles.roster} aria-labelledby={rosterTitleId}>
              <div className={styles.rosterHeader}>
                <h3 id={rosterTitleId} className={styles.rosterTitle}>
                  Plantel rival
                </h3>
                <span className={styles.rosterCount}>{formatRivalPlayerCount(rows.length)}</span>
              </div>
              {roster.kind === 'MISSING' && (
                <p className={styles.rosterNote}>{formatMissingRoster(roster.name, divisionName)}</p>
              )}
              {roster.kind === 'FOUND' && rows.length === 0 && (
                <p className={styles.rosterNote}>Todavía no hay jugadores cargados.</p>
              )}
              {rows.length > 0 && (
                <ul className={styles.rosterList} aria-label={`Plantel de ${rosterName}`}>
                  {rows.map((row) => (
                    <li key={row.key} className={styles.playerRow}>
                      <span className={styles.dorsal}>{row.dorsal}</span>
                      <span className={styles.playerName}>
                        {row.firstName} <strong>{row.lastName}</strong>
                      </span>
                      {canManageRoster && (
                        <span className={styles.playerActions}>
                          <IconButton
                            aria-label={`Editar a #${row.dorsal} ${row.lastName}`}
                            variant="ghost"
                            icon={<Pencil size={ICON_SIZE.md} />}
                            onClick={() => openPlayerForm(row)}
                          />
                          <IconButton
                            aria-label={`Quitar a #${row.dorsal} ${row.lastName}`}
                            variant="ghost"
                            icon={<Trash2 size={ICON_SIZE.md} />}
                            onClick={() => setRosterDraft(removeDraftPlayer(baseline, rosterDraft, row.key))}
                          />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canManageRoster && (
                <TouchButton
                  variant="secondary"
                  fullWidth
                  leftIcon={<UserPlus size={ICON_SIZE.md} />}
                  onClick={() => openPlayerForm(null)}
                >
                  Agregar jugador
                </TouchButton>
              )}
              {hasPendingRoster && (
                <p className={styles.rosterPending}>
                  {roster.kind === 'MISSING'
                    ? `Al guardar el partido se crea el rival ${roster.name} en ${divisionName} con estos jugadores.`
                    : 'Los cambios del plantel se guardan junto con el partido.'}
                </p>
              )}
            </section>
          )}
        </form>
      </ModalSheet>
      {/* Sibling, not child: the match sheet is transformed by its animation and already holds a form. */}
      <RivalPlayerFormModal
        isOpen={isOpen && playerForm.isOpen}
        onClose={() => setPlayerForm((current) => ({ ...current, isOpen: false }))}
        team={null}
        teamName={rosterName}
        playerToEdit={playerForm.player}
        onSave={saveDraftRow}
      />
    </>
  );
};
