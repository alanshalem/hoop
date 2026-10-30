import { useCallback, useEffect, useEffectEvent, useReducer, useRef } from 'react';
import type { Match } from '@/core/domain/entities/match.types';
import { clampGameClock } from '@/core/domain/rules/game-clock';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { createGameClockState, gameClockKey, gameClockReducer } from './game-clock-state';

export interface GameClock {
  seconds: number;
  isRunning: boolean;
  /** Latest seconds, safe to call after an await (dialogs) when `seconds` may be stale. */
  read: () => number;
  /** Starts the clock, or pauses (and persists) it when running. */
  toggle: () => void;
  /** Stops the clock and persists the remaining seconds. */
  pause: () => void;
  /** Sets the remaining seconds (clamped to the period length) and persists them. */
  set: (seconds: number) => void;
}

export interface UseGameClockOptions {
  /** Called once each time the running clock reaches 00:00. */
  onExpire?: () => void;
}

type ClockMatch = Pick<Match, 'id' | 'currentQuarter' | 'status' | 'quarterTimeRemainingSeconds'>;

/**
 * Local ticking game clock for the live console. The store keeps the persisted
 * value (`setClock`): saved on pause, on adjust, at 00:00, when the page is
 * hidden and on unmount. A quarter or status change (halftime) resets it to the
 * stored value, paused.
 * Mount it once per match (key the component by match ID).
 */
export function useGameClock(
  match: ClockMatch | undefined,
  { onExpire }: UseGameClockOptions = {}
): GameClock {
  const setClock = useClubStore((state) => state.setClock);
  const matchId = match?.id;
  const quarter = match?.currentQuarter ?? 'Q1';
  const storedSeconds = match?.quarterTimeRemainingSeconds ?? 0;
  const key = gameClockKey(match);

  const [state, dispatch] = useReducer(gameClockReducer, undefined, () =>
    createGameClockState(key, storedSeconds)
  );

  // New period (or match): adopt the stored clock, paused.
  if (state.key !== key) {
    dispatch({ type: 'RESET', key, seconds: storedSeconds });
  }

  const latestSeconds = useRef(state.seconds);
  useEffect(() => {
    latestSeconds.current = state.seconds;
  }, [state.seconds]);

  const persist = useCallback(
    (seconds: number) => {
      if (matchId) setClock(matchId, seconds);
    },
    [matchId, setClock]
  );

  useEffect(() => {
    if (!state.isRunning) return;
    const interval = setInterval(() => dispatch({ type: 'TICK' }), 1000);
    return () => clearInterval(interval);
  }, [state.isRunning]);

  const handleExpire = useEffectEvent(() => {
    persist(0);
    onExpire?.();
  });

  useEffect(() => {
    if (state.expirations > 0) handleExpire();
  }, [state.expirations]);

  const persistLatest = useEffectEvent(() => persist(latestSeconds.current));

  useEffect(() => {
    const handlePageHide = () => persistLatest();
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      persistLatest();
    };
  }, [matchId]);

  const read = () => latestSeconds.current;

  const pause = () => {
    dispatch({ type: 'PAUSE' });
    persist(read());
  };

  const toggle = () => {
    if (state.isRunning) pause();
    else dispatch({ type: 'START' });
  };

  const set = (seconds: number) => {
    const next = clampGameClock(seconds, quarter);
    dispatch({ type: 'SET', seconds: next });
    persist(next);
  };

  return { seconds: state.seconds, isRunning: state.isRunning, read, toggle, pause, set };
}
