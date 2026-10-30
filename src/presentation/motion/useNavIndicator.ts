'use client';

import type { RefObject } from 'react';
import { useGSAP } from '@gsap/react';
import { MOTION, MOTION_OK_QUERY, gsap } from './motion';

// Each page mounts its own shell, so the last position survives route changes here.
let lastIndicatorY: number | null = null;

/**
 * Slides the nav rail indicator to the item marked `data-nav-key={activeKey}`.
 * Hidden when no item is active (for example on the live console).
 */
export function useNavIndicator(
  navRef: RefObject<HTMLElement | null>,
  indicatorRef: RefObject<HTMLElement | null>,
  activeKey: string | null
) {
  useGSAP(
    () => {
      const nav = navRef.current;
      const indicator = indicatorRef.current;
      if (!nav || !indicator) return;

      const active = activeKey ? nav.querySelector<HTMLElement>(`[data-nav-key="${activeKey}"]`) : null;
      if (!active) {
        gsap.set(indicator, { autoAlpha: 0 });
        return;
      }

      const targetY = active.offsetTop;
      const fromY = lastIndicatorY ?? targetY;
      lastIndicatorY = targetY;
      gsap.set(indicator, { autoAlpha: 1, y: fromY });

      if (fromY === targetY || !window.matchMedia(MOTION_OK_QUERY).matches) {
        gsap.set(indicator, { y: targetY });
        return;
      }
      gsap.to(indicator, { y: targetY, duration: MOTION.duration.base, ease: MOTION.ease.out });
    },
    { scope: navRef, dependencies: [activeKey] }
  );
}
