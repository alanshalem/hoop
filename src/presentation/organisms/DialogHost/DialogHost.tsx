'use client';

import React, { useEffect, useEffectEvent, useId, useState } from 'react';
import clsx from 'clsx';
import { CircleCheck, Info, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react';
import { ModalSheet } from '@/presentation/molecules/ModalSheet/ModalSheet';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import type { TouchButtonVariant } from '@/presentation/atoms/TouchButton/touch-button-styles';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { useDialogStore, type DialogTone } from './dialog-store';
import styles from './DialogHost.module.css';

const TONE_ICON: Record<DialogTone, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: OctagonAlert,
};

const TONE_CLASS: Record<DialogTone, string> = {
  info: styles.toneInfo,
  success: styles.toneSuccess,
  warning: styles.toneWarning,
  danger: styles.toneDanger,
};

const CONFIRM_VARIANT: Record<DialogTone, TouchButtonVariant> = {
  info: 'primary',
  success: 'success',
  warning: 'primary',
  danger: 'danger',
};

const isInteractiveTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement && target.closest('button, a, input, select, textarea') !== null;

/** Renders queued notify/confirm dialogs one at a time. Mount once in the root layout. */
export const DialogHost: React.FC = () => {
  const current = useDialogStore((state) => state.queue[0]);
  const settle = useDialogStore((state) => state.settle);
  const messageId = useId();

  // Result chosen for the current dialog while its exit animation runs.
  const [pending, setPending] = useState<{ id: number; accepted: boolean } | null>(null);
  const isOpen = current !== undefined && pending?.id !== current.id;

  const close = (accepted: boolean) => {
    if (!current || pending) return;
    setPending({ id: current.id, accepted });
  };

  const handleExited = () => {
    if (!pending) return;
    settle(pending.id, pending.accepted);
    setPending(null);
  };

  // Enter confirms when focus is not on a control that handles Enter itself.
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.defaultPrevented || isInteractiveTarget(event.target)) return;
    event.preventDefault();
    close(true);
  });

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => handleKeyDown(event);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  if (!current) return null;

  const { options } = current;
  const tone = options.tone ?? 'info';
  const ToneIcon = TONE_ICON[tone];
  const isConfirm = current.kind === 'confirm';
  const confirmLabel = options.confirmLabel ?? (isConfirm ? 'Confirmar' : 'Entendido');
  const cancelLabel = current.kind === 'confirm' ? (current.options.cancelLabel ?? 'Cancelar') : null;

  return (
    <ModalSheet
      key={current.id}
      isOpen={isOpen}
      onClose={() => close(false)}
      onExited={handleExited}
      title={options.title}
      size="sm"
      layer="dialog"
      ariaDescribedBy={messageId}
      footer={
        <>
          {cancelLabel && (
            <TouchButton variant="secondary" size="lg" onClick={() => close(false)}>
              {cancelLabel}
            </TouchButton>
          )}
          <TouchButton
            variant={CONFIRM_VARIANT[tone]}
            size="lg"
            onClick={() => close(true)}
            data-autofocus
          >
            {confirmLabel}
          </TouchButton>
        </>
      }
    >
      <div className={styles.content}>
        <span className={clsx(styles.toneIcon, TONE_CLASS[tone])} aria-hidden="true">
          <ToneIcon size={ICON_SIZE.xl} />
        </span>
        <div id={messageId} className={styles.message}>
          {options.message}
        </div>
      </div>
    </ModalSheet>
  );
};
