'use client';

import React from 'react';
import clsx from 'clsx';
import { ShieldCheck, UserCheck, BarChart3, type LucideIcon } from 'lucide-react';
import { USER_ROLE_LABELS, UserRole } from '@/core/domain/entities/club.types';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import styles from './UserRoleSwitcher.module.css';

const ROLE_OPTIONS: Array<{ role: UserRole; icon: LucideIcon }> = [
  { role: 'HEAD_COACH', icon: UserCheck },
  { role: 'ASSISTANT_STATISTICIAN', icon: BarChart3 },
  { role: 'ADMIN', icon: ShieldCheck },
];

export const UserRoleSwitcher: React.FC<{ className?: string }> = ({ className }) => {
  const currentUser = useClubStore((state) => state.currentUser);
  const switchRole = useClubStore((state) => state.switchRole);

  return (
    <div className={clsx(styles.roleSwitcherContainer, className)}>
      <div className={styles.userInfo}>
        <div className={styles.avatar} aria-hidden="true">
          {currentUser.name.slice(0, 2).toUpperCase()}
        </div>
        <div className={styles.userDetails}>
          <span className={styles.userName}>{currentUser.name}</span>
          <span className={styles.roleTitle}>{USER_ROLE_LABELS[currentUser.role]}</span>
        </div>
      </div>

      <div className={styles.roleOptions} role="group" aria-label="Cambiar rol activo">
        {ROLE_OPTIONS.map(({ role, icon: Icon }) => (
          <button
            key={role}
            type="button"
            className={clsx(styles.roleOption, currentUser.role === role && styles.roleActive)}
            onClick={() => switchRole(role)}
            aria-pressed={currentUser.role === role}
          >
            <Icon size={ICON_SIZE.sm} aria-hidden="true" />
            <span>{USER_ROLE_LABELS[role]}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
