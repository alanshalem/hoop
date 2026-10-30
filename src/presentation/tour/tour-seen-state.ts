import { WELCOME_TOUR_ID } from './tour-model';

/**
 * Which tours each user already saw (S12), as immutable data so the persisted
 * store stays a thin wrapper.
 */

export type TourOutcome = 'completed' | 'skipped';
export type TourStatus = TourOutcome | 'pending';

export interface TourUserRecord {
  completed: string[];
  skipped: string[];
}

/** Keyed by user id. */
export type TourSeenState = Readonly<Record<string, TourUserRecord>>;

export const EMPTY_TOUR_SEEN_STATE: TourSeenState = Object.freeze({});

const EMPTY_RECORD: TourUserRecord = { completed: [], skipped: [] };

export function tourStatus(state: TourSeenState, userId: string, tourId: string): TourStatus {
  const record = state[userId] ?? EMPTY_RECORD;
  if (record.completed.includes(tourId)) return 'completed';
  if (record.skipped.includes(tourId)) return 'skipped';
  return 'pending';
}

/** Records the outcome; the latest one replaces any earlier outcome of the same tour. */
export function markTourSeen(
  state: TourSeenState,
  userId: string,
  tourId: string,
  outcome: TourOutcome
): TourSeenState {
  const record = state[userId] ?? EMPTY_RECORD;
  const without = (ids: string[]) => ids.filter((id) => id !== tourId);
  const next: TourUserRecord = {
    completed: outcome === 'completed' ? [...without(record.completed), tourId] : without(record.completed),
    skipped: outcome === 'skipped' ? [...without(record.skipped), tourId] : without(record.skipped),
  };
  return { ...state, [userId]: next };
}

/** Every tour of the user becomes pending again. */
export function resetUserTours(state: TourSeenState, userId: string): TourSeenState {
  const next = { ...state };
  delete next[userId];
  return next;
}

export interface ScreenRegistration {
  tourId: string;
  /** The screen asks to hold automatic tours (e.g. the live console with the clock running). */
  blocked: boolean;
}

export interface PickTourInput {
  activeTourId: string | null;
  /** Tour explicitly requested (replay) and not started yet. */
  pendingTourId: string | null;
  screen: ScreenRegistration | null;
  isSeen: (tourId: string) => boolean;
}

/**
 * Tour to start now, if any. An explicit replay starts on its own screen (the
 * welcome tour on any screen), even if seen or blocked. Otherwise the welcome
 * tour comes first, then the tour of the screen, each one only once.
 */
export function pickTourToStart({
  activeTourId,
  pendingTourId,
  screen,
  isSeen,
}: PickTourInput): { tourId: string; explicit: boolean } | null {
  if (activeTourId || !screen) return null;
  if (pendingTourId) {
    return pendingTourId === WELCOME_TOUR_ID || pendingTourId === screen.tourId
      ? { tourId: pendingTourId, explicit: true }
      : null;
  }
  if (screen.blocked) return null;
  if (!isSeen(WELCOME_TOUR_ID)) return { tourId: WELCOME_TOUR_ID, explicit: false };
  if (!isSeen(screen.tourId)) return { tourId: screen.tourId, explicit: false };
  return null;
}
