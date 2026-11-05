'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { GraduationCap, KeyRound, LifeBuoy, LogOut, UsersRound } from 'lucide-react';
import { USER_ROLE_LABELS } from '@/core/domain/entities/club.types';
import { can } from '@/core/domain/rules/permissions';
import { PASSWORD_CHANGE_PATH } from '@/core/application/auth/auth-session';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { LinkButton } from '@/presentation/atoms/LinkButton/LinkButton';
import { ThemeToggle } from '@/presentation/molecules/ThemeToggle/ThemeToggle';
import { SyncStatusIndicator } from '@/presentation/organisms/SyncStatusIndicator/SyncStatusIndicator';
import { logoutWithConfirmation } from '@/presentation/session/logout';
import { useTourControls } from '@/presentation/tour/useScreenTour';
import styles from './UserMenu.module.css';

export interface UserMenuProps {
  /** `rail`: stacked in the tablet nav rail. `inline`: horizontal card (phones). */
  variant?: 'rail' | 'inline';
  className?: string;
}

/**
 * Authenticated user (S10.8): name, role from the server, sync status, help, own
 * password change and logout. On phones it also links the administrator to Usuarios
 * (the tablet rail has its own item). Replaces the simulated role switcher.
 */
/** First letters of the first and last words: "Alejandro Martinez" -> "AM". */
const initials = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : name.slice(0, 2);
  return letters.toUpperCase();
};

export const UserMenu: React.FC<UserMenuProps> = ({ variant = 'inline', className }) => {
  const router = useRouter();
  const currentUser = useClubStore((state) => state.currentUser);
  const { screenTourId, replayScreenTour } = useTourControls();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logoutWithConfirmation((path) => router.replace(path));
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <section
      className={clsx(styles.userMenu, variant === 'rail' ? styles.rail : styles.inline, className)}
      aria-label="Sesión"
      data-tour="user-menu"
    >
      <div className={styles.userInfo}>
        <div className={styles.avatar} aria-hidden="true">
          {initials(currentUser.name)}
        </div>
        <div className={styles.userDetails}>
          <span className={styles.userName}>{currentUser.name}</span>
          <span className={styles.roleTitle}>{USER_ROLE_LABELS[currentUser.role]}</span>
        </div>
        {variant === 'rail' && <ThemeToggle className={styles.themeToggle} />}
      </div>

      <SyncStatusIndicator className={styles.syncStatus} />

      <LinkButton
        href="/help"
        variant="ghost"
        fullWidth={variant === 'rail'}
        className={styles.menuLink}
        leftIcon={<LifeBuoy size={ICON_SIZE.md} />}
      >
        Ayuda y manual
      </LinkButton>

      {variant === 'inline' && can(currentUser.role, 'MANAGE_USERS') && (
        <LinkButton
          href="/users"
          variant="ghost"
          className={styles.menuLink}
          leftIcon={<UsersRound size={ICON_SIZE.md} />}
        >
          Usuarios
        </LinkButton>
      )}

      <LinkButton
        href={PASSWORD_CHANGE_PATH}
        variant="ghost"
        fullWidth={variant === 'rail'}
        className={styles.menuLink}
        leftIcon={<KeyRound size={ICON_SIZE.md} />}
      >
        Cambiar contraseña
      </LinkButton>

      {screenTourId && (
        <TouchButton
          variant="ghost"
          fullWidth={variant === 'rail'}
          className={styles.menuLink}
          leftIcon={<GraduationCap size={ICON_SIZE.md} />}
          onClick={replayScreenTour}
        >
          Ver tutorial de esta pantalla
        </TouchButton>
      )}

      <TouchButton
        variant="ghost"
        fullWidth={variant === 'rail'}
        className={styles.logoutButton}
        leftIcon={<LogOut size={ICON_SIZE.md} />}
        onClick={() => void handleLogout()}
        disabled={isLoggingOut}
      >
        {isLoggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
      </TouchButton>
    </section>
  );
};
