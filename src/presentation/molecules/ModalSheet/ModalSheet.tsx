'use client';

import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { X } from 'lucide-react';
import clsx from 'clsx';
import styles from './ModalSheet.module.css';

export interface ModalSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export const ModalSheet: React.FC<ModalSheetProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  className,
}) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    // GSAP Animate IN
    const ctx = gsap.context(() => {
      gsap.fromTo(
        overlayRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.25, ease: 'power2.out' }
      );

      const isTablet = window.innerWidth >= 768;
      if (isTablet) {
        gsap.fromTo(
          sheetRef.current,
          { opacity: 0, scale: 0.92, y: 20 },
          { opacity: 1, scale: 1, y: 0, duration: 0.3, ease: 'back.out(1.2)' }
        );
      } else {
        gsap.fromTo(
          sheetRef.current,
          { y: '100%' },
          { y: '0%', duration: 0.32, ease: 'power3.out' }
        );
      }
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      ctx.revert();
    };
  }, [isOpen, onClose]);

  const handleCloseWithAnimation = () => {
    if (!overlayRef.current || !sheetRef.current) {
      onClose();
      return;
    }

    const isTablet = window.innerWidth >= 768;
    const tl = gsap.timeline({
      onComplete: onClose,
    });

    tl.to(overlayRef.current, { opacity: 0, duration: 0.2, ease: 'power2.in' });

    if (isTablet) {
      tl.to(
        sheetRef.current,
        { opacity: 0, scale: 0.95, y: 15, duration: 0.2, ease: 'power2.in' },
        0
      );
    } else {
      tl.to(
        sheetRef.current,
        { y: '100%', duration: 0.25, ease: 'power3.in' },
        0
      );
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === overlayRef.current) {
          handleCloseWithAnimation();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div ref={sheetRef} className={clsx(styles.sheet, className)}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={handleCloseWithAnimation}
            aria-label="Cerrar modal"
          >
            <X size={20} />
          </button>
        </div>

        <div className={clsx(styles.body, 'no-scrollbar')}>{children}</div>

        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
};

