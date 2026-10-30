'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/core/application/stores/useAuthStore';
import type { ScreenTourId, TourId } from './tour-model';
import { tourStatus, type TourStatus } from './tour-seen-state';
import { useTourStore } from './useTourStore';

export interface ScreenTourOptions {
  /** Holds the automatic start (e.g. the live console while the match clock runs). */
  blocked?: boolean;
  /** False while the screen shows a state without the tour targets (e.g. a gate). */
  enabled?: boolean;
}

/**
 * Declares the tour of the open screen. <TourHost /> starts it automatically the
 * first time (after the welcome tour) and the user menu can replay it.
 */
export function useScreenTour(tourId: ScreenTourId, { blocked = false, enabled = true }: ScreenTourOptions = {}) {
  useEffect(() => {
    if (!enabled) return;
    useTourStore.getState().registerScreen(tourId);
    return () => useTourStore.getState().unregisterScreen(tourId);
  }, [tourId, enabled]);

  useEffect(() => {
    if (enabled) useTourStore.getState().setScreenBlocked(tourId, blocked);
  }, [tourId, blocked, enabled]);
}

/** Replay and reset entry points (Ayuda picker, user menu). */
export function useTourControls() {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const seen = useTourStore((state) => state.seen);
  const screenTourId = useTourStore((state) => state.screen?.tourId ?? null);
  const requestTour = useTourStore((state) => state.requestTour);
  const reset = useTourStore((state) => state.resetUserTours);

  return {
    /** Tour of the open screen, if it declared one. */
    screenTourId,
    statusOf: (tourId: TourId): TourStatus => (userId ? tourStatus(seen, userId, tourId) : 'pending'),
    /** Starts `tourId` as soon as its screen is open (the welcome tour on any screen). */
    startTour: (tourId: TourId) => requestTour(tourId),
    replayScreenTour: () => {
      if (screenTourId) requestTour(screenTourId);
    },
    /** Every tutorial of the user starts again automatically. */
    resetAll: () => {
      if (userId) reset(userId);
    },
  };
}
