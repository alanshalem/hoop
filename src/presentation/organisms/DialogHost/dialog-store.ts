import type { ReactNode } from 'react';
import { create } from 'zustand';

/**
 * In-app replacement for the blocking browser dialogs (S1).
 * Requests are queued and rendered one at a time by <DialogHost /> (mounted once in the root layout).
 */

export type DialogTone = 'info' | 'success' | 'warning' | 'danger';

export interface NotifyOptions {
  title: string;
  message: ReactNode;
  tone?: DialogTone;
  /** Defaults to "Entendido". */
  confirmLabel?: string;
}

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  tone?: DialogTone;
  /** Defaults to "Confirmar". */
  confirmLabel?: string;
  /** Defaults to "Cancelar". */
  cancelLabel?: string;
}

interface NotifyRequest {
  id: number;
  kind: 'notify';
  options: NotifyOptions;
  resolve: () => void;
}

interface ConfirmRequest {
  id: number;
  kind: 'confirm';
  options: ConfirmOptions;
  resolve: (accepted: boolean) => void;
}

export type DialogRequest = NotifyRequest | ConfirmRequest;

type NewDialogRequest = Omit<NotifyRequest, 'id'> | Omit<ConfirmRequest, 'id'>;

interface DialogStoreState {
  queue: DialogRequest[];
  enqueue: (request: NewDialogRequest) => void;
  /** Resolves the request with `accepted` and removes it from the queue. */
  settle: (id: number, accepted: boolean) => void;
}

let nextDialogId = 1;

export const useDialogStore = create<DialogStoreState>()((set, get) => ({
  queue: [],
  enqueue: (request) => {
    const entry: DialogRequest = { ...request, id: nextDialogId++ };
    set((state) => ({ queue: [...state.queue, entry] }));
  },
  settle: (id, accepted) => {
    const entry = get().queue.find((request) => request.id === id);
    if (!entry) return;
    set((state) => ({ queue: state.queue.filter((request) => request.id !== id) }));
    if (entry.kind === 'confirm') {
      entry.resolve(accepted);
    } else {
      entry.resolve();
    }
  },
}));

/** Shows an informational dialog. Resolves when the user dismisses it. */
export const notify = (options: NotifyOptions): Promise<void> =>
  new Promise<void>((resolve) => {
    useDialogStore.getState().enqueue({ kind: 'notify', options, resolve });
  });

/** Asks the user to confirm. Resolves `true` on confirm, `false` on cancel / Escape / overlay. */
export const confirm = (options: ConfirmOptions): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    useDialogStore.getState().enqueue({ kind: 'confirm', options, resolve });
  });

const dialogApi = { notify, confirm } as const;

/** Hook form of the dialog API, for components that prefer hooks over module imports. */
export const useDialog = () => dialogApi;
