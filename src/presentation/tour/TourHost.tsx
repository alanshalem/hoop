'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/core/application/stores/useAuthStore';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { useHydrated } from '@/presentation/session/useHydrated';
import { GuidedTour } from './GuidedTour';
import { isTourId, resolveTourSteps, WELCOME_TOUR_ID, type TourDefinition, type TourStep } from './tour-model';
import { pickTourToStart, tourStatus } from './tour-seen-state';
import { findTourTarget, isUiBusy } from './tour-dom';
import { getTour } from './tours';
import { useTourStore } from './useTourStore';

/** Lets the page entrance animation settle before an automatic tour. */
const AUTO_START_DELAY_MS = 900;
const REPLAY_DELAY_MS = 250;
/** While a dialog or modal sheet is open, check again after this delay. */
const BUSY_RETRY_MS = 500;
/** Screens re-register on re-render; only a lasting change means the user left. */
const SCREEN_LEAVE_GRACE_MS = 300;

interface TourSession {
  key: number;
  tour: TourDefinition;
  steps: TourStep[];
}

/**
 * Runs the guided tours (S12). Mount once in the root layout: pages only
 * declare their tour with `useScreenTour`. Starts the welcome tour on the
 * first login of each user, then each screen tour on its first visit (the
 * screen where the welcome tour ended waits for its next visit), never while a
 * dialog is open or the screen holds tours (live clock running).
 */
export function TourHost() {
  const hydrated = useHydrated();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const role = useClubStore((state) => state.currentUser.role);
  const seen = useTourStore((state) => state.seen);
  const activeTourId = useTourStore((state) => state.activeTourId);
  const pendingTourId = useTourStore((state) => state.pendingTourId);
  const screen = useTourStore((state) => state.screen);
  const deferredTourId = useTourStore((state) => state.deferredScreenTourId);
  const [session, setSession] = useState<TourSession | null>(null);

  // Automatic first-time tours and explicit replays.
  useEffect(() => {
    if (!hydrated || !userId) return;
    const candidate = pickTourToStart({
      activeTourId,
      pendingTourId,
      screen,
      deferredTourId,
      isSeen: (tourId) => tourStatus(seen, userId, tourId) !== 'pending',
    });
    if (!candidate || !isTourId(candidate.tourId)) return;
    const tourId = candidate.tourId;

    let timer = 0;
    const attempt = () => {
      if (isUiBusy()) {
        timer = window.setTimeout(attempt, BUSY_RETRY_MS);
        return;
      }
      const tour = getTour(tourId);
      const steps = resolveTourSteps(tour, { role, isTargetPresent: (target) => findTourTarget(target) !== null });
      const store = useTourStore.getState();
      if (steps.length === 0) {
        if (candidate.explicit) store.clearPendingTour();
        return;
      }
      store.beginTour(tourId);
      setSession((previous) => ({ key: (previous?.key ?? 0) + 1, tour, steps }));
    };
    timer = window.setTimeout(attempt, candidate.explicit ? REPLAY_DELAY_MS : AUTO_START_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [hydrated, userId, role, seen, activeTourId, pendingTourId, screen, deferredTourId]);

  // Leaving the screen closes its tour without marking it: it shows again next time.
  useEffect(() => {
    if (!activeTourId || activeTourId === WELCOME_TOUR_ID || screen?.tourId === activeTourId) return;
    const timer = window.setTimeout(() => {
      const store = useTourStore.getState();
      if (store.activeTourId === activeTourId && store.screen?.tourId !== activeTourId) store.endTour(null, null);
    }, SCREEN_LEAVE_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [activeTourId, screen]);

  // Logging out closes any tour.
  useEffect(() => {
    if (!userId && activeTourId) useTourStore.getState().endTour(null, null);
  }, [userId, activeTourId]);

  if (!session || !userId || activeTourId !== session.tour.id) return null;

  return (
    <GuidedTour
      key={session.key}
      tour={session.tour}
      steps={session.steps}
      onClose={(outcome) => useTourStore.getState().endTour(userId, outcome)}
    />
  );
}
