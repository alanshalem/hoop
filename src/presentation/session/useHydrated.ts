'use client';

import { useSyncExternalStore } from 'react';

const subscribeNever = () => () => undefined;

/**
 * False during prerender and hydration, true afterwards. Guards UI that depends
 * on browser-only data (persisted stores, the clock) against hydration mismatches.
 */
export const useHydrated = (): boolean =>
  useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );
