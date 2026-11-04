'use client';

import React, { useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  LifeBuoy,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Shield,
  Swords,
  Users,
  type LucideIcon,
} from 'lucide-react';
import clsx from 'clsx';
import { ClubCrest } from '@/presentation/atoms/ClubCrest/ClubCrest';
import { UserMenu } from '@/presentation/organisms/UserMenu/UserMenu';
import { SyncStatusIndicator } from '@/presentation/organisms/SyncStatusIndicator/SyncStatusIndicator';
import { CLUB_BRAND } from '@/presentation/brand';
import { usePageEnter, useStaggerReveal } from '@/presentation/motion/useMotion';
import { useNavIndicator } from '@/presentation/motion/useNavIndicator';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { useNavCollapsed } from './useNavCollapsed';
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
  /** `data-tour` anchor of the welcome tour (rail and bottom bar share it). */
  tourTarget: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', shortLabel: 'Inicio', href: '/', icon: LayoutDashboard, tourTarget: 'nav-dashboard' },
  { label: 'Divisiones', shortLabel: 'Equipos', href: '/divisions', icon: Shield, tourTarget: 'nav-divisions' },
  { label: 'Jugadores', shortLabel: 'Plantel', href: '/players', icon: Users, tourTarget: 'nav-players' },
  { label: 'Partidos', shortLabel: 'Fechas', href: '/matches', icon: CalendarDays, tourTarget: 'nav-matches' },
];

const HELP_ITEM: NavItem = {
  label: 'Ayuda',
  shortLabel: 'Ayuda',
  href: '/ayuda',
  icon: LifeBuoy,
  tourTarget: 'nav-help',
};

const CHART_CATALOG_ITEM: NavItem = {
  label: 'Planilla',
  shortLabel: 'Planilla',
  href: '/planilla',
  icon: ClipboardList,
  tourTarget: 'nav-planilla',
};

// Rail only: on phones the rival rosters open from the Partidos header, so the top bar keeps its width.
const RIVALS_ITEM: NavItem = {
  label: 'Rivales',
  shortLabel: 'Rivales',
  href: '/rivales',
  icon: Swords,
  tourTarget: 'nav-rivales',
};

// The rail closes with the chart catalog and the manual; on phones both live in the top bar
// so the bottom bar stays balanced around the live button.
const TOP_BAR_ITEMS: NavItem[] = [CHART_CATALOG_ITEM, HELP_ITEM];
const RAIL_ITEMS: NavItem[] = [...NAV_ITEMS, RIVALS_ITEM, ...TOP_BAR_ITEMS];

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
  const isLiveActive = isLivePath(pathname);
  const activeHref = RAIL_ITEMS.find((item) => isNavItemActive(pathname, item.href))?.href ?? null;

  const { collapsed: navCollapsed, setNavCollapsed } = useNavCollapsed();
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
        data-tour={item.tourTarget}
      >
        <Icon size={ICON_SIZE.lg} aria-hidden="true" />
        <span>{item.shortLabel}</span>
      </Link>
    );
  };

  return (
    <div className={clsx(styles.shellContainer, navCollapsed && styles.navCollapsed)}>
      {/* Tablet navigation rail (left side); it can be hidden so wide tables get the full width. */}
      <aside className={styles.navRail}>
        <div className={styles.railTop}>
          <button
            type="button"
            className={styles.railToggle}
            onClick={() => setNavCollapsed(true)}
            aria-label="Ocultar menú"
            title="Ocultar menú"
          >
            <PanelLeftClose size={ICON_SIZE.md} aria-hidden="true" />
          </button>
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
            {RAIL_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = isNavItemActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(styles.navItem, isActive && styles.navItemActive)}
                  aria-current={isActive ? 'page' : undefined}
                  data-nav-key={item.href}
                  data-tour={item.tourTarget}
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
            data-tour="nav-live"
          >
            <Radio size={ICON_SIZE.md} aria-hidden="true" />
            <span>Partido en vivo</span>
          </Link>
        </div>

        <UserMenu variant="rail" className={styles.userSection} />
      </aside>

      {/* Mobile top bar: brand + sync status (the rail holds both on tablet) */}
      <header className={styles.mobileTopBar}>
        <Link href="/" className={styles.mobileBrand} aria-label={`${CLUB_BRAND.productName}, ir al inicio`}>
          <ClubCrest size={32} eager />
          <span className={styles.mobileBrandTitle}>{CLUB_BRAND.productName}</span>
        </Link>
        <div className={styles.mobileTopActions}>
          <SyncStatusIndicator compact />
          <button
            type="button"
            className={clsx(styles.mobileTopLink, !navCollapsed && styles.mobileTopLinkActive)}
            onClick={() => setNavCollapsed(!navCollapsed)}
            aria-label={navCollapsed ? 'Mostrar menú' : 'Ocultar menú'}
            aria-pressed={!navCollapsed}
          >
            <Menu size={ICON_SIZE.lg} aria-hidden="true" />
          </button>
          {TOP_BAR_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeHref === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(styles.mobileTopLink, isActive && styles.mobileTopLinkActive)}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                data-tour={item.tourTarget}
              >
                <Icon size={ICON_SIZE.lg} aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </header>

      <main ref={mainRef} className={styles.mainContent}>
        {children}
      </main>

      {/* Brings the hidden navigation back, on every screen size. */}
      {navCollapsed && (
        <button
          type="button"
          className={styles.floatingNavToggle}
          onClick={() => setNavCollapsed(false)}
          aria-label="Mostrar menú"
        >
          <PanelLeftOpen size={ICON_SIZE.md} aria-hidden="true" />
          <span>Menú</span>
        </button>
      )}

      {/* Mobile bottom navigation (thumb zone) */}
      <nav className={styles.bottomBar} aria-label="Navegación móvil inferior">
        {BOTTOM_LEFT_ITEMS.map(renderBottomItem)}
        <Link
          href={LIVE_HREF}
          className={clsx(styles.bottomLiveAction, isLiveActive && styles.bottomLiveActive)}
          aria-label="Partido en vivo"
          aria-current={isLiveActive ? 'page' : undefined}
          data-tour="nav-live"
        >
          <Radio size={ICON_SIZE.lg} aria-hidden="true" />
        </Link>
        {BOTTOM_RIGHT_ITEMS.map(renderBottomItem)}
      </nav>
    </div>
  );
};
