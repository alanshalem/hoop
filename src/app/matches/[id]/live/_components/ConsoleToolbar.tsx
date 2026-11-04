'use client';

import React from 'react';
import { ArrowLeft, BarChart3, Flag, ShieldAlert, Undo2 } from 'lucide-react';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { LinkButton } from '@/presentation/atoms/LinkButton/LinkButton';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { SyncStatusIndicator } from '@/presentation/organisms/SyncStatusIndicator/SyncStatusIndicator';
import styles from './ConsoleToolbar.module.css';

export interface ConsoleToolbarProps {
  matchId: string;
  rivalName: string;
  readOnly: boolean;
  /** Hides the rival fouls (halftime: no plays are recorded). */
  recordingLocked?: boolean;
  /** Enables "Deshacer falta". */
  hasRivalFoul: boolean;
  onRivalFoul: () => void;
  onUndoRivalFoul: () => void;
  onFinish: () => void;
}

/**
 * Navigation, sync status, rival fouls (they light the rival bonus; rival points
 * come from Puntos recibidos, S15) and match closing. The console has no app
 * shell, so this is its only sync indicator; it sits at the start so the
 * scrolling toolbar never hides it on phones.
 */
export const ConsoleToolbar: React.FC<ConsoleToolbarProps> = ({
  matchId,
  rivalName,
  readOnly,
  recordingLocked = false,
  hasRivalFoul,
  onRivalFoul,
  onUndoRivalFoul,
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
        aria-label={`Faltas del rival ${rivalName}`}
        data-tour="live-rival"
      >
        <span className={styles.rivalLabel}>
          <ShieldAlert size={ICON_SIZE.sm} aria-hidden="true" />
          <span className={styles.rivalName}>{rivalName}</span>
        </span>
        <button
          type="button"
          className={styles.rivalFoulBtn}
          aria-label="Registrar falta del rival"
          onClick={onRivalFoul}
        >
          Falta
        </button>
        <button
          type="button"
          className={styles.rivalUndoBtn}
          aria-label="Deshacer la última falta del rival"
          onClick={onUndoRivalFoul}
          disabled={!hasRivalFoul}
        >
          <Undo2 size={ICON_SIZE.sm} aria-hidden="true" />
          Deshacer falta
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
