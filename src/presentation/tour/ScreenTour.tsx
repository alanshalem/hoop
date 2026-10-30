'use client';

import type { ScreenTourId } from './tour-model';
import { useScreenTour } from './useScreenTour';

/** `useScreenTour` for server-rendered pages: renders nothing. */
export function ScreenTour({ tourId }: { tourId: ScreenTourId }) {
  useScreenTour(tourId);
  return null;
}
