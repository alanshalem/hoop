'use client';

import React, { useRef, useState } from 'react';
import clsx from 'clsx';
import { Lock, Undo2, Users } from 'lucide-react';
import type { Player } from '@/core/domain/entities/club.types';
import {
  CHART_CATEGORIES,
  CHART_CATEGORY_LABELS,
  DEFAULT_CHART_POINTS,
  findChartCode,
  type ChartCatalog,
  type ChartCategory,
  type ChartPoints,
} from '@/core/domain/entities/chart.types';
import type { PlayByPlayEvent } from '@/core/domain/entities/match.types';
import { activeChartCodes } from '@/core/domain/rules/chart-catalog';
import { TEAM_CHART_KEY, isChartEvent } from '@/core/domain/rules/chart-sheet';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { MOTION, gsap } from '@/presentation/motion/motion';
import { useMotion } from '@/presentation/motion/useMotion';
import { QUARTER_SHORT_LABELS } from '@/presentation/organisms/ScoreboardHeader/quarter-labels';
import styles from './ChartPad.module.css';

export interface ChartPadEntryInput {
  category: ChartCategory;
  code: string;
  playerId?: string;
  points?: ChartPoints;
}

export interface ChartPadProps {
  onCourtPlayers: Player[];
  benchPlayers: Player[];
  /** Full play-by-play; only chart entries are listed. */
  events: PlayByPlayEvent[];
  /** The club's catalog: the pad offers its active codes, old entries render archived ones too. */
  catalog: ChartCatalog;
  readOnly?: boolean;
  /** Recording paused (halftime). */
  locked?: boolean;
  /** Returns whether the entry was recorded. */
  onRecord: (input: ChartPadEntryInput) => boolean;
  onUndo: () => void;
  className?: string;
}

const POINT_OPTIONS: readonly ChartPoints[] = [1, 2, 3];
const RECENT_LIMIT = 5;

/** Courtside charting pad: pick the player (or the team), then tap the code. */
export const ChartPad: React.FC<ChartPadProps> = ({
  onCourtPlayers,
  benchPlayers,
  events,
  catalog,
  readOnly = false,
  locked = false,
  onRecord,
  onUndo,
  className,
}) => {
  const [category, setCategory] = useState<ChartCategory>('TURNOVER');
  const [playerKey, setPlayerKey] = useState<string | null>(null);
  const [points, setPoints] = useState<ChartPoints>(DEFAULT_CHART_POINTS);
  const listRef = useRef<HTMLOListElement | null>(null);

  const allPlayers = [...onCourtPlayers, ...benchPlayers];
  const recent = events.filter(isChartEvent).slice(-RECENT_LIMIT).reverse();
  const latestId = recent[0]?.id;
  const disabled = readOnly || locked;

  useMotion(
    () => {
      if (!latestId) return;
      gsap.fromTo(
        `[data-chart-id="${latestId}"]`,
        { x: -8, opacity: 0 },
        { x: 0, opacity: 1, duration: MOTION.duration.base, ease: MOTION.ease.out }
      );
    },
    { dependencies: [latestId], scope: listRef }
  );

  const playerLabel = (playerId: string | undefined) => {
    if (!playerId) return 'Equipo';
    const player = allPlayers.find((p) => p.id === playerId);
    return player ? `#${player.dorsal}` : '#?';
  };

  const handleCode = (code: string) => {
    if (disabled || playerKey === null) return;
    const recorded = onRecord({
      category,
      code,
      playerId: playerKey === TEAM_CHART_KEY ? undefined : playerKey,
      points: category === 'POINTS_ALLOWED' ? points : undefined,
    });
    if (!recorded) return;
    setPlayerKey(null);
    setPoints(DEFAULT_CHART_POINTS);
  };

  const renderPlayerChip = (player: Player, bench: boolean) => (
    <button
      key={player.id}
      type="button"
      className={clsx(styles.playerChip, bench && styles.playerChipBench, playerKey === player.id && styles.chipActive)}
      aria-pressed={playerKey === player.id}
      aria-label={`#${player.dorsal} ${player.firstName} ${player.lastName}`}
      onClick={() => setPlayerKey(player.id)}
      disabled={disabled}
    >
      <span className={styles.chipDorsal}>{player.dorsal}</span>
      <span className={styles.chipName}>{player.lastName}</span>
    </button>
  );

  return (
    <section className={clsx(styles.container, 'no-scrollbar', className)} aria-label="Planilla en vivo" data-tour="live-chart-pad">
      <div className={styles.categoryTabs} role="tablist" aria-label="Categoría de la planilla">
        {CHART_CATEGORIES.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={category === value}
            className={clsx(styles.categoryTab, category === value && styles.categoryTabActive)}
            onClick={() => setCategory(value)}
          >
            {CHART_CATEGORY_LABELS[value]}
          </button>
        ))}
      </div>

      {readOnly ? (
        <div className={styles.placeholder}>
          <Lock size={ICON_SIZE.lg} aria-hidden="true" />
          <p>Tu rol no puede cargar la planilla en vivo.</p>
        </div>
      ) : (
        <>
          <div className={styles.step}>
            <h3 className={styles.stepTitle}>1. Jugador</h3>
            <div className={styles.playerGrid}>
              {onCourtPlayers.map((player) => renderPlayerChip(player, false))}
              <button
                type="button"
                className={clsx(styles.playerChip, styles.teamChip, playerKey === TEAM_CHART_KEY && styles.chipActive)}
                aria-pressed={playerKey === TEAM_CHART_KEY}
                onClick={() => setPlayerKey(TEAM_CHART_KEY)}
                disabled={disabled}
              >
                <Users size={ICON_SIZE.md} aria-hidden="true" />
                <span className={styles.chipName}>Equipo</span>
              </button>
            </div>
            {benchPlayers.length > 0 && (
              <div className={styles.benchRow} aria-label="Banco">
                {benchPlayers.map((player) => renderPlayerChip(player, true))}
              </div>
            )}
          </div>

          {category === 'POINTS_ALLOWED' && (
            <div className={styles.pointsRow} role="radiogroup" aria-label="Puntos de la canasta recibida">
              <span className={styles.stepTitle}>Puntos</span>
              {POINT_OPTIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={points === value}
                  className={clsx(styles.pointBtn, points === value && styles.chipActive)}
                  onClick={() => setPoints(value)}
                  disabled={disabled}
                >
                  {value}
                </button>
              ))}
            </div>
          )}

          <div className={styles.step}>
            <h3 className={styles.stepTitle}>
              2. {playerKey === null ? 'Elige un jugador o Equipo' : 'Acción'}
            </h3>
            <div className={styles.codeGrid}>
              {activeChartCodes(catalog, category).map((entry) => (
                <button
                  key={entry.code}
                  type="button"
                  className={clsx(styles.codeBtn, entry.tone === 'POSITIVE' ? styles.positive : styles.negative)}
                  onClick={() => handleCode(entry.code)}
                  disabled={disabled || playerKey === null}
                >
                  <span className={styles.codeSymbol}>{entry.symbol}</span>
                  <span className={styles.codeLabel}>{entry.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className={styles.recentHeader}>
        <h3 className={styles.stepTitle}>Últimas entradas</h3>
        {!disabled && recent.length > 0 && (
          <button type="button" className={styles.undoBtn} onClick={onUndo}>
            <Undo2 size={ICON_SIZE.sm} aria-hidden="true" />
            Deshacer
          </button>
        )}
      </div>
      {recent.length === 0 ? (
        <p className={styles.emptyText}>Todavía no hay entradas en la planilla.</p>
      ) : (
        <ol ref={listRef} className={styles.recentList}>
          {recent.map((event) => {
            const code = findChartCode(event.chart.category, event.chart.code, catalog);
            return (
              <li
                key={event.id}
                data-chart-id={event.id}
                className={clsx(styles.recentItem, code?.tone === 'POSITIVE' ? styles.positiveText : styles.negativeText)}
              >
                <span className={styles.recentClock}>
                  {QUARTER_SHORT_LABELS[event.quarter]} {event.gameClockFormatted}
                </span>
                <span className={styles.recentPlayer}>{playerLabel(event.playerId)}</span>
                <span className={styles.recentCode}>
                  {code?.label ?? event.chart.code}
                  {event.chart.points !== undefined && ` (${event.chart.points})`}
                </span>
                <span className={styles.recentCategory}>{CHART_CATEGORY_LABELS[event.chart.category]}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};
