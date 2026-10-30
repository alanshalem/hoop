'use client';

import React from 'react';
import clsx from 'clsx';
import { ShieldCheck, UserCheck, BarChart3 } from 'lucide-react';
import { UserRole } from '@/core/domain/entities/club.types';
import { useClubStore } from '@/core/application/stores/useClubStore';
import styles from './UserRoleSwitcher.module.css';

export const UserRoleSwitcher: React.FC<{ className?: string }> = ({ className }) => {
  const { currentUser, switchRole } = useClubStore();

  const roles: Array<{ role: UserRole; label: string; icon: React.ReactNode }> = [
    { role: 'HEAD_COACH', label: 'Entrenador', icon: <UserCheck size={16} /> },
    { role: 'ASSISTANT_STATISTICIAN', label: 'Planillero', icon: <BarChart3 size={16} /> },
    { role: 'ADMIN', label: 'Admin', icon: <ShieldCheck size={16} /> },
  ];

  return (
    <div className={clsx(styles.roleSwitcherContainer, className)}>
      <div className={styles.userInfo}>
        <div className={styles.avatar}>
          {currentUser.name.slice(0, 2).toUpperCase()}
        </div>
        <div className={styles.userDetails}>
          <span className={styles.userName}>{currentUser.name}</span>
          <span className={styles.roleTitle}>
            {currentUser.role === 'HEAD_COACH' && 'Director Técnico'}
            {currentUser.role === 'ASSISTANT_STATISTICIAN' && 'Estadísticas / Planilla'}
            {currentUser.role === 'ADMIN' && 'Administrador General'}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '4px' }}>
        {roles.map((item) => (
          <button
            key={item.role}
            type="button"
            className={clsx(
              styles.roleOption,
              currentUser.role === item.role && styles.roleActive
            )}
            onClick={() => switchRole(item.role)}
            aria-pressed={currentUser.role === item.role}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

