'use client';

import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { AlertOctagon, Flame } from 'lucide-react';
import { Player } from '@/core/domain/entities/club.types';
import { PlayByPlayEventType } from '@/core/domain/entities/match.types';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import clsx from 'clsx';
import styles from './QuickActionPad.module.css';

export interface QuickActionPadProps {
  selectedPlayer: Player | null;
  playerFouls?: number;
  onRecordAction: (type: PlayByPlayEventType) => void;
  onRequestSub?: () => void;
}

export const QuickActionPad: React.FC<QuickActionPadProps> = ({
  selectedPlayer,
  playerFouls = 0,
  onRecordAction,
  onRequestSub,
}) => {
  const alertRef = useRef<HTMLDivElement | null>(null);
  const isFouledOut = playerFouls >= 5;

  useEffect(() => {
    if (isFouledOut && alertRef.current) {
      gsap.fromTo(
        alertRef.current,
        { scale: 0.85, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(1.5)' }
      );
    }
  }, [isFouledOut]);

  if (!selectedPlayer) {
    return (
      <aside className={styles.container} aria-label="Pad de acciones rápidas">
        <div className={styles.padHeader}>
          <span className={styles.title}>Acciones Rápidas</span>
        </div>
        <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
          <p>👈 Selecciona un jugador en cancha para habilitar el teclado numérico y las acciones.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className={clsx(styles.container, 'no-scrollbar')} aria-label="Pad de acciones rápidas">
      <div className={styles.padHeader}>
        <span className={styles.title}>Acciones Rápidas</span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-orange)', fontWeight: 'bold' }}>
          #{selectedPlayer.dorsal} {selectedPlayer.lastName}
        </span>
      </div>

      {/* 5TH FOUL EXCLUSION ALERT */}
      {isFouledOut && (
        <div ref={alertRef} className={styles.exclusionBanner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertOctagon size={18} />
            <span>5 FALTAS: JUGADOR EXPULSADO</span>
          </div>
          <p style={{ fontSize: '11px', fontWeight: 'normal' }}>
            Reglamento FIBA: Debe abandonar el juego de inmediato.
          </p>
          <TouchButton
            variant="danger"
            size="md"
            onClick={onRequestSub}
            style={{ marginTop: '4px' }}
          >
            REALIZAR SUSTITUCIÓN AHORA
          </TouchButton>
        </div>
      )}

      <div className={styles.actionGrid}>
        {/* TIROS CONVERTIDOS */}
        <div>
          <span className={styles.groupTitle}>Tiros Convertidos</span>
          <div className={styles.buttonGrid3}>
            <TouchButton
              variant="success"
              size="lg"
              disabled={isFouledOut}
              onClick={() => onRecordAction('FT_MADE')}
            >
              +1 TL
            </TouchButton>
            <TouchButton
              variant="primary"
              size="lg"
              disabled={isFouledOut}
              onClick={() => onRecordAction('FG2_MADE')}
            >
              +2 DOBLE
            </TouchButton>
            <TouchButton
              variant="primary"
              size="lg"
              disabled={isFouledOut}
              onClick={() => onRecordAction('FG3_MADE')}
            >
              +3 TRIPLE
            </TouchButton>
          </div>
        </div>

        {/* TIROS ERRADOS */}
        <div>
          <span className={styles.groupTitle}>Tiros Fallados</span>
          <div className={styles.buttonGrid3}>
            <TouchButton
              variant="secondary"
              size="md"
              disabled={isFouledOut}
              onClick={() => onRecordAction('FT_MISS')}
            >
              Fallo TL
            </TouchButton>
            <TouchButton
              variant="secondary"
              size="md"
              disabled={isFouledOut}
              onClick={() => onRecordAction('FG2_MISS')}
            >
              Fallo 2P
            </TouchButton>
            <TouchButton
              variant="secondary"
              size="md"
              disabled={isFouledOut}
              onClick={() => onRecordAction('FG3_MISS')}
            >
              Fallo 3P
            </TouchButton>
          </div>
        </div>

        {/* REBOTES Y JUEGO */}
        <div>
          <span className={styles.groupTitle}>Rebotes y Juego</span>
          <div className={styles.buttonGrid2}>
            <TouchButton
              variant="courtAction"
              size="md"
              disabled={isFouledOut}
              onClick={() => onRecordAction('OREB')}
            >
              REB OFENSIVO
            </TouchButton>
            <TouchButton
              variant="courtAction"
              size="md"
              disabled={isFouledOut}
              onClick={() => onRecordAction('DREB')}
            >
              REB DEFENSIVO
            </TouchButton>
            <TouchButton
              variant="courtAction"
              size="md"
              disabled={isFouledOut}
              onClick={() => onRecordAction('AST')}
            >
              ASISTENCIA
            </TouchButton>
            <TouchButton
              variant="courtAction"
              size="md"
              disabled={isFouledOut}
              onClick={() => onRecordAction('STL')}
            >
              ROBO
            </TouchButton>
            <TouchButton
              variant="courtAction"
              size="md"
              disabled={isFouledOut}
              onClick={() => onRecordAction('BLK')}
            >
              TAPÓN
            </TouchButton>
            <TouchButton
              variant="danger"
              size="md"
              disabled={isFouledOut}
              onClick={() => onRecordAction('TOV')}
            >
              PÉRDIDA
            </TouchButton>
          </div>
        </div>

        {/* FALTAS */}
        <div>
          <span className={styles.groupTitle}>Faltas</span>
          <div className={styles.buttonGrid2}>
            <TouchButton
              variant="secondary"
              size="md"
              disabled={isFouledOut}
              onClick={() => onRecordAction('FOUL_PERSONAL')}
              style={{ borderColor: 'var(--color-amber)', color: 'var(--color-amber)' }}
            >
              FALTA PERSONAL
            </TouchButton>
            <TouchButton
              variant="danger"
              size="md"
              disabled={isFouledOut}
              onClick={() => onRecordAction('FOUL_TECHNICAL')}
            >
              FALTA TÉCNICA
            </TouchButton>
          </div>
        </div>
      </div>
    </aside>
  );
};
