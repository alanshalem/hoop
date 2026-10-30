'use client';

import React, { useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  LayoutDashboard,
  Radio,
  Shield,
  Users,
  type LucideIcon,
} from 'lucide-react';
import clsx from 'clsx';
import { USER_ROLE_LABELS, UserRoleSchema, type UserRole } from '@/core/domain/entities/club.types';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { ThemeToggle } from '@/presentation/molecules/ThemeToggle/ThemeToggle';
import { ClubCrest } from '@/presentation/atoms/ClubCrest/ClubCrest';
import { CLUB_BRAND } from '@/presentation/brand';
import { usePageEnter, useStaggerReveal } from '@/presentation/motion/useMotion';
import { useNavIndicator } from '@/presentation/motion/useNavIndicator';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import styles from './TabletAppShell.module.css';

export interface TabletAppShellProps {
  children: React.ReactNode;
}

interface NavItem {
  label: string;
  /** Shorter label for the mobile bottom bar. */
  shortLabel: string;
  href: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', shortLabel: 'Inicio', href: '/', icon: LayoutDashboard },
  { label: 'Divisiones', shortLabel: 'Equipos', href: '/divisions', icon: Shield },
  { label: 'Jugadores', shortLabel: 'Plantel', href: '/players', icon: Users },
  { label: 'Partidos', shortLabel: 'Fechas', href: '/matches', icon: CalendarDays },
];

// The mobile bottom bar places the live button between these two halves.
const BOTTOM_LEFT_ITEMS = NAV_ITEMS.slice(0, 2);
const BOTTOM_RIGHT_ITEMS = NAV_ITEMS.slice(2);

const LIVE_HREF = '/matches/live';

const isLivePath = (pathname: string) => pathname === LIVE_HREF || pathname.endsWith('/live');

const isNavItemActive = (pathname: string, href: string) => {
  if (href === '/') return pathname === '/';
  return pathname.startsWith(href) && !isLivePath(pathname);
};

export const TabletAppShell: React.FC<TabletAppShellProps> = ({ children }) => {
  const pathname = usePathname();
  const currentUser = useClubStore((state) => state.currentUser);
  const switchRole = useClubStore((state) => state.switchRole);
  const isLiveActive = isLivePath(pathname);
  const activeHref = NAV_ITEMS.find((item) => isNavItemActive(pathname, item.href))?.href ?? null;

  const mainRef = useRef<HTMLElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const indicatorRef = useRef<HTMLSpanElement | null>(null);
  usePageEnter(mainRef);
  useStaggerReveal(mainRef);
  useNavIndicator(navRef, indicatorRef, activeHref);

  const renderBottomItem = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = isNavItemActive(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={clsx(styles.bottomItem, isActive && styles.bottomItemActive)}
        aria-current={isActive ? 'page' : undefined}
      >
        <Icon size={ICON_SIZE.lg} aria-hidden="true" />
        <span>{item.shortLabel}</span>
      </Link>
    );
  };

  return (
    <div className={styles.shellContainer}>
      {/* Tablet navigation rail (left side) */}
      <aside className={styles.navRail}>
        <div className={styles.railTop}>
          <Link
            href="/"
            className={styles.brandSection}
            aria-label={`${CLUB_BRAND.productName} · ${CLUB_BRAND.clubName}, ir al inicio`}
          >
            <ClubCrest size={48} eager className={styles.brandCrest} />
            <span className={styles.brandText}>
              <span className={styles.brandTitle}>{CLUB_BRAND.productName}</span>
              <span className={styles.brandSubtitle}>{CLUB_BRAND.clubShortName} · Básquet</span>
            </span>
          </Link>

          <nav ref={navRef} className={styles.navLinks} aria-label="Navegación principal">
            <span ref={indicatorRef} className={styles.navIndicator} aria-hidden="true" />
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = isNavItemActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(styles.navItem, isActive && styles.navItemActive)}
                  aria-current={isActive ? 'page' : undefined}
                  data-nav-key={item.href}
                >
                  <Icon size={ICON_SIZE.md} aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <Link
            href={LIVE_HREF}
            className={clsx(styles.liveButtonRail, isLiveActive && styles.liveButtonActive)}
            aria-current={isLiveActive ? 'page' : undefined}
          >
            <Radio size={ICON_SIZE.md} aria-hidden="true" />
            <span>Partido en vivo</span>
          </Link>
        </div>

        <div className={styles.roleSection}>
          <label htmlFor="shell-role-select" className={styles.userLabel}>
            Rol activo
          </label>
          <select
            id="shell-role-select"
            className={styles.roleSelector}
            value={currentUser.role}
            onChange={(event) => switchRole(event.target.value as UserRole)}
          >
            {UserRoleSchema.options.map((role) => (
              <option key={role} value={role}>
                {USER_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <div className={styles.userRow}>
            <span className={styles.userName}>{currentUser.name}</span>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <main ref={mainRef} className={styles.mainContent}>
        {children}
      </main>

      {/* Mobile bottom navigation (thumb zone) */}
      <nav className={styles.bottomBar} aria-label="Navegación móvil inferior">
        {BOTTOM_LEFT_ITEMS.map(renderBottomItem)}
        <Link
          href={LIVE_HREF}
          className={clsx(styles.bottomLiveAction, isLiveActive && styles.bottomLiveActive)}
          aria-label="Partido en vivo"
          aria-current={isLiveActive ? 'page' : undefined}
        >
          <Radio size={ICON_SIZE.lg} aria-hidden="true" />
        </Link>
        {BOTTOM_RIGHT_ITEMS.map(renderBottomItem)}
      </nav>
    </div>
  );
};
