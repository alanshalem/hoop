'use client';

import React from 'react';
import { X } from 'lucide-react';
import type { Player } from '@/core/domain/entities/club.types';
import clsx from 'clsx';
import { FIBA_FOUL_TROUBLE_THRESHOLD } from '@/core/domain/rules/basketball-rules';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import styles from './OwnFoulPicker.module.css';

export interface OwnFoulPickerProps {
  /** The whole match roster by dorsal. */
  players: readonly Player[];
  /** Fouls each player already has in the match. */
  foulsByPlayer: ReadonlyMap<string, number>;
  onPick: (playerId: string) => void;
  onClose: () => void;
}

/** Second step of the own "Falta": who committed it, with the fouls each player already has. */
export const OwnFoulPicker: React.FC<OwnFoulPickerProps> = ({ players, foulsByPlayer, onPick, onClose }) => (
  <div className={styles.picker} role="group" aria-label="¿Quién hizo la falta?">
    <span className={styles.title}>¿Quién hizo la falta?</span>
    <div className={styles.players}>
      {players.map((player) => {
        const fouls = foulsByPlayer.get(player.id) ?? 0;
        return (
          <button
            key={player.id}
            type="button"
            className={clsx(styles.playerBtn, fouls >= FIBA_FOUL_TROUBLE_THRESHOLD && styles.foulTrouble)}
            aria-label={`#${player.dorsal} ${player.firstName} ${player.lastName}, ${fouls} ${fouls === 1 ? 'falta' : 'faltas'}`}
            onClick={() => onPick(player.id)}
          >
            <span className={styles.dorsal}>{player.dorsal}</span>
            <span className={styles.name}>{player.lastName}</span>
            <span className={styles.fouls}>{'●'.repeat(fouls)}</span>
          </button>
        );
      })}
    </div>
    <button type="button" className={styles.closeBtn} aria-label="Cancelar la falta" onClick={onClose}>
      <X size={ICON_SIZE.md} aria-hidden="true" />
    </button>
  </div>
);
