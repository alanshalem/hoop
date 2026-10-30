'use client';

import React, { useRef } from 'react';
import clsx from 'clsx';
import { Pause, Play, Timer } from 'lucide-react';
import type { Quarter } from '@/core/domain/entities/match.types';
import type { TeamSide } from '@/core/application/use-cases/match-use-cases';
import { FIBA_TEAM_FOULS_BONUS_THRESHOLD, isTeamInBonus } from '@/core/domain/rules/basketball-rules';
import { formatGameClock } from '@/core/domain/rules/game-clock';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { MOTION, gsap } from '@/presentation/motion/motion';
import { useMotion, useMotionOnChange } from '@/presentation/motion/useMotion';
import { QUARTER_LABELS, QUARTER_SHORT_LABELS } from './quarter-labels';
import styles from './ScoreboardHeader.module.css';

export interface ScoreboardTeam {
  side: TeamSide;
  name: string;
  score: number;
  teamFouls: number;
  timeoutsLeft: number;
}

export interface ScoreboardHeaderProps {
  home: ScoreboardTeam;
  away: ScoreboardTeam;
  quarter: Quarter;
  /** Periods the operator can switch to. */
  quarters: readonly Quarter[];
  clockSeconds: number;
  isClockRunning: boolean;
  /** Hides every control (clock, periods, timeouts). */
  readOnly?: boolean;
  onSelectQuarter: (quarter: Quarter) => void;
  onToggleClock: () => void;
  /** Adds (or subtracts) seconds to the clock. */
  onAdjustClock: (deltaSeconds: number) => void;
  onTimeout: (side: TeamSide) => void;
}

const CLOCK_STEP_SECONDS = 10;
const FOUL_LIGHTS = Array.from({ length: FIBA_TEAM_FOULS_BONUS_THRESHOLD }, (_, i) => i + 1);

/** LED digits: bump plus a green glow when the score goes up, club red when it is corrected down. */
const ScoreNumber: React.FC<{ score: number }> = ({ score }) => {
  const numberRef = useRef<HTMLSpanElement | null>(null);
  const glowUpRef = useRef<HTMLSpanElement | null>(null);
  const glowDownRef = useRef<HTMLSpanElement | null>(null);

  useMotionOnChange(score, (previous, current) => {
    gsap.fromTo(numberRef.current, { scale: 1.3 }, { scale: 1, duration: 0.4, ease: 'back.out(2)' });
    const glow = current > previous ? glowUpRef.current : glowDownRef.current;
    gsap.fromTo(
      glow,
      { opacity: 0.95, scale: 0.6 },
      { opacity: 0, scale: 1.25, duration: MOTION.duration.slow * 1.4, ease: MOTION.ease.out }
    );
  });

  return (
    <span className={styles.scoreCell}>
      <span ref={glowUpRef} className={clsx(styles.scoreGlow, styles.scoreGlowUp)} aria-hidden="true" />
      <span ref={glowDownRef} className={clsx(styles.scoreGlow, styles.scoreGlowDown)} aria-hidden="true" />
      <span ref={numberRef} className={styles.scoreNumber}>
        {score}
      </span>
    </span>
  );
};

/** Team foul lights: the light that just turned on pops in. */
const FoulLights: React.FC<{ teamFouls: number }> = ({ teamFouls }) => {
  const lightsRef = useRef<HTMLSpanElement | null>(null);

  useMotionOnChange(
    teamFouls,
    (previous, current) => {
      if (current <= previous || current > FIBA_TEAM_FOULS_BONUS_THRESHOLD) return;
      gsap.fromTo(
        `[data-foul-light="${current}"]`,
        { scale: 0.3, opacity: 0.4 },
        { scale: 1, opacity: 1, duration: MOTION.duration.base, ease: MOTION.ease.pop }
      );
    },
    { scope: lightsRef }
  );

  return (
    <span
      ref={lightsRef}
      className={styles.foulLights}
      role="img"
      aria-label={`${teamFouls} faltas de equipo en el período`}
    >
      {FOUL_LIGHTS.map((i) => (
        <span
          key={i}
          data-foul-light={i}
          className={clsx(styles.foulLight, teamFouls >= i && styles.foulLightActive)}
        />
      ))}
    </span>
  );
};

/** BONUS badge: pops in, then breathes while the team stays in bonus. */
const BonusBadge: React.FC = () => {
  const ref = useRef<HTMLSpanElement | null>(null);

  useMotion(
    () => {
      gsap
        .timeline()
        .fromTo(ref.current, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: MOTION.duration.base, ease: MOTION.ease.pop })
        .to(ref.current, { opacity: 0.7, scale: 0.96, duration: 0.6, ease: MOTION.ease.soft, repeat: -1, yoyo: true });
    },
    { scope: ref }
  );

  return (
    <span ref={ref} className={styles.bonusBadge}>
      Bonus
    </span>
  );
};

interface TeamPanelProps {
  team: ScoreboardTeam;
  conditionLabel: string;
  isAway: boolean;
  readOnly: boolean;
  onTimeout: (side: TeamSide) => void;
}

const TeamPanel: React.FC<TeamPanelProps> = ({ team, conditionLabel, isAway, readOnly, onTimeout }) => {
  const inBonus = isTeamInBonus(team.teamFouls);
  const isOwn = team.side === 'OWN';

  return (
    <div className={clsx(styles.teamPanel, isAway && styles.teamPanelAway, isOwn && styles.teamPanelOwn)}>
      <div className={styles.teamMeta}>
        <span className={styles.teamCondition}>{conditionLabel}</span>
        <span className={styles.teamName}>{team.name}</span>
        <div className={styles.foulRow}>
          <FoulLights teamFouls={team.teamFouls} />
          <span className={styles.foulCount}>{team.teamFouls} F</span>
          {inBonus && <BonusBadge />}
        </div>
      </div>

      <ScoreNumber score={team.score} />

      <button
        type="button"
        className={clsx(styles.timeoutBtn, team.timeoutsLeft === 0 && styles.timeoutBtnEmpty)}
        onClick={() => onTimeout(team.side)}
        disabled={readOnly}
        aria-label={`Tiempo muerto para ${team.name}. Quedan ${team.timeoutsLeft} en el período`}
      >
        <Timer size={ICON_SIZE.md} aria-hidden="true" />
        <span className={styles.timeoutLabel}>TM</span>
        <span className={styles.timeoutCount}>{team.timeoutsLeft}</span>
      </button>
    </div>
  );
};

export const ScoreboardHeader: React.FC<ScoreboardHeaderProps> = ({
  home,
  away,
  quarter,
  quarters,
  clockSeconds,
  isClockRunning,
  readOnly = false,
  onSelectQuarter,
  onToggleClock,
  onAdjustClock,
  onTimeout,
}) => (
  <header className={styles.headerContainer} data-surface="board" aria-label="Tablero electrónico del partido">
    <TeamPanel team={home} conditionLabel="Local" isAway={false} readOnly={readOnly} onTimeout={onTimeout} />

    <div className={styles.centerGameControl}>
      <div className={styles.quarterSelector} role="group" aria-label="Período">
        {quarters.map((q) => (
          <button
            key={q}
            type="button"
            className={clsx(styles.quarterBtn, quarter === q && styles.quarterBtnActive)}
            aria-pressed={quarter === q}
            aria-label={QUARTER_LABELS[q]}
            disabled={readOnly && quarter !== q}
            onClick={() => onSelectQuarter(q)}
          >
            {QUARTER_SHORT_LABELS[q]}
          </button>
        ))}
      </div>

      <div className={styles.clockRow}>
        {!readOnly && (
          <button
            type="button"
            className={styles.clockStepBtn}
            onClick={() => onAdjustClock(-CLOCK_STEP_SECONDS)}
            aria-label={`Restar ${CLOCK_STEP_SECONDS} segundos al reloj`}
          >
            -{CLOCK_STEP_SECONDS}s
          </button>
        )}
        <span
          className={clsx(styles.clockDisplay, isClockRunning && styles.clockRunning, clockSeconds === 0 && styles.clockExpired)}
          role="timer"
          aria-label={`Reloj de juego ${formatGameClock(clockSeconds)}`}
        >
          {formatGameClock(clockSeconds)}
        </span>
        {!readOnly && (
          <button
            type="button"
            className={styles.clockStepBtn}
            onClick={() => onAdjustClock(CLOCK_STEP_SECONDS)}
            aria-label={`Sumar ${CLOCK_STEP_SECONDS} segundos al reloj`}
          >
            +{CLOCK_STEP_SECONDS}s
          </button>
        )}
        {!readOnly && (
          <button
            type="button"
            className={clsx(styles.clockToggleBtn, isClockRunning && styles.clockToggleRunning)}
            onClick={onToggleClock}
            disabled={!isClockRunning && clockSeconds === 0}
            aria-label={isClockRunning ? 'Pausar reloj' : 'Iniciar reloj'}
          >
            {isClockRunning ? <Pause size={ICON_SIZE.lg} /> : <Play size={ICON_SIZE.lg} />}
          </button>
        )}
      </div>
    </div>

    <TeamPanel team={away} conditionLabel="Visitante" isAway readOnly={readOnly} onTimeout={onTimeout} />
  </header>
);
