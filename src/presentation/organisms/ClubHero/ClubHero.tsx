'use client';

import React, { useRef } from 'react';
import { CLUB_BRAND } from '@/presentation/brand';
import { ClubCrest } from '@/presentation/atoms/ClubCrest/ClubCrest';
import { MOTION, gsap } from '@/presentation/motion/motion';
import { useMotion } from '@/presentation/motion/useMotion';
import styles from './ClubHero.module.css';

export interface ClubHeroProps {
  title: string;
  subtitle?: React.ReactNode;
  /** Extra controls under the copy (e.g. the phone role switcher). */
  actions?: React.ReactNode;
}

/** Club-black page hero: crest, display title, slogan and the outlined founding year. */
export const ClubHero: React.FC<ClubHeroProps> = ({ title, subtitle, actions }) => {
  const heroRef = useRef<HTMLElement | null>(null);
  const crestRef = useRef<HTMLImageElement | null>(null);
  const glowRef = useRef<HTMLSpanElement | null>(null);
  const yearRef = useRef<HTMLSpanElement | null>(null);

  // Crest pops in, then floats; the red glow breathes behind it.
  useMotion(
    () => {
      gsap
        .timeline()
        .fromTo(
          crestRef.current,
          { scale: 0.85, opacity: 0 },
          { scale: 1, opacity: 1, duration: MOTION.duration.slow, ease: MOTION.ease.pop }
        )
        .to(crestRef.current, { y: -6, duration: 3, ease: MOTION.ease.soft, repeat: -1, yoyo: true });
      gsap.fromTo(
        glowRef.current,
        { opacity: 0.45, scale: 0.92 },
        { opacity: 1, scale: 1.05, duration: 3, ease: MOTION.ease.soft, repeat: -1, yoyo: true }
      );
      gsap.fromTo(
        yearRef.current,
        { x: 40, opacity: 0 },
        { x: 0, opacity: 1, duration: MOTION.duration.slow * 2, ease: MOTION.ease.out, delay: 0.15 }
      );
    },
    { scope: heroRef }
  );

  return (
    <section ref={heroRef} className={styles.hero} data-surface="board">
      <span ref={yearRef} className={styles.year} aria-hidden="true">
        {CLUB_BRAND.foundedYear}
      </span>

      <div className={styles.crestWrap}>
        <span ref={glowRef} className={styles.crestGlow} aria-hidden="true" />
        <ClubCrest ref={crestRef} size={120} eager className={styles.crest} />
      </div>

      <div className={styles.copy}>
        <p className={styles.eyebrow}>
          {CLUB_BRAND.clubName} · {CLUB_BRAND.productName}
        </p>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        <p className={styles.slogan}>{CLUB_BRAND.slogan}</p>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </section>
  );
};
