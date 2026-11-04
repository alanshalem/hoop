'use client';

import { useEffect } from 'react';
import { useForm, type DefaultValues, type FieldValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';

export interface ModalFormOptions<TValues extends FieldValues> {
  schema: z.ZodType<TValues, TValues>;
  isOpen: boolean;
  /** Loaded every time the sheet opens, and again whenever they change while it is open: memoize them. */
  defaults: DefaultValues<NoInfer<TValues>>;
}

/** react-hook-form validated by `schema`, reset to `defaults` when its sheet opens. */
export function useModalForm<TValues extends FieldValues>({ schema, isOpen, defaults }: ModalFormOptions<TValues>) {
  const form = useForm<TValues>({ resolver: zodResolver(schema), defaultValues: defaults });
  const { reset } = form;

  useEffect(() => {
    if (isOpen) reset(defaults);
  }, [isOpen, defaults, reset]);

  return form;
}
