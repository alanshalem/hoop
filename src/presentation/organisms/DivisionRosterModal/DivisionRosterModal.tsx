'use client';

import React from 'react';
import { Award, Users } from 'lucide-react';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { ModalSheet } from '@/presentation/molecules/ModalSheet/ModalSheet';
import { EmptyState } from '@/presentation/molecules/EmptyState/EmptyState';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { LineupPlayerRow } from '@/presentation/organisms/LineupPlayerRow/LineupPlayerRow';
import { coachNames } from '@/presentation/organisms/DivisionFormModal/division-staff';
import { getTeamRosterPlayers, isCalledUpTo } from './team-roster';
import styles from './DivisionRosterModal.module.css';

export interface DivisionRosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Kept by the parent while the sheet animates out. */
  divisionId: string | null;
}

/** Read-only roster of a division's team (own players plus called-up juveniles). */
export const DivisionRosterModal: React.FC<DivisionRosterModalProps> = ({ isOpen, onClose, divisionId }) => {
  const divisions = useClubStore((state) => state.divisions);
  const teams = useClubStore((state) => state.teams);
  const players = useClubStore((state) => state.players);
  const coaches = useClubStore((state) => state.coaches);

  const division = divisions.find((d) => d.id === divisionId);
  const team = teams.find((t) => t.divisionId === divisionId);
  const coach = coaches.find((c) => c.id === team?.headCoachId);
  const assistants = coachNames(team?.assistantCoachIds ?? [], coaches);
  const roster = getTeamRosterPlayers(team, players);

  return (
    <ModalSheet
      isOpen={isOpen}
      onClose={onClose}
      title={division ? `Plantel · ${division.name}` : 'Plantel'}
      size="lg"
      footer={
        <TouchButton variant="secondary" onClick={onClose}>
          Cerrar
        </TouchButton>
      }
    >
      <div className={styles.summary}>
        <span className={styles.summaryItem}>
          <Users size={ICON_SIZE.sm} aria-hidden="true" />
          <span className="tabular-nums">{roster.length}</span> jugadores
        </span>
        <span className={styles.summaryItem}>
          <Award size={ICON_SIZE.sm} aria-hidden="true" />
          {coach ? coach.name : 'Sin entrenador asignado'}
        </span>
        {assistants.length > 0 && (
          <span className={styles.summaryItem}>Ayudantes: {assistants.join(', ')}</span>
        )}
        {team && <span className={styles.summaryItem}>Temporada {team.season}</span>}
      </div>

      {roster.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Plantel vacío"
          description="Asigna jugadores a esta división desde la pantalla de Jugadores."
        />
      ) : (
        <ul className={styles.list}>
          {roster.map((player) => {
            const calledUp = isCalledUpTo(player, team);
            return (
              <li key={player.id}>
                <LineupPlayerRow
                  player={player}
                  tag={calledUp ? 'Convocado' : undefined}
                  meta={
                    player.medicalNote ? (
                      <span className={styles.medicalNote}>{player.medicalNote}</span>
                    ) : undefined
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </ModalSheet>
  );
};
