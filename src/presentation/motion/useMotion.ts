'use client';

import { useRef, type RefObject } from 'react';
import { useGSAP } from '@gsap/react';
import { MOTION, MOTION_OK_QUERY, gsap } from './motion';

type ScopeRef = RefObject<HTMLElement | SVGElement | null>;

interface MotionConfig {
  scope?: ScopeRef;
  dependencies?: unknown[];
}

/**
 * `useGSAP` that only animates under `prefers-reduced-motion: no-preference`.
 * Every tween is reverted on unmount, on dependency change and when the media query flips.
 */
export function useMotion(animate: () => void, { scope, dependencies = [] }: MotionConfig = {}) {
  useGSAP(
    () => {
      const mm = gsap.matchMedia(scope?.current ?? undefined);
      mm.add(MOTION_OK_QUERY, () => animate());
      return () => mm.revert();
    },
    { scope, dependencies }
  );
}

/** Runs `animate(previous, current)` whenever `value` changes after the first render. */
export function useMotionOnChange<T>(
  value: T,
  animate: (previous: T, current: T) => void,
  { scope }: Omit<MotionConfig, 'dependencies'> = {}
) {
  const previous = useRef(value);
  useGSAP(
    () => {
      if (Object.is(previous.current, value)) return;
      const before = previous.current;
      previous.current = value;
      const mm = gsap.matchMedia(scope?.current ?? undefined);
      mm.add(MOTION_OK_QUERY, () => animate(before, value));
      return () => mm.revert();
    },
    { scope, dependencies: [value] }
  );
}

/** Page entrance: the sections of the page container slide up in sequence. */
export function usePageEnter(scope: ScopeRef) {
  useMotion(
    () => {
      const sections = scope.current?.firstElementChild?.children;
      if (!sections || sections.length === 0) return;
      gsap.fromTo(
        sections,
        { opacity: 0, y: 16 },
        {
          opacity: 1,
          y: 0,
          duration: MOTION.duration.slow,
          stagger: MOTION.stagger,
          ease: MOTION.ease.out,
          clearProps: 'opacity,transform',
        }
      );
    },
    { scope }
  );
}

/** Staggered reveal of the cards matched by `selector` inside `scope`. */
export function useStaggerReveal(scope: ScopeRef, selector = '[data-reveal]', dependencies: unknown[] = []) {
  useMotion(
    () => {
      const items = gsap.utils.toArray<HTMLElement>(selector, scope.current ?? undefined);
      if (items.length === 0) return;
      gsap.fromTo(
        items,
        { opacity: 0, y: 20, scale: 0.98 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: MOTION.duration.slow,
          delay: 0.08,
          stagger: MOTION.stagger,
          ease: MOTION.ease.out,
          clearProps: 'opacity,transform',
        }
      );
    },
    { scope, dependencies }
  );
}
