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

/**
 * Navigation, sync status, rival quick actions (points and team fouls) and match
 * closing. The console has no app shell, so this is its only sync indicator; it
 * sits at the start so the scrolling toolbar never hides it on phones.
 */
export const ConsoleToolbar: React.FC<ConsoleToolbarProps> = ({
  matchId,
  rivalName,
  readOnly,
  recordingLocked = false,
  onRivalAction,
  onFinish,
}) => (
  <div className={styles.toolbar}>
    <div className={styles.startGroup}>
      <LinkButton href="/matches" variant="ghost" leftIcon={<ArrowLeft size={ICON_SIZE.md} />} className={styles.navBtn}>
        Partidos
      </LinkButton>
      <SyncStatusIndicator compact className={styles.syncStatus} />
    </div>

    {!readOnly && !recordingLocked && (
      <div
        className={styles.rivalGroup}
        role="group"
        aria-label={`Acciones del rival ${rivalName}`}
        data-tour="live-rival"
      >
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
      <LinkButton
        href={`/matches/${matchId}/stats`}
        variant="secondary"
        leftIcon={<BarChart3 size={ICON_SIZE.md} />}
        className={styles.navBtn}
      >
        Planilla
      </LinkButton>
      {!readOnly && (
        <TouchButton
          variant="danger"
          leftIcon={<Flag size={ICON_SIZE.md} />}
          className={styles.navBtn}
          onClick={onFinish}
          data-tour="live-finish"
        >
          Finalizar
        </TouchButton>
      )}
    </div>
  </div>
);
