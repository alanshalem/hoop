import React from 'react';
import { CheckCircle2, HeartPulse } from 'lucide-react';
import clsx from 'clsx';
import type { Player } from '@/core/domain/entities/club.types';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { SectionCard } from '@/presentation/molecules/SectionCard/SectionCard';
import { JerseyBadge } from '@/presentation/atoms/JerseyBadge/JerseyBadge';
import { StatusPill } from '@/presentation/atoms/StatusPill/StatusPill';
import styles from './MedicalAlertsCard.module.css';

export interface MedicalAlertsCardProps {
  /** Injured or suspended players, already sorted. */
  players: Player[];
  divisionNameOf: (teamId: string | undefined) => string;
}

export const MedicalAlertsCard: React.FC<MedicalAlertsCardProps> = ({ players, divisionNameOf }) => (
  <SectionCard title="Alertas médicas" icon={HeartPulse} description="Jugadores lesionados o suspendidos de todo el club">
    {players.length === 0 ? (
      <p className={clsx(styles.emptyLine, styles.emptyLineOk)}>
        <CheckCircle2 size={ICON_SIZE.sm} aria-hidden="true" />
        Plantel completo: no hay lesionados ni suspendidos.
      </p>
    ) : (
      <ul className={styles.alertsList}>
        {players.map((player) => (
          <li key={player.id} className={styles.alertItem}>
            <JerseyBadge dorsal={player.dorsal} size="sm" />
            <span className={styles.alertInfo}>
              <span className={styles.alertName}>
                {player.lastName}, {player.firstName}
                <span className={styles.alertDivision}> · {divisionNameOf(player.teamId)}</span>
              </span>
              <span className={clsx(styles.alertNote, !player.medicalNote && styles.alertNoteMissing)}>
                {player.medicalNote ?? 'Sin parte médico cargado.'}
              </span>
            </span>
            <StatusPill status={player.status} />
          </li>
        ))}
      </ul>
    )}
  </SectionCard>
);
