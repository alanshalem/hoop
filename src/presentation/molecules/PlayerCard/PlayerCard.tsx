'use client';

import React from 'react';
import clsx from 'clsx';
import { Player } from '@/core/domain/entities/club.types';
import { JerseyBadge, JerseyState } from '@/presentation/atoms/JerseyBadge/JerseyBadge';
import { StatBadge } from '@/presentation/atoms/StatBadge/StatBadge';
import { FoulDots } from '@/presentation/atoms/FoulDots/FoulDots';
import { StatusPill } from '@/presentation/atoms/StatusPill/StatusPill';
import styles from './PlayerCard.module.css';

export interface PlayerCardProps {
  player: Player;
  points?: number;
  fouls?: number;
  isOnCourt?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  className?: string;
}

export const PlayerCard: React.FC<PlayerCardProps> = ({
  player,
  points = 0,
  fouls = 0,
  isOnCourt = false,
  isSelected = false,
  onClick,
  className,
}) => {
  // Determine jersey state
  let jerseyState: JerseyState = 'default';
  if (fouls >= 5) {
    jerseyState = 'fouledOut';
  } else if (fouls === 4) {
    jerseyState = 'foulWarning';
  } else if (isOnCourt) {
    jerseyState = 'onCourt';
  } else {
    jerseyState = 'bench';
  }

  return (
    <button
      type="button"
      className={clsx(
        styles.playerCard,
        isOnCourt && styles.onCourt,
        jerseyState === 'fouledOut' && styles.fouledOut,
        isSelected && styles.selected,
        className
      )}
      onClick={onClick}
      aria-pressed={isSelected}
      aria-label={`Jugador ${player.firstName} ${player.lastName}, Dorsal ${player.dorsal}, ${points} puntos, ${fouls} faltas${isOnCourt ? ', en cancha' : ''}`}
    >
      <div className={styles.leftSection}>
        <JerseyBadge dorsal={player.dorsal} state={jerseyState} size="md" />
        <div className={styles.playerInfo}>
          <span className={styles.lastName}>{player.lastName}</span>
          <div className={styles.metaRow}>
            <StatBadge position={player.position} />
            <span className={styles.firstName}>{player.firstName}</span>
            {player.status !== 'ACTIVE' && (
              <StatusPill status={player.status} />
            )}
          </div>
        </div>
      </div>

      <div className={styles.rightSection}>
        <div className={styles.pointsRow}>
          <span className={styles.pointsBadge}>{points}</span>
          <span className={styles.pointsLabel}>pts</span>
        </div>
        <FoulDots fouls={fouls} />
      </div>
    </button>
  );
};

