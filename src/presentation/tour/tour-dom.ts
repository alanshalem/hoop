'use client';

import { useDialogStore } from '@/presentation/organisms/DialogHost/dialog-store';

/**
 * First rendered element with `data-tour="<id>"`. The same id may live in the
 * tablet rail and in the phone bars; only the visible one counts.
 */
export function findTourTarget(id: string): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(id)}"]`);
  for (const element of candidates) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden') return element;
  }
  return null;
}

/** A notify/confirm dialog or a modal sheet is open: tours must wait. */
export const isUiBusy = (): boolean =>
  useDialogStore.getState().queue.length > 0 || document.documentElement.dataset.scrollLocked === 'true';

export const isDialogOpen = (): boolean => useDialogStore.getState().queue.length > 0;
