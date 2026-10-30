'use client';

import React, { useRef } from 'react';
import clsx from 'clsx';
import { ArrowLeftRight, Lock, OctagonAlert, UserRound } from 'lucide-react';
import type { Player } from '@/core/domain/entities/club.types';
import type { PlayByPlayEventType } from '@/core/domain/entities/match.types';
import { isPlayerFouledOut } from '@/core/domain/rules/basketball-rules';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { MOTION, gsap } from '@/presentation/motion/motion';
import { useMotion } from '@/presentation/motion/useMotion';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import type { TouchButtonVariant } from '@/presentation/atoms/TouchButton/touch-button-styles';
import styles from './QuickActionPad.module.css';

export interface QuickActionPadProps {
  /** On-court player the actions are recorded for. */
  selectedPlayer: Player | null;
  playerFouls?: number;
  readOnly?: boolean;
  onRecordAction: (type: PlayByPlayEventType) => void;
  /** Opens the substitution flow for the selected player (fifth foul). */
  onRequestSub: () => void;
}

interface PadAction {
  type: PlayByPlayEventType;
  label: string;
  variant: TouchButtonVariant;
  className?: string;
}

interface PadGroup {
  title: string;
  columns: 2 | 3;
  actions: PadAction[];
}

const PAD_GROUPS: PadGroup[] = [
  {
    title: 'Convertidos',
    columns: 3,
    actions: [
      { type: 'FT_MADE', label: '+1 TL', variant: 'success' },
      { type: 'FG2_MADE', label: '+2', variant: 'primary' },
      { type: 'FG3_MADE', label: '+3', variant: 'primary' },
    ],
  },
  {
    title: 'Fallados',
    columns: 3,
    actions: [
      { type: 'FT_MISS', label: 'TL', variant: 'secondary' },
      { type: 'FG2_MISS', label: '2P', variant: 'secondary' },
      { type: 'FG3_MISS', label: '3P', variant: 'secondary' },
    ],
  },
  {
    title: 'Rebotes y juego',
    columns: 2,
    actions: [
      { type: 'OREB', label: 'Reb. ofensivo', variant: 'courtAction' },
      { type: 'DREB', label: 'Reb. defensivo', variant: 'courtAction' },
      { type: 'AST', label: 'Asistencia', variant: 'courtAction' },
      { type: 'STL', label: 'Robo', variant: 'courtAction' },
      { type: 'BLK', label: 'Tapa', variant: 'courtAction' },
      { type: 'TOV', label: 'Pérdida', variant: 'courtAction', className: styles.turnoverBtn },
    ],
  },
  {
    title: 'Faltas',
    columns: 3,
    actions: [
      { type: 'FOUL_PERSONAL', label: 'Personal', variant: 'secondary', className: styles.foulBtn },
      { type: 'FOUL_TECHNICAL', label: 'Técnica', variant: 'danger' },
      { type: 'FOUL_UNSPORTSMANLIKE', label: 'Antidep.', variant: 'danger' },
    ],
  },
];

export const QuickActionPad: React.FC<QuickActionPadProps> = ({
  selectedPlayer,
  playerFouls = 0,
  readOnly = false,
  onRecordAction,
  onRequestSub,
}) => {
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const isFouledOut = selectedPlayer !== null && isPlayerFouledOut(playerFouls);

  useMotion(
    () => {
      if (!isFouledOut || !bannerRef.current) return;
      gsap.fromTo(
        bannerRef.current,
        { scale: 0.85, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.35, ease: MOTION.ease.pop }
      );
    },
    { dependencies: [isFouledOut, selectedPlayer?.id] }
  );

  const renderBody = () => {
    if (readOnly) {
      return (
        <div className={styles.placeholder}>
          <Lock size={ICON_SIZE.lg} aria-hidden="true" />
          <p>Tu rol no puede registrar acciones en vivo.</p>
        </div>
      );
    }

    if (!selectedPlayer) {
      return (
        <div className={styles.placeholder}>
          <UserRound size={ICON_SIZE.lg} aria-hidden="true" />
          <p>Selecciona un jugador en cancha para habilitar las acciones.</p>
        </div>
      );
    }

    return (
      <>
        {isFouledOut && (
          <div ref={bannerRef} className={styles.exclusionBanner} role="alert">
            <span className={styles.exclusionTitle}>
              <OctagonAlert size={ICON_SIZE.md} aria-hidden="true" />
              5 faltas: jugador excluido
            </span>
            <p className={styles.exclusionText}>Reglamento FIBA: debe abandonar el juego de inmediato.</p>
            <TouchButton
              variant="danger"
              size="lg"
              fullWidth
              leftIcon={<ArrowLeftRight size={ICON_SIZE.md} />}
              onClick={onRequestSub}
            >
              Realizar sustitución
            </TouchButton>
          </div>
        )}

        {PAD_GROUPS.map((group) => (
          <section key={group.title} className={styles.group} aria-label={group.title}>
            <h3 className={styles.groupTitle}>{group.title}</h3>
            <div className={clsx(styles.buttonGrid, group.columns === 3 ? styles.buttonGrid3 : styles.buttonGrid2)}>
              {group.actions.map((action) => (
                <TouchButton
                  key={action.type}
                  variant={action.variant}
                  size="lg"
                  className={clsx(styles.padBtn, action.className)}
                  disabled={isFouledOut}
                  onClick={() => onRecordAction(action.type)}
                >
                  {action.label}
                </TouchButton>
              ))}
            </div>
          </section>
        ))}
      </>
    );
  };

  return (
    <aside className={clsx(styles.container, 'no-scrollbar')} aria-label="Pad de acciones rápidas">
      <div className={styles.padHeader}>
        <h2 className={styles.title}>Acciones rápidas</h2>
        {selectedPlayer && !readOnly && (
          <span className={styles.playerTag}>
            #{selectedPlayer.dorsal} {selectedPlayer.lastName}
          </span>
        )}
      </div>
      {renderBody()}
    </aside>
  );
};
