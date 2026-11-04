import type { Division } from '@/core/domain/entities/club.types';

/** Filter value that selects every item. */
export const ALL = 'ALL';
/** Filter value of the items whose division no longer exists (or that have none). */
export const NO_DIVISION = 'NO_DIVISION';
export const DELETED_DIVISION_LABEL = 'División eliminada';

export interface DivisionChip {
  value: string;
  label: string;
  count: number;
}

/** "Todas", one chip per division, then the orphan chip when `orphanLabel` is given (there are orphans). */
export function buildDivisionChips(
  divisions: ReadonlyArray<Pick<Division, 'id' | 'name'>>,
  countOf: (value: string) => number,
  orphanLabel: string | null
): DivisionChip[] {
  const chips = [
    { value: ALL, label: 'Todas' },
    ...divisions.map((division) => ({ value: division.id, label: division.name })),
    ...(orphanLabel ? [{ value: NO_DIVISION, label: orphanLabel }] : []),
  ];
  return chips.map((chip) => ({ ...chip, count: countOf(chip.value) }));
}
