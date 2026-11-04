'use client';

import React, { useState } from 'react';
import { Link2, Lock, Pencil, Plus, Swords, Trash2, UserPlus } from 'lucide-react';
import clsx from 'clsx';
import type { RivalPlayer, RivalTeam } from '@/core/domain/entities/rival.types';
import { can } from '@/core/domain/rules/permissions';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { TabletAppShell } from '@/presentation/templates/TabletAppShell/TabletAppShell';
import { PageHeader } from '@/presentation/molecules/PageHeader/PageHeader';
import { SectionCard } from '@/presentation/molecules/SectionCard/SectionCard';
import { EmptyState } from '@/presentation/molecules/EmptyState/EmptyState';
import { FilterChipGroup } from '@/presentation/molecules/FilterChipGroup/FilterChipGroup';
import { FilterChip } from '@/presentation/atoms/FilterChip/FilterChip';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { IconButton } from '@/presentation/atoms/IconButton/IconButton';
import { confirm, notify } from '@/presentation/organisms/DialogHost/dialog-store';
import { RivalTeamFormModal } from '@/presentation/organisms/RivalTeamFormModal/RivalTeamFormModal';
import { RivalPlayerFormModal } from '@/presentation/organisms/RivalPlayerFormModal/RivalPlayerFormModal';
import {
  RIVAL_PLAYER_REFUSAL_MESSAGES,
  RIVAL_TEAM_REFUSAL_MESSAGES,
  countLinkedMatches,
  formatLinkedMatches,
  formatRivalPlayerCount,
  sortRivalPlayers,
} from '@/presentation/organisms/RivalTeamFormModal/rival-roster';
import { useScreenTour } from '@/presentation/tour/useScreenTour';
import styles from './page.module.css';

const ALL = 'ALL';
const NO_DIVISION = 'NO_DIVISION';
const DELETED_DIVISION_LABEL = 'División eliminada';

/** Rival rosters per division (S14): the live console offers them when charting a match. */
export default function RivalsPage() {
  const rivalTeams = useClubStore((state) => state.rivalTeams);
  const divisions = useClubStore((state) => state.divisions);
  const matches = useClubStore((state) => state.matches);
  const activeDivisionId = useClubStore((state) => state.activeDivisionId);
  const role = useClubStore((state) => state.currentUser.role);
  const deleteRivalTeam = useClubStore((state) => state.deleteRivalTeam);
  const removeRivalPlayer = useClubStore((state) => state.removeRivalPlayer);

  const canManage = can(role, 'MANAGE_MATCHES');
  useScreenTour('rivales');

  const [divisionFilter, setDivisionFilter] = useState<string>(ALL);
  const [isTeamFormOpen, setIsTeamFormOpen] = useState(false);
  const [teamToEdit, setTeamToEdit] = useState<RivalTeam | null>(null);
  const [isPlayerFormOpen, setIsPlayerFormOpen] = useState(false);
  const [playerTeamId, setPlayerTeamId] = useState<string | null>(null);
  const [playerToEdit, setPlayerToEdit] = useState<RivalPlayer | null>(null);

  const divisionKeyOf = (team: RivalTeam) =>
    divisions.some((d) => d.id === team.divisionId) ? team.divisionId : NO_DIVISION;
  const divisionNameOf = (team: RivalTeam) =>
    divisions.find((d) => d.id === team.divisionId)?.name ?? DELETED_DIVISION_LABEL;
  const matchesDivision = (team: RivalTeam, filter: string) => filter === ALL || divisionKeyOf(team) === filter;

  const visibleTeams = rivalTeams
    .filter((team) => matchesDivision(team, divisionFilter))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const hasOrphans = rivalTeams.some((team) => divisionKeyOf(team) === NO_DIVISION);
  const divisionChips = [
    { value: ALL, label: 'Todas' },
    ...divisions.map((d) => ({ value: d.id, label: d.name })),
    ...(hasOrphans ? [{ value: NO_DIVISION, label: DELETED_DIVISION_LABEL }] : []),
  ];

  // The player sheet reads the live team, so a renamed or edited roster shows at once.
  const playerTeam = rivalTeams.find((team) => team.id === playerTeamId) ?? null;
  const defaultDivisionId =
    divisionFilter !== ALL && divisionFilter !== NO_DIVISION ? divisionFilter : activeDivisionId;

  const openTeamForm = (team: RivalTeam | null) => {
    setTeamToEdit(team);
    setIsTeamFormOpen(true);
  };

  const openPlayerForm = (team: RivalTeam, player: RivalPlayer | null) => {
    setPlayerTeamId(team.id);
    setPlayerToEdit(player);
    setIsPlayerFormOpen(true);
  };

  const handleDeleteTeam = async (team: RivalTeam) => {
    const accepted = await confirm({
      title: 'Eliminar rival',
      message: `Se eliminará "${team.name}" con sus ${team.players.length} jugadores. Las entradas de la planilla ya cargadas se conservan, pero dejarán de mostrar el nombre del jugador rival.`,
      confirmLabel: 'Eliminar rival',
      tone: 'danger',
    });
    if (!accepted) return;
    const result = deleteRivalTeam(team.id);
    if (!result.ok) {
      await notify({
        title: 'No se pudo eliminar el rival',
        message: RIVAL_TEAM_REFUSAL_MESSAGES[result.reason],
        tone: 'warning',
      });
    }
  };

  const handleRemovePlayer = async (team: RivalTeam, player: RivalPlayer) => {
    const accepted = await confirm({
      title: 'Quitar jugador',
      message: `Se quitará a #${player.dorsal} ${player.firstName} ${player.lastName} del plantel de ${team.name}. Las entradas ya cargadas dejarán de mostrar su nombre.`,
      confirmLabel: 'Quitar jugador',
      tone: 'danger',
    });
    if (!accepted) return;
    const result = removeRivalPlayer(team.id, player.id);
    if (!result.ok) {
      await notify({
        title: 'No se pudo quitar el jugador',
        message: RIVAL_PLAYER_REFUSAL_MESSAGES[result.reason],
        tone: 'warning',
      });
    }
  };

  return (
    <TabletAppShell>
      <div className="page-container">
        <PageHeader
          title="Rivales"
          subtitle="Planteles de los equipos rivales por división. En la consola en vivo se elige quién convirtió o quién defendió."
          actions={
            canManage && (
              <TouchButton
                leftIcon={<Plus size={ICON_SIZE.md} />}
                onClick={() => openTeamForm(null)}
                disabled={divisions.length === 0}
                data-tour="rivals-create"
              >
                Nuevo rival
              </TouchButton>
            )
          }
        />

        {!canManage && (
          <p className={styles.readOnlyNote}>
            <Lock size={ICON_SIZE.sm} aria-hidden="true" />
            Solo el administrador y los entrenadores principales pueden editar los planteles rivales.
          </p>
        )}

        <section className={styles.filterPanel} aria-label="Filtros" data-tour="rivals-filters">
          <FilterChipGroup label="División">
            {divisionChips.map((chip) => (
              <FilterChip
                key={chip.value}
                label={chip.label}
                pressed={divisionFilter === chip.value}
                count={rivalTeams.filter((team) => matchesDivision(team, chip.value)).length}
                onClick={() => setDivisionFilter(chip.value)}
              />
            ))}
          </FilterChipGroup>
        </section>

        {visibleTeams.length === 0 ? (
          <EmptyState
            icon={Swords}
            title={rivalTeams.length === 0 ? 'Todavía no hay rivales' : 'Sin rivales en esta división'}
            description={
              canManage
                ? 'Carga un rival con el mismo nombre que tiene en los partidos para elegir a sus jugadores en vivo.'
                : 'El administrador o un entrenador principal carga los planteles rivales.'
            }
            action={
              canManage &&
              divisions.length > 0 && (
                <TouchButton leftIcon={<Plus size={ICON_SIZE.md} />} onClick={() => openTeamForm(null)}>
                  Nuevo rival
                </TouchButton>
              )
            }
          />
        ) : (
          <ul className={styles.list}>
            {visibleTeams.map((team) => {
              const linked = countLinkedMatches(team, rivalTeams, matches);
              return (
                <li key={team.id} data-reveal>
                  <SectionCard
                    title={team.name}
                    description={`${divisionNameOf(team)} · ${formatRivalPlayerCount(team.players.length)}`}
                    className={styles.teamCard}
                    data-tour="rival-card"
                    actions={
                      canManage && (
                        <>
                          <IconButton
                            aria-label={`Renombrar ${team.name}`}
                            variant="secondary"
                            icon={<Pencil size={ICON_SIZE.md} />}
                            onClick={() => openTeamForm(team)}
                            data-tour="rival-rename"
                          />
                          <IconButton
                            aria-label={`Eliminar ${team.name}`}
                            variant="danger"
                            icon={<Trash2 size={ICON_SIZE.md} />}
                            onClick={() => void handleDeleteTeam(team)}
                          />
                        </>
                      )
                    }
                  >
                    <p className={clsx(styles.linked, linked === 0 && styles.linkedNone)}>
                      <Link2 size={ICON_SIZE.sm} aria-hidden="true" />
                      {formatLinkedMatches(linked)}
                    </p>

                    {team.players.length === 0 ? (
                      <p className={styles.emptyRoster}>Todavía no hay jugadores cargados.</p>
                    ) : (
                      <ul className={styles.roster} aria-label={`Plantel de ${team.name}`}>
                        {sortRivalPlayers(team.players).map((player) => (
                          <li key={player.id} className={styles.playerRow} data-tour="rival-player">
                            <span className={styles.dorsal}>{player.dorsal}</span>
                            <span className={styles.playerName}>
                              {player.firstName} <strong>{player.lastName}</strong>
                            </span>
                            {canManage && (
                              <span className={styles.playerActions}>
                                <IconButton
                                  aria-label={`Editar a #${player.dorsal} ${player.lastName}`}
                                  variant="ghost"
                                  icon={<Pencil size={ICON_SIZE.md} />}
                                  onClick={() => openPlayerForm(team, player)}
                                />
                                <IconButton
                                  aria-label={`Quitar a #${player.dorsal} ${player.lastName}`}
                                  variant="ghost"
                                  icon={<Trash2 size={ICON_SIZE.md} />}
                                  onClick={() => void handleRemovePlayer(team, player)}
                                />
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {canManage && (
                      <TouchButton
                        variant="secondary"
                        fullWidth
                        leftIcon={<UserPlus size={ICON_SIZE.md} />}
                        onClick={() => openPlayerForm(team, null)}
                        className={styles.addPlayer}
                        data-tour="rival-add-player"
                      >
                        Agregar jugador
                      </TouchButton>
                    )}
                  </SectionCard>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <RivalTeamFormModal
        isOpen={isTeamFormOpen}
        onClose={() => setIsTeamFormOpen(false)}
        teamToEdit={teamToEdit}
        defaultDivisionId={defaultDivisionId}
      />
      <RivalPlayerFormModal
        isOpen={isPlayerFormOpen}
        onClose={() => setIsPlayerFormOpen(false)}
        team={playerTeam}
        playerToEdit={playerToEdit}
      />
    </TabletAppShell>
  );
}
