'use client';

import React from 'react';
import clsx from 'clsx';
import { Moon, Sun } from 'lucide-react';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { useTheme } from './useTheme';
import styles from './ThemeToggle.module.css';

export interface ThemeToggleProps {
  /** Shows the "Tema claro/oscuro" text next to the icon. */
  showLabel?: boolean;
  className?: string;
}

/** Switches between the dark (default) and light themes; persisted in localStorage. */
export const ThemeToggle: React.FC<ThemeToggleProps> = ({ showLabel = false, className }) => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const label = isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';

  return (
    <button
      type="button"
      className={clsx(styles.themeToggle, showLabel && styles.withLabel, className)}
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      {isDark ? <Sun size={ICON_SIZE.md} aria-hidden="true" /> : <Moon size={ICON_SIZE.md} aria-hidden="true" />}
      {showLabel && <span>{isDark ? 'Tema claro' : 'Tema oscuro'}</span>}
    </button>
  );
};
