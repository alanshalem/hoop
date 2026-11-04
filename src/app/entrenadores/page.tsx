'use client';

import React from 'react';
import { BadgeCheck, Lock, Pencil, Plus, Shield, Trash2, UserCog } from 'lucide-react';
import clsx from 'clsx';
import { COACH_ROLE_LABELS, type Coach } from '@/core/domain/entities/coach.types';
import { can } from '@/core/domain/rules/permissions';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { MISSING_VALUE } from '@/presentation/player-display';
import { TabletAppShell } from '@/presentation/templates/TabletAppShell/TabletAppShell';
import { PageHeader } from '@/presentation/molecules/PageHeader/PageHeader';
import { EmptyState } from '@/presentation/molecules/EmptyState/EmptyState';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { IconButton } from '@/presentation/atoms/IconButton/IconButton';
import { confirm, notify } from '@/presentation/organisms/DialogHost/dialog-store';
import { CoachFormModal } from '@/presentation/organisms/CoachFormModal/CoachFormModal';
import {
  COACH_RECORD_REFUSAL_MESSAGES,
  coachAssignments,
  deleteCoachMessage,
  formatCoachAssignments,
  sortCoaches,
} from '@/presentation/organisms/CoachFormModal/coach-form';
import { useEditModal } from '@/presentation/hooks/useEditModal';
import { useScreenTour } from '@/presentation/tour/useScreenTour';
import styles from './page.module.css';

/** Coaching staff records without login (S5); divisions assign them as head coach or assistants. */
export default function CoachesPage() {
  const coaches = useClubStore((state) => state.coaches);
  const teams = useClubStore((state) => state.teams);
  const divisions = useClubStore((state) => state.divisions);
  const role = useClubStore((state) => state.currentUser.role);
  const deleteCoach = useClubStore((state) => state.deleteCoach);

  const canManage = can(role, 'MANAGE_DIVISIONS');
  useScreenTour('entrenadores');

  const form = useEditModal<Coach>();

  const handleDelete = async (coach: Coach) => {
    const accepted = await confirm({
      title: 'Eliminar entrenador',
      message: deleteCoachMessage(coach, coachAssignments(coach.id, teams, divisions)),
      confirmLabel: 'Eliminar entrenador',
      tone: 'danger',
    });
    if (!accepted) return;
    const result = deleteCoach(coach.id);
    if (!result.ok) {
      await notify({
        title: 'No se pudo eliminar el entrenador',
        message: COACH_RECORD_REFUSAL_MESSAGES[result.reason],
        tone: 'warning',
      });
    }
  };

  return (
    <TabletAppShell>
      <div className="page-container">
        <PageHeader
          title="Entrenadores"
          subtitle="Cuerpo técnico del club. Son fichas sin usuario: se asignan a cada división como entrenador principal o ayudante."
          backHref="/divisions"
          backLabel="Volver a divisiones"
          actions={
            canManage && (
              <TouchButton
                leftIcon={<Plus size={ICON_SIZE.md} />}
                onClick={() => form.open(null)}
                data-tour="coaches-create"
              >
                Nuevo entrenador
              </TouchButton>
            )
          }
        />

        {!canManage && (
          <p className={styles.readOnlyNote}>
            <Lock size={ICON_SIZE.sm} aria-hidden="true" />
            Solo el administrador puede cargar y editar entrenadores.
          </p>
        )}

        {coaches.length === 0 ? (
          <EmptyState
            icon={UserCog}
            title="Todavía no hay entrenadores"
            description={
              canManage
                ? 'Carga al cuerpo técnico para asignarlo a las divisiones.'
                : 'El administrador carga al cuerpo técnico del club.'
            }
            action={
              canManage && (
                <TouchButton leftIcon={<Plus size={ICON_SIZE.md} />} onClick={() => form.open(null)}>
                  Nuevo entrenador
                </TouchButton>
              )
            }
          />
        ) : (
          <ul className={styles.list}>
            {sortCoaches(coaches).map((coach) => {
              const assignments = coachAssignments(coach.id, teams, divisions);
              return (
                <li key={coach.id} className={styles.coachCard} data-reveal data-tour="coach-card">
                  <div className={styles.cardTop}>
                    <h2 className={styles.coachName}>{coach.name}</h2>
                    <span className={clsx(styles.roleTag, coach.role === 'ASSISTANT' && styles.roleTagAssistant)}>
                      {COACH_ROLE_LABELS[coach.role]}
                    </span>
                  </div>

                  <dl className={styles.meta}>
                    <div className={styles.metaItem}>
                      <dt>
                        <BadgeCheck size={ICON_SIZE.sm} aria-hidden="true" />
                        Licencia
                      </dt>
                      <dd className="tabular-nums">{coach.license ?? MISSING_VALUE}</dd>
                    </div>
                    <div className={styles.metaItem}>
                      <dt>
                        <Shield size={ICON_SIZE.sm} aria-hidden="true" />
                        Divisiones
                      </dt>
                      <dd className={clsx(assignments.length === 0 && styles.unassigned)}>
                        {formatCoachAssignments(assignments)}
                      </dd>
                    </div>
                  </dl>

                  {canManage && (
                    <div className={styles.cardActions}>
                      <TouchButton
                        variant="secondary"
                        leftIcon={<Pencil size={ICON_SIZE.md} />}
                        className={styles.editButton}
                        onClick={() => form.open(coach)}
                        data-tour="coach-edit"
                      >
                        Editar
                      </TouchButton>
                      <IconButton
                        aria-label={`Eliminar a ${coach.name}`}
                        variant="danger"
                        icon={<Trash2 size={ICON_SIZE.md} />}
                        onClick={() => void handleDelete(coach)}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <CoachFormModal isOpen={form.isOpen} onClose={form.close} coachToEdit={form.item} />
    </TabletAppShell>
  );
}
