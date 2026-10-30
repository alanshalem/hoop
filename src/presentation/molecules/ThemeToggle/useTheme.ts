'use client';

import { useSyncExternalStore } from 'react';
import { THEME_STORAGE_KEY, type Theme } from './theme';

// The `data-theme` attribute on <html> is the single source of truth.
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getTheme = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

const getServerTheme = (): Theme => 'dark';

export const setTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable (private mode); the theme still applies for this session.
  }
  listeners.forEach((listener) => listener());
};

export const useTheme = () => {
  const theme = useSyncExternalStore(subscribe, getTheme, getServerTheme);
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  return { theme, setTheme, toggleTheme };
};
