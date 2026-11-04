'use client';

import { useSyncExternalStore } from 'react';
import { NAV_COLLAPSED_STORAGE_KEY, parseNavCollapsed, serializeNavCollapsed } from './nav-collapse';

const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const readCollapsed = (): boolean => {
  try {
    return parseNavCollapsed(localStorage.getItem(NAV_COLLAPSED_STORAGE_KEY));
  } catch {
    return false;
  }
};

// The server never knows the device preference: render the menu open, then apply it on the client.
const getServerCollapsed = (): boolean => false;

const setNavCollapsed = (collapsed: boolean) => {
  try {
    localStorage.setItem(NAV_COLLAPSED_STORAGE_KEY, serializeNavCollapsed(collapsed));
  } catch {
    // Storage can be unavailable (private mode); the preference is simply not remembered.
  }
  listeners.forEach((listener) => listener());
};

export const useNavCollapsed = () => {
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, getServerCollapsed);
  return { collapsed, setNavCollapsed };
};
