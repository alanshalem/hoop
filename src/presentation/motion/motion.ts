'use client';

import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

/** Animations only run when the user did not ask for reduced motion. */
export const MOTION_OK_QUERY = '(prefers-reduced-motion: no-preference)';

/** Shared easings and timings (CSS mirrors `--ease-out` in globals.css). */
export const MOTION = {
  ease: {
    out: 'power3.out',
    in: 'power2.in',
    pop: 'back.out(1.7)',
    soft: 'sine.inOut',
  },
  duration: {
    fast: 0.18,
    base: 0.32,
    slow: 0.5,
  },
  stagger: 0.06,
} as const;

export { gsap };
