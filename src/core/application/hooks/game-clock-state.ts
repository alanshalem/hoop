/**
 * =============================================================================
 * HOOP OS - LOCAL GAME CLOCK STATE
 * Pure reducer behind useGameClock. `key` identifies the match period the
 * clock belongs to; `expirations` counts how many times it ticked down to 00:00.
 * =============================================================================
 */

export interface GameClockState {
  key: string;
  seconds: number;
  isRunning: boolean;
  expirations: number;
}

export type GameClockAction =
  | { type: 'START' }
  | { type: 'PAUSE' }
  | { type: 'TICK' }
  | { type: 'SET'; seconds: number }
  | { type: 'RESET'; key: string; seconds: number };

export function createGameClockState(key: string, seconds: number): GameClockState {
  return { key, seconds, isRunning: false, expirations: 0 };
}

export function gameClockReducer(state: GameClockState, action: GameClockAction): GameClockState {
  switch (action.type) {
    case 'START':
      return state.seconds > 0 && !state.isRunning ? { ...state, isRunning: true } : state;
    case 'PAUSE':
      return state.isRunning ? { ...state, isRunning: false } : state;
    case 'TICK':
      if (!state.isRunning) return state;
      if (state.seconds <= 1) {
        return { ...state, seconds: 0, isRunning: false, expirations: state.expirations + 1 };
      }
      return { ...state, seconds: state.seconds - 1 };
    case 'SET': {
      const seconds = Math.max(0, Math.round(action.seconds));
      return { ...state, seconds, isRunning: state.isRunning && seconds > 0 };
    }
    case 'RESET':
      return { ...state, key: action.key, seconds: action.seconds, isRunning: false };
  }
}
