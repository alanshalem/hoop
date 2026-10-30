'use client';

import { useSyncExternalStore } from 'react';

const CLOCK_TICK_MS = 30_000;

const subscribe = (onTick: () => void) => {
  const id = setInterval(onTick, CLOCK_TICK_MS);
  return () => clearInterval(id);
};

// Rounded to the tick so the snapshot is stable between renders.
const getSnapshot = () => Math.floor(Date.now() / CLOCK_TICK_MS) * CLOCK_TICK_MS;

const getServerSnapshot = () => 0;

/** Current time (ms), refreshed every 30 s, for relative labels such as "hace 2 min". */
export const useClock = (): number => useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
