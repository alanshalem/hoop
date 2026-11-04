'use client';

import React, { useRef, useState } from 'react';
import clsx from 'clsx';
import { Lock, Undo2, Users } from 'lucide-react';
import type { Player } from '@/core/domain/entities/club.types';
import {
  CHART_CATEGORIES,
  CHART_CATEGORY_LABELS,
  DEFAULT_CHART_POINTS,
  type ChartCatalog,
  type ChartCategory,
  type ChartPoints,
  type ChartTone,
} from '@/core/domain/entities/chart.types';
import type { PlayByPlayEvent } from '@/core/domain/entities/match.types';
import type { RivalPlayer } from '@/core/domain/entities/rival.types';
import { activeChartCodes } from '@/core/domain/rules/chart-catalog';
import { TEAM_CHART_KEY } from '@/core/domain/rules/chart-sheet';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { MOTION, gsap } from '@/presentation/motion/motion';
import { useMotion } from '@/presentation/motion/useMotion';
import { rivalPlayerTag } from '@/presentation/organisms/ChartSheetTable/chart-sheet-view';
import { sortRivalPlayers } from '@/presentation/organisms/RivalTeamFormModal/rival-roster';
import { buildRecentEntries, playerStepTitle, rivalStepTitle, type ChartOutcomeTone } from './recent-entry-view';
import styles from './ChartPad.module.css';

export interface ChartPadEntryInput {
  category: ChartCategory;
  code: string;
  playerId?: string;
  points?: ChartPoints;
  /** OFFENSE only: whether the action ended in a basket. */
  made?: boolean;
  /** POINTS_ALLOWED and OFFENSE only: rival player picked in the optional step (S14). */
  rivalPlayerId?: string;
}

export interface ChartPadProps {
  /** The match roster, shown as equal chips (no on-court distinction, S15). */
  players: Player[];
  /** Full play-by-play; only chart entries are listed. */
  events: PlayByPlayEvent[];
  /** The club's catalog: the pad offers its active codes, old entries render archived ones too. */
  catalog: ChartCatalog;
  /** Match rival roster (S14): offered as an optional step and named in the last entries. */
  rivalRoster?: readonly RivalPlayer[];
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
const NO_RIVAL_PLAYERS: readonly RivalPlayer[] = [];

const TONE_CLASS: Record<ChartTone, string> = {
  POSITIVE: styles.positiveText,
  NEGATIVE: styles.negativeText,
};

const OUTCOME_CLASS: Record<ChartOutcomeTone, string> = {
  made: styles.outcomeMade,
  missed: styles.outcomeMissed,
  allowed: styles.outcomeAllowed,
};

/** Courtside charting pad: pick the player (or the team), then tap the code. */
export const ChartPad: React.FC<ChartPadProps> = ({
  players,
  events,
  catalog,
  rivalRoster = NO_RIVAL_PLAYERS,
  readOnly = false,
  locked = false,
  onRecord,
  onUndo,
  className,
}) => {
  const [category, setCategory] = useState<ChartCategory>('TURNOVER');
  const [playerKey, setPlayerKey] = useState<string | null>(null);
  const [points, setPoints] = useState<ChartPoints>(DEFAULT_CHART_POINTS);
  /** OFFENSE: the action picked in step 2, waiting for its result in step 3 (S11). */
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  /** Optional rival player (S14); never required to save the entry. */
  const [pickedRivalId, setPickedRivalId] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);

  const recent = buildRecentEntries(events, {
    playersById: new Map(players.map((player) => [player.id, player])),
    rivalById: new Map(rivalRoster.map((player) => [player.id, player])),
    catalog,
    limit: RECENT_LIMIT,
  });
  const latestId = recent[0]?.id;
  const disabled = readOnly || locked;
  const rivalTitle = rivalRoster.length > 0 ? rivalStepTitle(category) : null;
  // A player removed from the roster meanwhile is dropped instead of being refused on save.
  const rivalPlayerId = rivalTitle && rivalRoster.some((p) => p.id === pickedRivalId) ? pickedRivalId : null;

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

  const record = (input: Omit<ChartPadEntryInput, 'category' | 'playerId'>) => {
    if (disabled || playerKey === null) return;
    const recorded = onRecord({
      category,
      playerId: playerKey === TEAM_CHART_KEY ? undefined : playerKey,
      ...(rivalPlayerId ? { rivalPlayerId } : {}),
      ...input,
    });
    if (!recorded) return;
    setPlayerKey(null);
    setPoints(DEFAULT_CHART_POINTS);
    setPendingCode(null);
    setPickedRivalId(null);
  };

  const handleCode = (code: string) => {
    if (disabled || playerKey === null) return;
    // Offensive actions are saved in step 3, once the result is known.
    if (category === 'OFFENSE') {
      setPendingCode(code);
      return;
    }
    record({ code, points: category === 'POINTS_ALLOWED' ? points : undefined });
  };

  const handleResult = (made: boolean, value?: ChartPoints) => {
    if (pendingCode === null) return;
    record({ code: pendingCode, made, points: made ? value : undefined });
  };

  const handleCategory = (value: ChartCategory) => {
    setCategory(value);
    setPendingCode(null);
    setPickedRivalId(null);
  };

  // Tapping the picked rival again clears it.
  const toggleRival = (id: string) => setPickedRivalId((current) => (current === id ? null : id));

  const renderRivalStep = () =>
    rivalTitle && (
      <div className={styles.step} data-tour="live-chart-rival">
        <h3 className={styles.stepTitle}>
          Rival (opcional) <span className={styles.stepQuestion}>· {rivalTitle}</span>
        </h3>
        <div className={clsx(styles.rivalRow, 'no-scrollbar')} role="group" aria-label={`Rival (opcional): ${rivalTitle}`}>
          {sortRivalPlayers(rivalRoster).map((player) => (
            <button
              key={player.id}
              type="button"
              className={clsx(styles.rivalChip, rivalPlayerId === player.id && styles.chipActive)}
              aria-pressed={rivalPlayerId === player.id}
              aria-label={`#${player.dorsal} ${player.firstName} ${player.lastName}`}
              onClick={() => toggleRival(player.id)}
              disabled={disabled}
            >
              {rivalPlayerTag(player)}
            </button>
          ))}
        </div>
      </div>
    );

  const renderPlayerChip = (player: Player) => (
    <button
      key={player.id}
      type="button"
      className={clsx(styles.playerChip, playerKey === player.id && styles.chipActive)}
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
            onClick={() => handleCategory(value)}
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
            <h3 className={styles.stepTitle}>{playerStepTitle(category)}</h3>
            <div className={styles.playerGrid}>
              {players.map(renderPlayerChip)}
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

          {/* The rival step sits right before the tap that saves the entry. */}
          {category === 'POINTS_ALLOWED' && renderRivalStep()}

          <div className={styles.step}>
            <h3 className={clsx(styles.stepTitle, playerKey === null && styles.stepTitleWaiting)}>
              {playerKey === null ? '2. Acción: primero elige un jugador o Equipo' : '2. Acción'}
            </h3>
            <div className={styles.codeGrid}>
              {activeChartCodes(catalog, category).map((entry) => (
                <button
                  key={entry.code}
                  type="button"
                  className={clsx(
                    styles.codeBtn,
                    entry.tone === 'POSITIVE' ? styles.positive : styles.negative,
                    pendingCode === entry.code && styles.codeSelected
                  )}
                  aria-pressed={category === 'OFFENSE' ? pendingCode === entry.code : undefined}
                  onClick={() => handleCode(entry.code)}
                  disabled={disabled || playerKey === null}
                >
                  <span className={styles.codeSymbol}>{entry.symbol}</span>
                  <span className={styles.codeLabel}>{entry.label}</span>
                </button>
              ))}
            </div>
          </div>

          {category === 'OFFENSE' && renderRivalStep()}

          {category === 'OFFENSE' && (
            <div className={styles.step}>
              <h3 className={clsx(styles.stepTitle, playerKey !== null && pendingCode === null && styles.stepTitleWaiting)}>
                {pendingCode === null ? '3. Resultado: primero elige la acción' : '3. Resultado: ¿convirtió?'}
              </h3>
              <div className={styles.resultGrid} role="group" aria-label="Resultado de la acción ofensiva">
                <button
                  type="button"
                  className={clsx(styles.resultBtn, styles.resultMiss)}
                  onClick={() => handleResult(false)}
                  disabled={disabled || pendingCode === null}
                >
                  No convirtió
                </button>
                {POINT_OPTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={clsx(styles.resultBtn, styles.resultMade)}
                    aria-label={`Convirtió ${value === 1 ? '1 punto' : `${value} puntos`}`}
                    onClick={() => handleResult(true, value)}
                    disabled={disabled || pendingCode === null}
                  >
                    +{value}
                  </button>
                ))}
              </div>
            </div>
          )}
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
          {recent.map((entry) => (
            <li
              key={entry.id}
              data-chart-id={entry.id}
              className={clsx(styles.recentItem, entry.tone && TONE_CLASS[entry.tone])}
            >
              <span className={styles.recentSymbol}>{entry.symbol}</span>
              <span className={styles.recentBody}>
                <span className={styles.recentMain}>
                  <span className={styles.recentPlayer}>{entry.player}</span>
                  <span className={styles.recentLabel}>{entry.label}</span>
                </span>
                <span className={styles.recentMeta}>
                  <span className={styles.recentClock}>{entry.clock}</span>
                  <span>{entry.category}</span>
                  {entry.rival && <span className={styles.recentRival}>{entry.rival}</span>}
                </span>
              </span>
              {entry.outcome && (
                <span className={clsx(styles.recentOutcome, OUTCOME_CLASS[entry.outcome.tone])}>
                  {entry.outcome.text}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};
