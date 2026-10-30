import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ScreenTourId, TourId } from './tour-model';
import {
  EMPTY_TOUR_SEEN_STATE,
  markTourSeen,
  resetUserTours,
  screenTourToDefer,
  type TourOutcome,
  type TourSeenState,
} from './tour-seen-state';

export const TOUR_STORAGE_KEY = 'hoop-tour-storage';
export const TOUR_STORE_VERSION = 1;

interface TourPersistedData {
  /** Completed / skipped tours per user id. Presentation preference, never synced. */
  seen: TourSeenState;
}

export interface TourScreen {
  tourId: ScreenTourId;
  blocked: boolean;
}

export interface TourStoreState extends TourPersistedData {
  /** Tour on screen, shared so only one tour runs at a time. */
  activeTourId: TourId | null;
  /** Replay requested from Ayuda or the user menu, started once its screen is shown. */
  pendingTourId: TourId | null;
  /** Screen currently open that declared a tour (one at a time). */
  screen: TourScreen | null;
  /** Tour of the open screen held until its next visit (the welcome tour just ended there). */
  deferredScreenTourId: ScreenTourId | null;
  registerScreen: (tourId: ScreenTourId) => void;
  unregisterScreen: (tourId: ScreenTourId) => void;
  setScreenBlocked: (tourId: ScreenTourId, blocked: boolean) => void;
  requestTour: (tourId: TourId) => void;
  clearPendingTour: () => void;
  beginTour: (tourId: TourId) => void;
  /** Closes the active tour; records the outcome for the user when given. */
  endTour: (userId: string | null, outcome: TourOutcome | null) => void;
  resetUserTours: (userId: string) => void;
}

export const useTourStore = create<TourStoreState>()(
  persist(
    (set, get) => ({
      seen: EMPTY_TOUR_SEEN_STATE,
      activeTourId: null,
      pendingTourId: null,
      screen: null,
      deferredScreenTourId: null,
      registerScreen: (tourId) => set({ screen: { tourId, blocked: false } }),
      // Leaving a screen ends its visit: a tour deferred there starts on the next one.
      unregisterScreen: (tourId) => {
        const { screen, deferredScreenTourId } = get();
        if (screen?.tourId === tourId) set({ screen: null });
        if (deferredScreenTourId === tourId) set({ deferredScreenTourId: null });
      },
      setScreenBlocked: (tourId, blocked) => {
        const { screen } = get();
        if (screen?.tourId === tourId && screen.blocked !== blocked) set({ screen: { tourId, blocked } });
      },
      requestTour: (tourId) => set({ pendingTourId: tourId }),
      clearPendingTour: () => set({ pendingTourId: null }),
      beginTour: (tourId) => set({ activeTourId: tourId, pendingTourId: null }),
      endTour: (userId, outcome) => {
        const { activeTourId, seen, screen, deferredScreenTourId } = get();
        if (!activeTourId) return;
        set({
          activeTourId: null,
          seen: userId && outcome ? markTourSeen(seen, userId, activeTourId, outcome) : seen,
          deferredScreenTourId: screenTourToDefer(activeTourId, outcome, screen?.tourId ?? null) ?? deferredScreenTourId,
        });
      },
      resetUserTours: (userId) => set((state) => ({ seen: resetUserTours(state.seen, userId) })),
    }),
    {
      name: TOUR_STORAGE_KEY,
      version: TOUR_STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): TourPersistedData => ({ seen: state.seen }),
      // An unknown shape only means seeing the tutorials again.
      migrate: (persisted, version): TourPersistedData =>
        version === TOUR_STORE_VERSION ? (persisted as TourPersistedData) : { seen: EMPTY_TOUR_SEEN_STATE },
    }
  )
);
