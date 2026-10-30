import type { Quarter } from '@/core/domain/entities/match.types';

/** Compact period codes for scoreboards and tables. */
export const QUARTER_SHORT_LABELS: Record<Quarter, string> = {
  Q1: '1C',
  Q2: '2C',
  Q3: '3C',
  Q4: '4C',
  OT1: 'S1',
  OT2: 'S2',
  OT3: 'S3',
  OT4: 'S4',
};

/** Full period names for dialogs and accessible labels. */
export const QUARTER_LABELS: Record<Quarter, string> = {
  Q1: '1.er cuarto',
  Q2: '2.º cuarto',
  Q3: '3.er cuarto',
  Q4: '4.º cuarto',
  OT1: '1.er suplementario',
  OT2: '2.º suplementario',
  OT3: '3.er suplementario',
  OT4: '4.º suplementario',
};
