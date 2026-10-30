'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { LogOut } from 'lucide-react';
import { USER_ROLE_LABELS } from '@/core/domain/entities/club.types';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { ThemeToggle } from '@/presentation/molecules/ThemeToggle/ThemeToggle';
import { SyncStatusIndicator } from '@/presentation/organisms/SyncStatusIndicator/SyncStatusIndicator';
import { logoutWithConfirmation } from '@/presentation/session/logout';
import styles from './UserMenu.module.css';

export interface UserMenuProps {
  /** `rail`: stacked in the tablet nav rail. `inline`: horizontal card (phones). */
  variant?: 'rail' | 'inline';
  className?: string;
}

/**
 * Authenticated user (S10.8): name, role from the server, sync status and logout.
 * Replaces the simulated role switcher.
 */
export const UserMenu: React.FC<UserMenuProps> = ({ variant = 'inline', className }) => {
  const router = useRouter();
  const currentUser = useClubStore((state) => state.currentUser);
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
    >
      <div className={styles.userInfo}>
        <div className={styles.avatar} aria-hidden="true">
          {currentUser.name.slice(0, 2).toUpperCase()}
        </div>
        <div className={styles.userDetails}>
          <span className={styles.userName}>{currentUser.name}</span>
          <span className={styles.roleTitle}>{USER_ROLE_LABELS[currentUser.role]}</span>
        </div>
        {variant === 'rail' && <ThemeToggle className={styles.themeToggle} />}
      </div>

      <SyncStatusIndicator className={styles.syncStatus} />

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
