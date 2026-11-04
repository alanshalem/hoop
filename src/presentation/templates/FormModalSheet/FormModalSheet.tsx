'use client';

import React, { useId } from 'react';
import { Save } from 'lucide-react';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { ModalSheet, type ModalSheetSize } from '@/presentation/molecules/ModalSheet/ModalSheet';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';

export interface FormModalSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  size?: ModalSheetSize;
  submitLabel: string;
  /** Disables the submit button while the form saves. */
  isSubmitting: boolean;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  formClassName?: string;
  /** Footer actions shown before Cancelar (e.g. Eliminar). */
  extraActions?: React.ReactNode;
  children: React.ReactNode;
}

/** Sheet holding one form, with the Cancelar / submit footer bound to it. */
export const FormModalSheet: React.FC<FormModalSheetProps> = ({
  isOpen,
  onClose,
  title,
  size,
  submitLabel,
  isSubmitting,
  onSubmit,
  formClassName,
  extraActions,
  children,
}) => {
  const formId = useId();

  return (
    <ModalSheet
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size={size}
      footer={
        <>
          {extraActions}
          <TouchButton variant="ghost" onClick={onClose}>
            Cancelar
          </TouchButton>
          <TouchButton type="submit" form={formId} disabled={isSubmitting} leftIcon={<Save size={ICON_SIZE.md} />}>
            {submitLabel}
          </TouchButton>
        </>
      }
    >
      <form id={formId} className={formClassName} onSubmit={onSubmit} noValidate>
        {children}
      </form>
    </ModalSheet>
  );
};
