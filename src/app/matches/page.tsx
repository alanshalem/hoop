'use client';

import React, { useState } from 'react';
import { BarChart3, CalendarDays, ClipboardList, Pencil, Plus, Radio, Swords, Trash2, Users } from 'lucide-react';
import type { Match, MatchStatus } from '@/core/domain/entities/match.types';
import { can } from '@/core/domain/rules/permissions';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { TabletAppShell } from '@/presentation/templates/TabletAppShell/TabletAppShell';
import { PageHeader } from '@/presentation/molecules/PageHeader/PageHeader';
import { EmptyState } from '@/presentation/molecules/EmptyState/EmptyState';
import { FilterChipGroup } from '@/presentation/molecules/FilterChipGroup/FilterChipGroup';
import { FilterChip } from '@/presentation/atoms/FilterChip/FilterChip';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { LinkButton } from '@/presentation/atoms/LinkButton/LinkButton';
import { IconButton } from '@/presentation/atoms/IconButton/IconButton';
import { confirm } from '@/presentation/organisms/DialogHost/dialog-store';
import { MatchCard } from '@/presentation/organisms/MatchCard/MatchCard';
import {
  formatMatchDate,
  isMatchInPlay,
  sortMatchesForCalendar,
} from '@/presentation/organisms/MatchCard/match-display';
import { MatchFormModal } from '@/presentation/organisms/MatchFormModal/MatchFormModal';
import { useScreenTour } from '@/presentation/tour/useScreenTour';
import styles from './page.module.css';

const ALL = 'ALL';
const NO_DIVISION = 'NO_DIVISION';
const DELETED_DIVISION_LABEL = 'División eliminada';

type StatusFilter = typeof ALL | 'IN_PLAY' | Exclude<MatchStatus, 'LIVE' | 'HALFTIME'>;

const STATUS_CHIPS: Array<{ value: StatusFilter; label: string }> = [
  { value: ALL, label: 'Todos' },
  { value: 'IN_PLAY', label: 'En vivo' },
  { value: 'SCHEDULED', label: 'Programados' },
  { value: 'FINISHED', label: 'Finalizados' },
];

const matchesStatus = (match: Match, filter: StatusFilter): boolean => {
  if (filter === ALL) return true;
  if (filter === 'IN_PLAY') return isMatchInPlay(match);
  return match.status === filter;
};

export default function MatchesPage() {
  const matches = useClubStore((state) => state.matches);
  const divisions = useClubStore((state) => state.divisions);
  const activeDivisionId = useClubStore((state) => state.activeDivisionId);
  const role = useClubStore((state) => state.currentUser.role);
  const deleteMatch = useClubStore((state) => state.deleteMatch);

  const canManageMatches = can(role, 'MANAGE_MATCHES');
  const canManageLineup = can(role, 'MANAGE_LINEUP');
  useScreenTour('matches');

  const [statusFilter, setStatusFilter] = useState<StatusFilter>(ALL);
  const [divisionFilter, setDivisionFilter] = useState<string>(ALL);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [matchToEdit, setMatchToEdit] = useState<Match | null>(null);

  const divisionKeyOf = (match: Match) =>
    divisions.some((d) => d.id === match.divisionId) ? match.divisionId : NO_DIVISION;
  const divisionNameOf = (match: Match) =>
    divisions.find((d) => d.id === match.divisionId)?.name ?? DELETED_DIVISION_LABEL;
  const matchesDivision = (match: Match, filter: string) =>
    filter === ALL || divisionKeyOf(match) === filter;

  const visibleMatches = sortMatchesForCalendar(
    matches.filter((m) => matchesStatus(m, statusFilter) && matchesDivision(m, divisionFilter))
  );

  const hasOrphans = matches.some((m) => divisionKeyOf(m) === NO_DIVISION);
  const divisionChips = [
    { value: ALL, label: 'Todas' },
    ...divisions.map((d) => ({ value: d.id, label: d.name })),
    ...(hasOrphans ? [{ value: NO_DIVISION, label: DELETED_DIVISION_LABEL }] : []),
  ];

  const openForm = (match: Match | null) => {
    setMatchToEdit(match);
    setIsFormOpen(true);
  };

  const handleDelete = async (match: Match) => {
    const { date, time } = formatMatchDate(match.date);
    const playsNote =
      match.status === 'SCHEDULED' ? '' : ' También se eliminan su planilla, sus jugadas y su resultado.';
    const accepted = await confirm({
      title: 'Eliminar partido',
      message: `Se eliminará el partido contra ${match.rivalTeamName} del ${date} a las ${time} h.${playsNote} Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar partido',
      tone: 'danger',
    });
    if (accepted) deleteMatch(match.id);
  };

  const renderActions = (match: Match) => {
    if (isMatchInPlay(match)) {
      return (
        <>
          <LinkButton
            href={`/matches/${match.id}/lineup`}
            variant="secondary"
            leftIcon={<Users size={ICON_SIZE.md} />}
            data-tour="match-lineup"
          >
            Convocatoria
          </LinkButton>
          <LinkButton
            href={`/matches/${match.id}/live`}
            leftIcon={<Radio size={ICON_SIZE.md} />}
            data-tour="match-live"
          >
            Consola en vivo
          </LinkButton>
        </>
      );
    }

    if (match.status === 'FINISHED') {
      return (
        <>
          {canManageMatches && (
            <IconButton
              aria-label={`Eliminar partido contra ${match.rivalTeamName}`}
              variant="danger"
              icon={<Trash2 size={ICON_SIZE.md} />}
              onClick={() => handleDelete(match)}
            />
          )}
          <LinkButton
            href={`/matches/${match.id}/stats`}
            variant="secondary"
            leftIcon={<BarChart3 size={ICON_SIZE.md} />}
            data-tour="match-stats"
          >
            Planilla box score
          </LinkButton>
        </>
      );
    }

    return (
      <>
        {canManageMatches && (
          <>
            <IconButton
              aria-label={`Editar partido contra ${match.rivalTeamName}`}
              variant="secondary"
              icon={<Pencil size={ICON_SIZE.md} />}
              onClick={() => openForm(match)}
            />
            <IconButton
              aria-label={`Eliminar partido contra ${match.rivalTeamName}`}
              variant="danger"
              icon={<Trash2 size={ICON_SIZE.md} />}
              onClick={() => handleDelete(match)}
            />
          </>
        )}
        <LinkButton
          href={`/matches/${match.id}/lineup`}
          variant={canManageLineup ? 'primary' : 'secondary'}
          leftIcon={<ClipboardList size={ICON_SIZE.md} />}
          data-tour="match-lineup"
        >
          {canManageLineup ? 'Armar quinteto' : 'Ver convocatoria'}
        </LinkButton>
      </>
    );
  };

  return (
    <TabletAppShell>
      <div className="page-container">
        <PageHeader
          title="Partidos"
          subtitle="Partidos en juego primero, luego los próximos por fecha y al final los finalizados, del más reciente al más antiguo."
          actions={
            <>
              {/* Rival rosters: the phone top bar has no room for them (S14). */}
              <LinkButton
                href="/rivales"
                variant="secondary"
                leftIcon={<Swords size={ICON_SIZE.md} />}
                data-tour="matches-rivals"
              >
                Rivales
              </LinkButton>
              {canManageMatches && (
                <TouchButton
                  leftIcon={<Plus size={ICON_SIZE.md} />}
                  onClick={() => openForm(null)}
                  data-tour="matches-create"
                >
                  Nuevo partido
                </TouchButton>
              )}
            </>
          }
        />

        <section className={styles.filterPanel} aria-label="Filtros" data-tour="matches-filters">
          <FilterChipGroup label="Estado">
            {STATUS_CHIPS.map((chip) => (
              <FilterChip
                key={chip.value}
                label={chip.label}
                pressed={statusFilter === chip.value}
                count={matches.filter((m) => matchesStatus(m, chip.value) && matchesDivision(m, divisionFilter)).length}
                onClick={() => setStatusFilter(chip.value)}
              />
            ))}
          </FilterChipGroup>
          <FilterChipGroup label="División">
            {divisionChips.map((chip) => (
              <FilterChip
                key={chip.value}
                label={chip.label}
                pressed={divisionFilter === chip.value}
                count={matches.filter((m) => matchesDivision(m, chip.value) && matchesStatus(m, statusFilter)).length}
                onClick={() => setDivisionFilter(chip.value)}
              />
            ))}
          </FilterChipGroup>
        </section>

        {visibleMatches.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title={matches.length === 0 ? 'Todavía no hay partidos' : 'Sin partidos para estos filtros'}
            description={
              matches.length === 0
                ? 'Programa el primer partido de la temporada.'
                : 'Cambia el estado o la división para ver otros partidos.'
            }
            action={
              canManageMatches &&
              matches.length === 0 && (
                <TouchButton leftIcon={<Plus size={ICON_SIZE.md} />} onClick={() => openForm(null)}>
                  Nuevo partido
                </TouchButton>
              )
            }
          />
        ) : (
          <ul className={styles.list}>
            {visibleMatches.map((match) => (
              <li key={match.id} data-reveal data-tour="match-card">
                <MatchCard match={match} divisionName={divisionNameOf(match)} actions={renderActions(match)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <MatchFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        matchToEdit={matchToEdit}
        defaultDivisionId={divisionFilter !== ALL && divisionFilter !== NO_DIVISION ? divisionFilter : activeDivisionId}
      />
    </TabletAppShell>
  );
}
