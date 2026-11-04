'use client';

import React, { useMemo } from 'react';
import {
  CHART_CATEGORY_LABELS,
  ChartToneSchema,
  type ChartCategory,
  type ChartCode,
} from '@/core/domain/entities/chart.types';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { TextField } from '@/presentation/atoms/TextField/TextField';
import { SelectField, type SelectFieldOption } from '@/presentation/atoms/SelectField/SelectField';
import { notify } from '@/presentation/organisms/DialogHost/dialog-store';
import { FormModalSheet } from '@/presentation/templates/FormModalSheet/FormModalSheet';
import { useModalForm } from '@/presentation/hooks/useModalForm';
import { applyRefusal } from '@/presentation/hooks/apply-refusal';
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
  const createChartCode = useClubStore((state) => state.createChartCode);
  const updateChartCode = useClubStore((state) => state.updateChartCode);

  const defaults = useMemo(
    () =>
      codeToEdit
        ? { symbol: codeToEdit.symbol, label: codeToEdit.label, tone: codeToEdit.tone }
        : { symbol: '', label: '', tone: defaultChartTone(category) },
    [codeToEdit, category]
  );
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useModalForm({ schema: ChartCodeFormSchema, isOpen, defaults });

  const onSubmit = async (data: ChartCodeFormData) => {
    const result = codeToEdit
      ? updateChartCode(category, codeToEdit.code, data)
      : createChartCode({ category, ...data });
    await applyRefusal(result, {
      messages: CHART_CODE_REFUSAL_MESSAGES,
      fieldOf: (reason) => (reason === 'INVALID_SYMBOL' ? 'symbol' : reason === 'INVALID_LABEL' ? 'label' : null),
      setError,
      close: onClose,
      warn: (message) => notify({ title: 'No se pudo guardar el código', message, tone: 'warning' }),
    });
  };

  return (
    <FormModalSheet
      isOpen={isOpen}
      onClose={onClose}
      title={codeToEdit ? 'Editar código' : `Nuevo código · ${CHART_CATEGORY_LABELS[category]}`}
      submitLabel={codeToEdit ? 'Guardar cambios' : 'Agregar código'}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit(onSubmit)}
      formClassName={styles.form}
    >
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
    </FormModalSheet>
  );
};
