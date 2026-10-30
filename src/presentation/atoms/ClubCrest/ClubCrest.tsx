import React from 'react';
import Image from 'next/image';
import clsx from 'clsx';
import { CLUB_BRAND } from '@/presentation/brand';
import styles from './ClubCrest.module.css';

export interface ClubCrestProps {
  /** Rendered square size in px (the source is 512 x 512). */
  size: number;
  /** Above-the-fold crests (nav rail, hero, login) load eagerly. */
  eager?: boolean;
  className?: string;
}

/** Club Atlético Monte Grande crest. */
export const ClubCrest = React.forwardRef<HTMLImageElement, ClubCrestProps>(
  ({ size, eager = false, className }, ref) => (
    <Image
      ref={ref}
      src={CLUB_BRAND.crestSrc}
      alt={CLUB_BRAND.crestAlt}
      width={size}
      height={size}
      loading={eager ? 'eager' : 'lazy'}
      className={clsx(styles.crest, className)}
    />
  )
);

ClubCrest.displayName = 'ClubCrest';
