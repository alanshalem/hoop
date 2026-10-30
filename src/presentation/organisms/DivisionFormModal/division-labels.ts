import type { DivisionCategory } from '@/core/domain/entities/club.types';

export const DIVISION_CATEGORY_LABELS: Record<DivisionCategory, string> = {
  PRIMERA: 'Primera',
  U21: 'Sub-21',
  U19: 'Sub-19',
  U17: 'Sub-17',
  U15: 'Sub-15',
  U13: 'Sub-13',
  MINI: 'Mini básquet',
  FEMENINO: 'Femenino',
  CUSTOM: 'Otra categoría',
};

/** Youth categories whose players can be called up to the first team. */
export const isYouthCategory = (category: DivisionCategory): boolean =>
  category !== 'PRIMERA' && category !== 'FEMENINO' && category !== 'CUSTOM';
