'use client';

import React, { useEffect, useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import {
  CHART_CATEGORY_LABELS,
  ChartToneSchema,
  type ChartCategory,
  type ChartCode,
} from '@/core/domain/entities/chart.types';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { ModalSheet } from '@/presentation/molecules/ModalSheet/ModalSheet';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { TextField } from '@/presentation/atoms/TextField/TextField';
import { SelectField, type SelectFieldOption } from '@/presentation/atoms/SelectField/SelectField';
import { notify } from '@/presentation/organisms/DialogHost/dialog-store';
import {
  CHART_CODE_REFUSAL_MESSAGES,
  CHART_TONE_LABELS,
  ChartCodeFormSchema,
  defaultChartTone,
  type ChartCodeFormData,
} from './chart-code-form';
import styles from './ChartCodeFormModal.module.css';

const TONE_OPTIONS: SelectFieldOption[] = ChartToneSchema.options.map((tone) => ({
  value: tone,
  label: CHART_TONE_LABELS[tone],
}));

export interface ChartCodeFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: ChartCategory;
  /** Edits this code of `category`; adds a custom code to it when absent. */
  codeToEdit?: ChartCode | null;
}

export const ChartCodeFormModal: React.FC<ChartCodeFormModalProps> = ({ isOpen, onClose, category, codeToEdit }) => {
  const formId = useId();
  const createChartCode = useClubStore((state) => state.createChartCode);
  const updateChartCode = useClubStore((state) => state.updateChartCode);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChartCodeFormData>({
    resolver: zodResolver(ChartCodeFormSchema),
    defaultValues: { symbol: '', label: '', tone: defaultChartTone(category) },
  });

  useEffect(() => {
    if (!isOpen) return;
    reset(
      codeToEdit
        ? { symbol: codeToEdit.symbol, label: codeToEdit.label, tone: codeToEdit.tone }
        : { symbol: '', label: '', tone: defaultChartTone(category) }
    );
  }, [isOpen, codeToEdit, category, reset]);

  const onSubmit = async (data: ChartCodeFormData) => {
    const result = codeToEdit
      ? updateChartCode(category, codeToEdit.code, data)
      : createChartCode({ category, ...data });
    if (result.ok) {
      onClose();
      return;
    }
    if (result.reason === 'INVALID_SYMBOL') {
      setError('symbol', { message: CHART_CODE_REFUSAL_MESSAGES.INVALID_SYMBOL });
      return;
    }
    if (result.reason === 'INVALID_LABEL') {
      setError('label', { message: CHART_CODE_REFUSAL_MESSAGES.INVALID_LABEL });
      return;
    }
    onClose();
    await notify({
      title: 'No se pudo guardar el código',
      message: CHART_CODE_REFUSAL_MESSAGES[result.reason],
      tone: 'warning',
    });
  };

  return (
    <ModalSheet
      isOpen={isOpen}
      onClose={onClose}
      title={codeToEdit ? 'Editar código' : `Nuevo código · ${CHART_CATEGORY_LABELS[category]}`}
      footer={
        <>
          <TouchButton variant="ghost" onClick={onClose}>
            Cancelar
          </TouchButton>
          <TouchButton type="submit" form={formId} disabled={isSubmitting} leftIcon={<Save size={ICON_SIZE.md} />}>
            {codeToEdit ? 'Guardar cambios' : 'Agregar código'}
          </TouchButton>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
        <TextField
          label="Símbolo"
          placeholder="Ej. PT"
          hint="De 1 a 3 caracteres, el que se anota junto al dorsal."
          required
          autoComplete="off"
          error={errors.symbol?.message}
          {...register('symbol')}
        />
        <SelectField label="Tono" options={TONE_OPTIONS} error={errors.tone?.message} {...register('tone')} />
        <TextField
          label="Nombre"
          placeholder="Ej. Juego en el poste"
          hint="De 1 a 40 caracteres."
          required
          autoComplete="off"
          error={errors.label?.message}
          containerClassName={styles.fullRow}
          {...register('label')}
        />
        <p className={styles.note}>
          {codeToEdit
            ? 'Las entradas ya cargadas con este código se verán con el nuevo símbolo, nombre y tono.'
            : 'El código nuevo aparece al final de la categoría en el panel de carga en vivo.'}
        </p>
      </form>
    </ModalSheet>
  );
};
