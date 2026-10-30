'use client';

import React, { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Check, ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { MOTION, MOTION_OK_QUERY, gsap } from '@/presentation/motion/motion';
import { ClubCrest } from '@/presentation/atoms/ClubCrest/ClubCrest';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { nextStepIndex, previousStepIndex, tourProgress, type TourDefinition, type TourStep } from './tour-model';
import { computeTourLayout, type TourLayout } from './tour-layout';
import type { TourOutcome } from './tour-seen-state';
import { findTourTarget, isDialogOpen } from './tour-dom';
import styles from './GuidedTour.module.css';

export interface GuidedTourProps {
  tour: TourDefinition;
  /** Resolved steps (role and on-screen targets already filtered). Never empty. */
  steps: TourStep[];
  onClose: (outcome: TourOutcome) => void;
}

const SPACING = { spotlightPadding: 8, gap: 18, margin: 12, arrowInset: 24 } as const;

/** Mirrors the docked card breakpoint in GuidedTour.module.css. */
const DOCKED_QUERY = '(max-width: 639px)';

const FOCUSABLE_SELECTOR = 'button:not([disabled]), a[href]';

const motionOk = () => window.matchMedia(MOTION_OK_QUERY).matches;

const isInViewport = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  return rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
};

/**
 * Guided tour overlay (S12): dims the screen, cuts a spotlight around the
 * target, and shows a card with an arrow pointing at it. Clicks on the dimmed
 * area and on the highlighted element are blocked so nothing is skipped by
 * accident on a tablet.
 */
export function GuidedTour({ tour, steps, onClose }: GuidedTourProps) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const progress = tourProgress(index, steps.length);
  const isCentered = step.target === null;

  const titleId = useId();
  const bodyId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const spotlightRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const arrowRef = useRef<HTMLSpanElement | null>(null);
  const arrowShapeRef = useRef<HTMLSpanElement | null>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const closingRef = useRef(false);

  const close = (outcome: TourOutcome) => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (!motionOk() || !rootRef.current) {
      onClose(outcome);
      return;
    }
    gsap.to(rootRef.current, {
      opacity: 0,
      duration: MOTION.duration.fast,
      ease: MOTION.ease.in,
      onComplete: () => onClose(outcome),
    });
  };

  const goNext = () => {
    const next = nextStepIndex(index, steps.length);
    if (next === null) close('completed');
    else setIndex(next);
  };

  const goBack = () => {
    const previous = previousStepIndex(index);
    if (previous !== null) setIndex(previous);
  };

  /** Measures the target and the card, then moves the spotlight, the card and the arrow. */
  const place = useEffectEvent((animate: boolean): TourLayout | null => {
    const card = cardRef.current;
    const spotlight = spotlightRef.current;
    const arrow = arrowRef.current;
    if (!card || !spotlight || !arrow) return null;

    const target = step.target ? findTourTarget(step.target) : null;
    const rect = target?.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const layout = computeTourLayout({
      target: rect ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : null,
      card: { width: card.offsetWidth, height: card.offsetHeight },
      viewport,
      placement: step.placement,
      docked: window.matchMedia(DOCKED_QUERY).matches,
      ...SPACING,
    });

    // Without target the cutout collapses to the center: the whole screen is dimmed.
    const cutout = layout.spotlight ?? { x: viewport.width / 2, y: viewport.height / 2, width: 0, height: 0 };
    spotlight.dataset.empty = String(layout.spotlight === null);
    gsap.to(spotlight, {
      x: cutout.x,
      y: cutout.y,
      width: cutout.width,
      height: cutout.height,
      duration: animate && motionOk() ? MOTION.duration.base : 0,
      ease: MOTION.ease.out,
      overwrite: 'auto',
    });

    gsap.set(card, { left: layout.card.x, top: layout.card.y });
    card.dataset.side = layout.side;

    if (layout.arrow) {
      arrow.dataset.edge = layout.arrow.edge;
      gsap.set(arrow, { autoAlpha: 1, '--arrow-offset': `${layout.arrow.offset}px` });
    } else {
      gsap.set(arrow, { autoAlpha: 0 });
    }
    return layout;
  });

  // Overlay entrance; focus moves into the card and returns on close.
  // A layout effect declared first, so it reads the focus before the step effect moves it.
  useLayoutEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The first spotlight grows from the center of the screen.
    if (spotlightRef.current) gsap.set(spotlightRef.current, { x: window.innerWidth / 2, y: window.innerHeight / 2 });
    if (rootRef.current && motionOk()) {
      gsap.fromTo(rootRef.current, { opacity: 0 }, { opacity: 1, duration: MOTION.duration.base, ease: MOTION.ease.out });
    }
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, []);

  // Each step: bring the target into view, morph the spotlight, slide the card in, nudge the arrow.
  useLayoutEffect(() => {
    const target = step.target ? findTourTarget(step.target) : null;
    if (target && !isInViewport(target)) target.scrollIntoView({ block: 'center', inline: 'nearest' });

    const layout = place(true);
    const card = cardRef.current;
    const shape = arrowShapeRef.current;
    const animated = motionOk();

    if (card) {
      // Visible right away (only the opacity fades) so the card can take focus.
      gsap.set(card, { visibility: 'visible' });
      if (animated) {
        gsap.fromTo(
          card,
          { opacity: 0, y: layout?.side === 'top' ? -10 : 10 },
          { opacity: 1, y: 0, duration: MOTION.duration.base, ease: MOTION.ease.out, overwrite: 'auto' }
        );
      } else {
        gsap.set(card, { opacity: 1, y: 0 });
      }
    }

    primaryRef.current?.focus({ preventScroll: true });

    const nudge =
      animated && layout?.arrow && shape
        ? gsap.to(shape, { y: -4, duration: 0.6, ease: MOTION.ease.soft, repeat: -1, yoyo: true })
        : null;
    return () => {
      nudge?.kill();
      if (shape) gsap.set(shape, { y: 0 });
    };
  }, [index, step.target]);

  // Follow the target on scroll (any container), resize and layout changes.
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => place(false));
    };
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule);
    const target = step.target ? findTourTarget(step.target) : null;
    if (target) observer.observe(target);
    if (cardRef.current) observer.observe(cardRef.current);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      observer.disconnect();
    };
  }, [step.target]);

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    // A notify/confirm dialog above the tour owns the keyboard.
    if (isDialogOpen() || closingRef.current) return;
    const card = cardRef.current;
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        close('skipped');
        return;
      case 'ArrowRight':
        event.preventDefault();
        goNext();
        return;
      case 'ArrowLeft':
        event.preventDefault();
        goBack();
        return;
      case 'Enter':
        // A focused card button handles Enter itself.
        if (event.target instanceof HTMLElement && event.target.closest('button') && card?.contains(event.target)) return;
        event.preventDefault();
        goNext();
        return;
      case 'Tab': {
        if (!card) return;
        const focusable = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const outside = !card.contains(document.activeElement);
        if (event.shiftKey && (outside || document.activeElement === first)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (outside || document.activeElement === last)) {
          event.preventDefault();
          first.focus();
        }
      }
    }
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handleKeyDown(event);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return createPortal(
    <div ref={rootRef} className={styles.root}>
      {/* Swallows every pointer event outside the card: no accidental skips, no clicks on the target. */}
      <div className={styles.blocker} aria-hidden="true" />
      <div ref={spotlightRef} className={styles.spotlight} aria-hidden="true" />

      <div
        ref={cardRef}
        className={clsx(styles.card, isCentered && styles.cardCentered)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <span ref={arrowRef} className={styles.arrow} aria-hidden="true">
          <span ref={arrowShapeRef} className={styles.arrowShape} />
        </span>

        {isCentered && <ClubCrest size={72} eager className={styles.crest} />}

        <p className={styles.eyebrow}>
          <span>{tour.title}</span>
          <span className="tabular-nums">
            Paso {progress.current} de {progress.total}
          </span>
        </p>
        <h2 id={titleId} className={styles.title}>
          {step.title}
        </h2>
        <p id={bodyId} className={styles.body}>
          {step.body}
        </p>
        {step.example && (
          <p className={styles.example}>
            <Lightbulb size={ICON_SIZE.sm} aria-hidden="true" className={styles.exampleIcon} />
            <span>{step.example}</span>
          </p>
        )}

        <div className={styles.dots} aria-hidden="true">
          {steps.map((item, dotIndex) => (
            <span
              key={`${item.target ?? 'center'}-${dotIndex}`}
              className={clsx(styles.dot, dotIndex === index && styles.dotActive, dotIndex < index && styles.dotDone)}
            />
          ))}
        </div>

        <div className={styles.actions}>
          {!progress.isLast && (
            <TouchButton variant="ghost" className={styles.skipButton} onClick={() => close('skipped')}>
              Saltar tutorial
            </TouchButton>
          )}
          <div className={styles.navButtons}>
            <TouchButton
              variant="secondary"
              leftIcon={<ChevronLeft size={ICON_SIZE.md} />}
              disabled={progress.isFirst}
              onClick={goBack}
            >
              Atrás
            </TouchButton>
            <TouchButton
              ref={primaryRef}
              rightIcon={progress.isLast ? <Check size={ICON_SIZE.md} /> : <ChevronRight size={ICON_SIZE.md} />}
              onClick={goNext}
            >
              {progress.isLast ? 'Finalizar' : 'Siguiente'}
            </TouchButton>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
