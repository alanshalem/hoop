'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Shield,
  Users,
  CalendarDays,
  Radio,
  Flame,
} from 'lucide-react';
import clsx from 'clsx';
import { UserRole } from '@/core/domain/entities/club.types';
import styles from './TabletAppShell.module.css';

export interface TabletAppShellProps {
  children: React.ReactNode;
  activeRole?: UserRole;
  onRoleChange?: (role: UserRole) => void;
}

export const TabletAppShell: React.FC<TabletAppShellProps> = ({
  children,
  activeRole: externalRole,
  onRoleChange,
}) => {
  const pathname = usePathname();
  const [internalRole, setInternalRole] = useState<UserRole>('HEAD_COACH');

  const currentRole = externalRole || internalRole;

  const handleRoleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRole = e.target.value as UserRole;
    if (onRoleChange) {
      onRoleChange(newRole);
    } else {
      setInternalRole(newRole);
    }
  };

  const navItems = [
    { label: 'Dashboard', href: '/', icon: LayoutDashboard },
    { label: 'Divisiones', href: '/divisions', icon: Shield },
    { label: 'Jugadores', href: '/players', icon: Users },
    { label: 'Partidos', href: '/matches', icon: CalendarDays },
  ];

  return (
    <div className={styles.shellContainer}>
      {/* -----------------------------------------------------------------------
          TABLET NAVIGATION RAIL (Landscape / Portrait Left Side)
          ----------------------------------------------------------------------- */}
      <aside className={styles.navRail}>
        <div>
          <div className={styles.brandSection}>
            <div className={styles.logoIcon}>
              <Flame size={22} />
            </div>
            <div className={styles.brandText}>
              <span className={styles.brandTitle}>HOOP OS</span>
              <span className={styles.brandSubtitle}>FIBA PRO STATS</span>
            </div>
          </div>

          <nav className={styles.navLinks} aria-label="Navegación principal">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    styles.navItem,
                    isActive && styles.navItemActive
                  )}
                >
                  <Icon size={20} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <Link
            href="/matches/live"
            className={styles.liveButtonRail}
            aria-label="Abrir modo partido en vivo"
          >
            <Radio size={18} />
            <span>MODO PARTIDO (LIVE)</span>
          </Link>
        </div>

        <div className={styles.roleSection}>
          <span className={styles.userLabel}>Rol activo (Simulado)</span>
          <select
            className={styles.roleSelector}
            value={currentRole}
            onChange={handleRoleSelect}
            aria-label="Seleccionar rol de usuario activo"
          >
            <option value="HEAD_COACH">Entrenador Principal</option>
            <option value="ASSISTANT_STATISTICIAN">Asistente Planillero</option>
            <option value="ADMIN">Administrador de Club</option>
          </select>
        </div>
      </aside>

      {/* -----------------------------------------------------------------------
          MAIN CONTENT VIEWPORT
          ----------------------------------------------------------------------- */}
      <main className={styles.mainContent}>{children}</main>

      {/* -----------------------------------------------------------------------
          MOBILE BOTTOM NAVIGATION (Fixed in Thumb Zone)
          ----------------------------------------------------------------------- */}
      <nav className={styles.bottomBar} aria-label="Navegación móvil inferior">
        <Link
          href="/"
          className={clsx(
            styles.bottomItem,
            pathname === '/' && styles.bottomItemActive
          )}
        >
          <LayoutDashboard size={20} />
          <span>Inicio</span>
        </Link>

        <Link
          href="/divisions"
          className={clsx(
            styles.bottomItem,
            pathname.startsWith('/divisions') && styles.bottomItemActive
          )}
        >
          <Shield size={20} />
          <span>Equipos</span>
        </Link>

        <Link
          href="/matches/live"
          className={styles.bottomLiveAction}
          aria-label="Ir a partido en vivo"
        >
          <Radio size={24} />
        </Link>

        <Link
          href="/players"
          className={clsx(
            styles.bottomItem,
            pathname.startsWith('/players') && styles.bottomItemActive
          )}
        >
          <Users size={20} />
          <span>Plantel</span>
        </Link>

        <Link
          href="/matches"
          className={clsx(
            styles.bottomItem,
            pathname.startsWith('/matches') &&
              !pathname.includes('/live') &&
              styles.bottomItemActive
          )}
        >
          <CalendarDays size={20} />
          <span>Fechas</span>
        </Link>
      </nav>
    </div>
  );
};

