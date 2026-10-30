'use client';

import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Play, Pause, Clock, AlertCircle } from 'lucide-react';
import { Match, Quarter } from '@/core/domain/entities/match.types';
import { isTeamInBonus } from '@/core/domain/rules/basketball-rules';
import clsx from 'clsx';
import styles from './ScoreboardHeader.module.css';

export interface ScoreboardHeaderProps {
  match: Match;
  onQuarterChange: (quarter: Quarter) => void;
  onScoreRival: (points: number) => void;
  onTimeoutRival: () => void;
  onTimeoutOwn: () => void;
  onToggleClock?: (isRunning: boolean) => void;
}

export const ScoreboardHeader: React.FC<ScoreboardHeaderProps> = ({
  match,
  onQuarterChange,
  onScoreRival,
  onTimeoutRival,
  onTimeoutOwn,
  onToggleClock,
}) => {
  const homeScoreRef = useRef<HTMLSpanElement | null>(null);
  const awayScoreRef = useRef<HTMLSpanElement | null>(null);

  // Clock state
  const [secondsRemaining, setSecondsRemaining] = useState(
    match.quarterTimeRemainingSeconds || 600
  );
  const [isClockRunning, setIsClockRunning] = useState(false);

  // Animate home score when it changes
  useEffect(() => {
    if (homeScoreRef.current) {
      gsap.fromTo(
        homeScoreRef.current,
        { scale: 1.35, color: 'var(--color-green)' },
        { scale: 1, color: 'var(--text-primary)', duration: 0.35, ease: 'back.out(2)' }
      );
    }
  }, [match.homeScore]);

  // Animate away score when it changes
  useEffect(() => {
    if (awayScoreRef.current) {
      gsap.fromTo(
        awayScoreRef.current,
        { scale: 1.35, color: 'var(--color-red)' },
        { scale: 1, color: 'var(--text-primary)', duration: 0.35, ease: 'back.out(2)' }
      );
    }
  }, [match.awayScore]);

  // Clock countdown timer
  useEffect(() => {
    if (!isClockRunning) return;

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          setIsClockRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isClockRunning]);

  const toggleClock = () => {
    const newState = !isClockRunning;
    setIsClockRunning(newState);
    onToggleClock?.(newState);
  };

  const quarters: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4', 'OT1'];

  const homeBonus = isTeamInBonus(match.homeFoulsQuarter);
  const awayBonus = isTeamInBonus(match.awayFoulsQuarter);

  const formatClock = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <header className={styles.headerContainer} role="region" aria-label="Tablero electrónico de partido">
      {/* LOCAL / OWN TEAM */}
      <div className={styles.teamPanel}>
        <div className={styles.teamMeta}>
          <span className={styles.teamName}>{match.ownTeamName}</span>
          <div className={styles.foulBonusRow}>
            <div className={styles.foulLights} aria-label={`${match.homeFoulsQuarter} faltas de equipo`}>
              {[1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className={clsx(
                    styles.foulLight,
                    match.homeFoulsQuarter >= i && styles.foulLightActive
                  )}
                />
              ))}
            </div>
            {homeBonus && <span className={styles.bonusBadge}>BONUS</span>}
          </div>
        </div>

        <span ref={homeScoreRef} className={styles.scoreNumber}>
          {match.homeScore}
        </span>
      </div>

      {/* CENTER: QUARTER SELECTOR & GAME CLOCK */}
      <div className={styles.centerGameControl}>
        <div className={styles.quarterSelector} role="tablist" aria-label="Seleccionar cuarto">
          {quarters.map((q) => (
            <button
              key={q}
              type="button"
              className={clsx(
                styles.quarterBtn,
                match.currentQuarter === q && styles.quarterBtnActive
              )}
              onClick={() => onQuarterChange(q)}
            >
              {q}
            </button>
          ))}
        </div>

        <div className={styles.clockRow}>
          <button
            type="button"
            className={styles.clockToggleBtn}
            onClick={toggleClock}
            aria-label={isClockRunning ? 'Pausar reloj' : 'Reanudar reloj'}
          >
            {isClockRunning ? <Pause size={20} /> : <Play size={20} />}
          </button>

          <span
            className={clsx(
              styles.clockDisplay,
              isClockRunning && styles.clockRunning
            )}
          >
            {formatClock(secondsRemaining)}
          </span>
        </div>
      </div>

      {/* VISITANTE / RIVAL TEAM + QUICK ACTIONS */}
      <div className={styles.teamPanel}>
        <span ref={awayScoreRef} className={styles.scoreNumber}>
          {match.awayScore}
        </span>

        <div className={styles.teamMeta}>
          <span className={styles.teamName}>{match.rivalTeamName}</span>
          <div className={styles.foulBonusRow}>
            <div className={styles.foulLights} aria-label={`${match.awayFoulsQuarter} faltas de equipo rival`}>
              {[1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className={clsx(
                    styles.foulLight,
                    match.awayFoulsQuarter >= i && styles.foulLightActive
                  )}
                />
              ))}
            </div>
            {awayBonus && <span className={styles.bonusBadge}>BONUS</span>}
          </div>
        </div>

        {/* RIVAL SCORE / TIMEOUT SHORTCUTS */}
        <div className={styles.rivalActions}>
          <button
            type="button"
            className={styles.quickScoreBtn}
            onClick={() => onScoreRival(1)}
            title="Sumar 1 punto a rival"
          >
            +1
          </button>
          <button
            type="button"
            className={styles.quickScoreBtn}
            onClick={() => onScoreRival(2)}
            title="Sumar 2 puntos a rival"
          >
            +2
          </button>
          <button
            type="button"
            className={styles.quickScoreBtn}
            onClick={() => onScoreRival(3)}
            title="Sumar 3 puntos a rival"
          >
            +3
          </button>
          <button
            type="button"
            className={styles.timeoutBtn}
            onClick={onTimeoutRival}
            title="Pedir tiempo muerto"
          >
            <Clock size={14} /> TM
          </button>
        </div>
      </div>
    </header>
  );
};
