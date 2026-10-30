'use client';

import React from 'react';
import { ArrowLeft, BarChart3, Flag, ShieldAlert } from 'lucide-react';
import type { PlayByPlayEventType } from '@/core/domain/entities/match.types';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { LinkButton } from '@/presentation/atoms/LinkButton/LinkButton';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { SyncStatusIndicator } from '@/presentation/organisms/SyncStatusIndicator/SyncStatusIndicator';
import styles from './ConsoleToolbar.module.css';

export interface ConsoleToolbarProps {
  matchId: string;
  rivalName: string;
  readOnly: boolean;
  /** Hides the rival quick actions (halftime: no plays are recorded). */
  recordingLocked?: boolean;
  onRivalAction: (type: PlayByPlayEventType) => void;
  onFinish: () => void;
}

const RIVAL_ACTIONS: Array<{ type: PlayByPlayEventType; label: string; ariaLabel: string }> = [
  { type: 'FT_MADE', label: '+1', ariaLabel: 'Sumar 1 punto al rival' },
  { type: 'FG2_MADE', label: '+2', ariaLabel: 'Sumar 2 puntos al rival' },
  { type: 'FG3_MADE', label: '+3', ariaLabel: 'Sumar 3 puntos al rival' },
];

/** Navigation, rival quick actions (points and team fouls), sync status and match closing. */
export const ConsoleToolbar: React.FC<ConsoleToolbarProps> = ({
  matchId,
  rivalName,
  readOnly,
  recordingLocked = false,
  onRivalAction,
  onFinish,
}) => (
  <div className={styles.toolbar}>
    <LinkButton href="/matches" variant="ghost" leftIcon={<ArrowLeft size={ICON_SIZE.md} />} className={styles.navBtn}>
      Partidos
    </LinkButton>

    {!readOnly && !recordingLocked && (
      <div className={styles.rivalGroup} role="group" aria-label={`Acciones del rival ${rivalName}`}>
        <span className={styles.rivalLabel}>
          <ShieldAlert size={ICON_SIZE.sm} aria-hidden="true" />
          <span className={styles.rivalName}>{rivalName}</span>
        </span>
        {RIVAL_ACTIONS.map((action) => (
          <button
            key={action.type}
            type="button"
            className={styles.rivalBtn}
            aria-label={action.ariaLabel}
            onClick={() => onRivalAction(action.type)}
          >
            {action.label}
          </button>
        ))}
        <button
          type="button"
          className={styles.rivalFoulBtn}
          aria-label="Registrar falta del rival"
          onClick={() => onRivalAction('FOUL_PERSONAL')}
        >
          Falta
        </button>
      </div>
    )}

    <div className={styles.endGroup}>
      <SyncStatusIndicator compact className={styles.syncStatus} />
      <LinkButton
        href={`/matches/${matchId}/stats`}
        variant="secondary"
        leftIcon={<BarChart3 size={ICON_SIZE.md} />}
        className={styles.navBtn}
      >
        Planilla
      </LinkButton>
      {!readOnly && (
        <TouchButton variant="danger" leftIcon={<Flag size={ICON_SIZE.md} />} className={styles.navBtn} onClick={onFinish}>
          Finalizar
        </TouchButton>
      )}
    </div>
  </div>
);
