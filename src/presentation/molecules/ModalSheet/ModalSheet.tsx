'use client';

import React, { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import styles from './ModalSheet.module.css';

export type ModalSheetSize = 'sm' | 'md' | 'lg';

export interface ModalSheetProps {
  isOpen: boolean;
  /** Requested close (Escape, overlay click, close button). The parent sets `isOpen` to false. */
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  size?: ModalSheetSize;
  /** Called once the exit animation finished and the sheet is unmounted. */
  onExited?: () => void;
  /** Id of the element that describes the dialog (e.g. the message of a confirmation). */
  ariaDescribedBy?: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const SIZE_CLASS: Record<ModalSheetSize, string> = {
  sm: styles.sizeSm,
  md: styles.sizeMd,
  lg: styles.sizeLg,
};

// Open sheets in stacking order: only the top-most one reacts to the keyboard.
const openSheetStack: string[] = [];

const syncScrollLock = () => {
  if (openSheetStack.length > 0) {
    document.documentElement.dataset.scrollLocked = 'true';
  } else {
    delete document.documentElement.dataset.scrollLocked;
  }
};

const getFocusable = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

export const ModalSheet: React.FC<ModalSheetProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  className,
  size = 'md',
  onExited,
  ariaDescribedBy,
}) => {
  const sheetId = useId();
  const titleId = `${sheetId}-title`;
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // Keeps the sheet mounted while the exit animation runs.
  const [isRendered, setIsRendered] = useState(isOpen);
  if (isOpen && !isRendered) {
    setIsRendered(true);
  }

  const handleExited = useEffectEvent(() => {
    setIsRendered(false);
    onExited?.();
  });

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (openSheetStack[openSheetStack.length - 1] !== sheetId) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    // Keep keyboard focus inside the sheet.
    if (event.key === 'Tab' && sheetRef.current) {
      const focusable = getFocusable(sheetRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  // Enter / exit animations (GPU-friendly: opacity + transform only).
  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    const sheet = sheetRef.current;
    if (!overlay || !sheet) return;

    const isTablet = window.matchMedia('(min-width: 768px)').matches;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const speed = reducedMotion ? 0 : 1;

    const ctx = gsap.context(() => {
      if (isOpen) {
        gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.25 * speed, ease: 'power2.out' });
        if (isTablet) {
          gsap.fromTo(
            sheet,
            { opacity: 0, scale: 0.94, y: 20 },
            { opacity: 1, scale: 1, y: 0, duration: 0.3 * speed, ease: 'back.out(1.2)' }
          );
        } else {
          gsap.fromTo(sheet, { yPercent: 100 }, { yPercent: 0, duration: 0.32 * speed, ease: 'power3.out' });
        }
        return;
      }

      const timeline = gsap.timeline({ onComplete: () => handleExited() });
      timeline.to(overlay, { opacity: 0, duration: 0.2 * speed, ease: 'power2.in' });
      if (isTablet) {
        timeline.to(sheet, { opacity: 0, scale: 0.95, y: 15, duration: 0.2 * speed, ease: 'power2.in' }, 0);
      } else {
        timeline.to(sheet, { yPercent: 100, duration: 0.25 * speed, ease: 'power3.in' }, 0);
      }
    });

    return () => ctx.revert();
  }, [isOpen]);

  // Stack registration, scroll lock, keyboard handling and focus management.
  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    openSheetStack.push(sheetId);
    syncScrollLock();

    const sheet = sheetRef.current;
    const initialFocus =
      sheet?.querySelector<HTMLElement>('[data-autofocus]') ??
      (bodyRef.current ? getFocusable(bodyRef.current)[0] : undefined) ??
      sheet;
    initialFocus?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => handleKeyDown(event);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      const index = openSheetStack.lastIndexOf(sheetId);
      if (index !== -1) openSheetStack.splice(index, 1);
      syncScrollLock();
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [isOpen, sheetId]);

  if (!isRendered) return null;

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={(event) => {
        if (isOpen && event.target === overlayRef.current) onClose();
      }}
    >
      <div
        ref={sheetRef}
        className={clsx(styles.sheet, SIZE_CLASS[size], className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={ariaDescribedBy}
        tabIndex={-1}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            disabled={!isOpen}
            aria-label="Cerrar"
          >
            <X size={ICON_SIZE.md} />
          </button>
        </div>

        <div ref={bodyRef} className={clsx(styles.body, 'no-scrollbar')}>
          {children}
        </div>

        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
};
