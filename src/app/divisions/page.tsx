'use client';

import React, { useState } from 'react';
import { Award, CalendarRange, Pencil, Plus, Shield, Trash2, Users } from 'lucide-react';
import clsx from 'clsx';
import type { Division } from '@/core/domain/entities/club.types';
import { can } from '@/core/domain/rules/permissions';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { CLUB_PROFILE } from '@/core/infrastructure/mocks/seed-data';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { TabletAppShell } from '@/presentation/templates/TabletAppShell/TabletAppShell';
import { PageHeader } from '@/presentation/molecules/PageHeader/PageHeader';
import { EmptyState } from '@/presentation/molecules/EmptyState/EmptyState';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { IconButton } from '@/presentation/atoms/IconButton/IconButton';
import { confirm } from '@/presentation/organisms/DialogHost/dialog-store';
import { DivisionFormModal } from '@/presentation/organisms/DivisionFormModal/DivisionFormModal';
import { DIVISION_CATEGORY_LABELS } from '@/presentation/organisms/DivisionFormModal/division-labels';
import { DivisionRosterModal } from '@/presentation/organisms/DivisionRosterModal/DivisionRosterModal';
import { getTeamRosterPlayers } from '@/presentation/organisms/DivisionRosterModal/team-roster';
import { useScreenTour } from '@/presentation/tour/useScreenTour';
import styles from './page.module.css';

export default function DivisionsPage() {
  const divisions = useClubStore((state) => state.divisions);
  const teams = useClubStore((state) => state.teams);
  const players = useClubStore((state) => state.players);
  const coaches = useClubStore((state) => state.coaches);
  const role = useClubStore((state) => state.currentUser.role);
  const deleteDivision = useClubStore((state) => state.deleteDivision);

  const canManage = can(role, 'MANAGE_DIVISIONS');
  useScreenTour('divisions');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [divisionToEdit, setDivisionToEdit] = useState<Division | null>(null);
  const [isRosterOpen, setIsRosterOpen] = useState(false);
  const [rosterDivisionId, setRosterDivisionId] = useState<string | null>(null);

  const openForm = (division: Division | null) => {
    setDivisionToEdit(division);
    setIsFormOpen(true);
  };

  const openRoster = (divisionId: string) => {
    setRosterDivisionId(divisionId);
    setIsRosterOpen(true);
  };

  const handleDelete = async (division: Division, playerCount: number) => {
    const accepted = await confirm({
      title: 'Eliminar división',
      message: `Se eliminará "${division.name}" junto con su equipo. ${
        playerCount > 0
          ? `Sus ${playerCount} jugadores quedarán sin equipo asignado.`
          : 'No tiene jugadores asignados.'
      } Los partidos de la división se conservan en el calendario.`,
      confirmLabel: 'Eliminar división',
      tone: 'danger',
    });
    if (accepted) deleteDivision(division.id);
  };

  return (
    <TabletAppShell>
      <div className="page-container">
        <PageHeader
          title="Divisiones"
          subtitle={`Estructura deportiva del club, planteles y cuerpo técnico · Temporada ${CLUB_PROFILE.season}`}
          actions={
            canManage && (
              <TouchButton
                leftIcon={<Plus size={ICON_SIZE.md} />}
                onClick={() => openForm(null)}
                data-tour="divisions-create"
              >
                Nueva división
              </TouchButton>
            )
          }
        />

        {divisions.length === 0 ? (
          <EmptyState
            icon={Shield}
            title="Todavía no hay divisiones"
            description={
              canManage
                ? 'Crea la primera división para armar su plantel y su calendario.'
                : 'Un administrador debe crear las divisiones del club.'
            }
            action={
              canManage && (
                <TouchButton leftIcon={<Plus size={ICON_SIZE.md} />} onClick={() => openForm(null)}>
                  Nueva división
                </TouchButton>
              )
            }
          />
        ) : (
          <ul className={styles.grid}>
            {divisions.map((division) => {
              const team = teams.find((t) => t.divisionId === division.id);
              const playerCount = getTeamRosterPlayers(team, players).length;
              const coach = coaches.find((c) => c.id === team?.headCoachId);

              return (
                <li key={division.id} className={styles.divisionCard} data-reveal data-tour="division-card">
                  <div className={styles.cardTop}>
                    <h2 className={styles.divisionName}>{division.name}</h2>
                    <span className={styles.categoryTag}>{DIVISION_CATEGORY_LABELS[division.category]}</span>
                  </div>
                  {division.description && <p className={styles.description}>{division.description}</p>}

                  <dl className={styles.stats}>
                    <div className={styles.statItem}>
                      <dt className={styles.statLabel}>
                        <Users size={ICON_SIZE.sm} aria-hidden="true" />
                        Jugadores
                      </dt>
                      <dd className={clsx(styles.statValue, 'tabular-nums')}>{playerCount}</dd>
                    </div>
                    <div className={styles.statItem}>
                      <dt className={styles.statLabel}>
                        <CalendarRange size={ICON_SIZE.sm} aria-hidden="true" />
                        Temporada
                      </dt>
                      <dd className={clsx(styles.statValue, 'tabular-nums')}>
                        {team?.season ?? CLUB_PROFILE.season}
                      </dd>
                    </div>
                  </dl>

                  <p className={clsx(styles.coach, !coach && styles.coachMissing)}>
                    <Award size={ICON_SIZE.sm} aria-hidden="true" />
                    {coach ? `Entrenador: ${coach.name}` : 'Sin entrenador asignado'}
                  </p>

                  <div className={styles.cardActions}>
                    <TouchButton
                      variant="secondary"
                      leftIcon={<Users size={ICON_SIZE.md} />}
                      className={styles.rosterButton}
                      onClick={() => openRoster(division.id)}
                      data-tour="division-roster"
                    >
                      Ver plantel
                    </TouchButton>
                    {canManage && (
                      <>
                        <IconButton
                          aria-label={`Editar ${division.name}`}
                          variant="secondary"
                          icon={<Pencil size={ICON_SIZE.md} />}
                          onClick={() => openForm(division)}
                          data-tour="division-edit"
                        />
                        <IconButton
                          aria-label={`Eliminar ${division.name}`}
                          variant="danger"
                          icon={<Trash2 size={ICON_SIZE.md} />}
                          onClick={() => handleDelete(division, playerCount)}
                        />
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <DivisionFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        divisionToEdit={divisionToEdit}
      />
      <DivisionRosterModal
        isOpen={isRosterOpen}
        onClose={() => setIsRosterOpen(false)}
        divisionId={rosterDivisionId}
      />
    </TabletAppShell>
  );
}
