import React from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import clsx from 'clsx';
import type { Match } from '@/core/domain/entities/match.types';
import { FIBA_MAX_ROSTER, FIBA_STARTERS, type LineupIssue } from '@/core/domain/rules/lineup-rules';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { MatchStatusBadge } from '@/presentation/organisms/MatchCard/MatchStatusBadge';
import type { LineupMode } from '../lineup-state';
import styles from './LineupStatusPanel.module.css';

export interface LineupStatusPanelProps {
  match: Match;
  mode: LineupMode;
  canEdit: boolean;
  rosterCount: number;
  starterCount: number;
  /** Lineup rule issues (SETUP only). */
  issues: LineupIssue[];
  injuredInRoster: number;
}

/** Match status, roster and starter counters, and what the user can still do. */
export const LineupStatusPanel: React.FC<LineupStatusPanelProps> = ({
  match,
  mode,
  canEdit,
  rosterCount,
  starterCount,
  issues,
  injuredInRoster,
}) => (
  <section className={styles.statusPanel} aria-label="Estado de la convocatoria" data-tour="lineup-status">
    <div className={styles.statusTop}>
      <MatchStatusBadge status={match.status} detail={mode === 'IN_PLAY' ? match.currentQuarter : undefined} />
      <div className={styles.counters}>
        <span
          className={clsx(
            styles.counter,
            rosterCount >= FIBA_STARTERS && rosterCount <= FIBA_MAX_ROSTER && styles.counterOk
          )}
        >
          <span className={clsx(styles.counterValue, 'tabular-nums')}>
            {rosterCount}/{FIBA_MAX_ROSTER}
          </span>
          <span className={styles.counterLabel}>Convocados</span>
        </span>
        <span className={clsx(styles.counter, starterCount === FIBA_STARTERS && styles.counterOk)}>
          <span className={clsx(styles.counterValue, 'tabular-nums')}>
            {starterCount}/{FIBA_STARTERS}
          </span>
          <span className={styles.counterLabel}>Titulares</span>
        </span>
      </div>
    </div>

    <ul className={styles.messages}>
      {mode === 'SETUP' &&
        (issues.length === 0 ? (
          <li className={clsx(styles.message, styles.messageOk)}>
            <CheckCircle2 size={ICON_SIZE.sm} aria-hidden="true" />
            Convocatoria y quinteto listos para el salto inicial.
          </li>
        ) : (
          issues.map((issue) => (
            <li key={issue.code} className={clsx(styles.message, styles.messageWarning)}>
              <AlertCircle size={ICON_SIZE.sm} aria-hidden="true" />
              {issue.message}
            </li>
          ))
        ))}
      {injuredInRoster > 0 && mode !== 'FINISHED' && (
        <li className={clsx(styles.message, styles.messageWarning)}>
          <AlertCircle size={ICON_SIZE.sm} aria-hidden="true" />
          {injuredInRoster === 1
            ? 'Hay 1 jugador lesionado en la convocatoria: revisa su parte médico.'
            : `Hay ${injuredInRoster} jugadores lesionados en la convocatoria: revisa sus partes médicos.`}
        </li>
      )}
      {mode === 'IN_PLAY' && (
        <li className={clsx(styles.message, styles.messageInfo)}>
          <Info size={ICON_SIZE.sm} aria-hidden="true" />
          El partido está en juego: el quinteto inicial queda bloqueado y solo se pueden sumar
          jugadores a la convocatoria.
        </li>
      )}
      {mode === 'FINISHED' && (
        <li className={clsx(styles.message, styles.messageInfo)}>
          <Info size={ICON_SIZE.sm} aria-hidden="true" />
          Partido finalizado: la convocatoria es de solo lectura.
        </li>
      )}
      {mode !== 'FINISHED' && !canEdit && (
        <li className={clsx(styles.message, styles.messageInfo)}>
          <Info size={ICON_SIZE.sm} aria-hidden="true" />
          Tu rol no puede modificar la convocatoria ni el quinteto.
        </li>
      )}
    </ul>
  </section>
);
