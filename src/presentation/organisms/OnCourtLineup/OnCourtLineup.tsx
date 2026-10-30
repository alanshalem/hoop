'use client';

import React, { useRef } from 'react';
import clsx from 'clsx';
import { ArrowLeftRight, Ban, LogIn, LogOut, X } from 'lucide-react';
import type { Player } from '@/core/domain/entities/club.types';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { MOTION, gsap } from '@/presentation/motion/motion';
import { useMotion } from '@/presentation/motion/useMotion';
import { PlayerCard } from '@/presentation/molecules/PlayerCard/PlayerCard';
import styles from './OnCourtLineup.module.css';

/** Substitution being assembled; it completes when both players are chosen. */
export interface SubstitutionDraft {
  playerOutId: string | null;
  playerInId: string | null;
}

export const EMPTY_SUBSTITUTION: SubstitutionDraft = { playerOutId: null, playerInId: null };

export interface OnCourtLineupProps {
  onCourtPlayers: Player[];
  benchPlayers: Player[];
  playerLines: Record<string, { points: number; fouls: number }>;
  fouledOutIds: ReadonlySet<string>;
  selectedPlayerId: string | null;
  /** `null` = not in substitution mode. */
  substitution: SubstitutionDraft | null;
  readOnly?: boolean;
  onSelectPlayer: (playerId: string) => void;
  onSubstitutionChange: (draft: SubstitutionDraft | null) => void;
  onSubstitute: (playerOutId: string, playerInId: string) => void;
}

const shortName = (player: Player | undefined) => (player ? `#${player.dorsal} ${player.lastName}` : '');

export const OnCourtLineup: React.FC<OnCourtLineupProps> = ({
  onCourtPlayers,
  benchPlayers,
  playerLines,
  fouledOutIds,
  selectedPlayerId,
  substitution,
  readOnly = false,
  onSelectPlayer,
  onSubstitutionChange,
  onSubstitute,
}) => {
  const containerRef = useRef<HTMLElement | null>(null);
  const previousOnCourt = useRef<string[]>(onCourtPlayers.map((p) => p.id));
  const onCourtKey = onCourtPlayers.map((p) => p.id).join('|');

  // Highlight the players that just entered the court.
  useMotion(
    () => {
      const entered = onCourtPlayers.filter((p) => !previousOnCourt.current.includes(p.id));
      previousOnCourt.current = onCourtPlayers.map((p) => p.id);
      for (const player of entered) {
        gsap.fromTo(
          `[data-player-id="${player.id}"]`,
          { x: 24, opacity: 0, scale: 0.96 },
          { x: 0, opacity: 1, scale: 1, duration: 0.35, ease: MOTION.ease.pop }
        );
      }
    },
    { dependencies: [onCourtKey], scope: containerRef }
  );

  const isSubMode = substitution !== null;
  const playerOut = onCourtPlayers.find((p) => p.id === substitution?.playerOutId);
  const playerIn = benchPlayers.find((p) => p.id === substitution?.playerInId);

  const applyDraft = (draft: SubstitutionDraft) => {
    if (draft.playerOutId && draft.playerInId) {
      onSubstitute(draft.playerOutId, draft.playerInId);
      return;
    }
    onSubstitutionChange(draft);
  };

  const handleCourtClick = (player: Player) => {
    if (!isSubMode) {
      onSelectPlayer(player.id);
      return;
    }
    const playerOutId = substitution.playerOutId === player.id ? null : player.id;
    applyDraft({ ...substitution, playerOutId });
  };

  const handleBenchClick = (player: Player) => {
    const draft = substitution ?? EMPTY_SUBSTITUTION;
    const playerInId = draft.playerInId === player.id ? null : player.id;
    applyDraft({ ...draft, playerInId });
  };

  const renderHint = () => {
    if (playerOut && !playerIn) {
      return (
        <>
          <LogIn size={ICON_SIZE.sm} aria-hidden="true" />
          <span>
            Sale <strong>{shortName(playerOut)}</strong>. Toca el jugador de la banca que entra.
          </span>
        </>
      );
    }
    if (playerIn && !playerOut) {
      return (
        <>
          <LogOut size={ICON_SIZE.sm} aria-hidden="true" />
          <span>
            Entra <strong>{shortName(playerIn)}</strong>. Toca el jugador en cancha que sale.
          </span>
        </>
      );
    }
    return (
      <>
        <ArrowLeftRight size={ICON_SIZE.sm} aria-hidden="true" />
        <span>Toca el jugador en cancha que sale y el de la banca que entra.</span>
      </>
    );
  };

  return (
    <aside ref={containerRef} className={clsx(styles.container, 'no-scrollbar')} aria-label="Quinteto y banca">
      <div className={styles.sectionHeader}>
        <h2 className={styles.title}>En cancha ({onCourtPlayers.length})</h2>
        {!readOnly && (
          <button
            type="button"
            className={clsx(styles.subBtn, isSubMode && styles.subModeActive)}
            onClick={() => onSubstitutionChange(isSubMode ? null : EMPTY_SUBSTITUTION)}
            aria-pressed={isSubMode}
          >
            {isSubMode ? <X size={ICON_SIZE.md} aria-hidden="true" /> : <ArrowLeftRight size={ICON_SIZE.md} aria-hidden="true" />}
            <span>{isSubMode ? 'Cancelar' : 'Cambio'}</span>
          </button>
        )}
      </div>

      {isSubMode && (
        <p className={styles.subHint} role="status">
          {renderHint()}
        </p>
      )}

      <ul className={styles.playersColumn}>
        {onCourtPlayers.map((player) => {
          const line = playerLines[player.id];
          return (
            <li
              key={player.id}
              data-player-id={player.id}
              className={clsx(styles.playerItem, substitution?.playerOutId === player.id && styles.playerOutTarget)}
            >
              <PlayerCard
                player={player}
                points={line?.points ?? 0}
                fouls={line?.fouls ?? 0}
                isOnCourt
                isSelected={!isSubMode && selectedPlayerId === player.id}
                onClick={readOnly ? undefined : () => handleCourtClick(player)}
              />
            </li>
          );
        })}
      </ul>

      <div className={styles.sectionHeader}>
        <h2 className={styles.title}>Banca ({benchPlayers.length})</h2>
      </div>
      {!readOnly && !isSubMode && benchPlayers.length > 0 && (
        <p className={styles.benchNote}>Toca un jugador de la banca para iniciar un cambio.</p>
      )}

      {benchPlayers.length === 0 ? (
        <p className={styles.benchNote}>No hay suplentes convocados.</p>
      ) : (
        <ul className={styles.playersColumn}>
          {benchPlayers.map((player) => {
            const line = playerLines[player.id];
            const isFouledOut = fouledOutIds.has(player.id);
            return (
              <li
                key={player.id}
                data-player-id={player.id}
                className={clsx(
                  styles.playerItem,
                  substitution?.playerInId === player.id && styles.playerInTarget,
                  isFouledOut && styles.playerDisabled
                )}
                inert={isFouledOut}
              >
                <PlayerCard
                  player={player}
                  points={line?.points ?? 0}
                  fouls={line?.fouls ?? 0}
                  onClick={isFouledOut || readOnly ? undefined : () => handleBenchClick(player)}
                />
                {isFouledOut && (
                  <span className={styles.fouledOutTag}>
                    <Ban size={ICON_SIZE.xs} aria-hidden="true" />
                    Excluido
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
};
