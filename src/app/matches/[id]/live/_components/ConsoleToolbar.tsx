'use client';

import React from 'react';
import { ArrowLeft, BarChart3, Flag, ShieldAlert, Undo2, Users } from 'lucide-react';
import clsx from 'clsx';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { LinkButton } from '@/presentation/atoms/LinkButton/LinkButton';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { SyncStatusIndicator } from '@/presentation/organisms/SyncStatusIndicator/SyncStatusIndicator';
import styles from './ConsoleToolbar.module.css';

export interface ConsoleToolbarProps {
  matchId: string;
  ownName: string;
  rivalName: string;
  readOnly: boolean;
  /** Hides the team fouls (halftime: no plays are recorded). */
  recordingLocked?: boolean;
  /** Enables the own "Deshacer falta". */
  hasOwnFoul: boolean;
  /** The own "Falta" opened the player picker. */
  ownFoulPickerOpen: boolean;
  onOwnFoul: () => void;
  onUndoOwnFoul: () => void;
  /** Enables "Deshacer falta". */
  hasRivalFoul: boolean;
  onRivalFoul: () => void;
  onUndoRivalFoul: () => void;
  onFinish: () => void;
}

/**
 * Navigation, sync status, own fouls (per player), rival fouls (they light the
 * rival bonus; rival points come from Puntos recibidos, S15) and match closing. The console has no app
 * shell, so this is its only sync indicator; it sits at the start so the
 * scrolling toolbar never hides it on phones.
 */
export const ConsoleToolbar: React.FC<ConsoleToolbarProps> = ({
  matchId,
  ownName,
  rivalName,
  readOnly,
  recordingLocked = false,
  hasOwnFoul,
  ownFoulPickerOpen,
  onOwnFoul,
  onUndoOwnFoul,
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
      <div className={styles.foulGroups}>
        <div className={clsx(styles.rivalGroup, styles.ownGroup)} role="group" aria-label={`Faltas de ${ownName}`} data-tour="live-own-fouls">
          <span className={clsx(styles.rivalLabel, styles.ownLabel)}>
            <Users size={ICON_SIZE.sm} aria-hidden="true" />
            <span className={styles.rivalName}>{ownName}</span>
          </span>
          <button
            type="button"
            className={styles.rivalFoulBtn}
            aria-label="Registrar falta de un jugador propio"
            aria-expanded={ownFoulPickerOpen}
            onClick={onOwnFoul}
          >
            Falta
          </button>
          <button
            type="button"
            className={styles.rivalUndoBtn}
            aria-label={`Deshacer la última falta de ${ownName}`}
            onClick={onUndoOwnFoul}
            disabled={!hasOwnFoul}
          >
            <Undo2 size={ICON_SIZE.sm} aria-hidden="true" />
            Deshacer falta
          </button>
        </div>
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
