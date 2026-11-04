/** Shown for an optional player field that has no value (S4). */
export const MISSING_VALUE = '—';

/** "190 cm", or a dash when the height is unknown (S4). */
export function formatPlayerHeight(heightCm: number | undefined): string {
  return heightCm === undefined ? MISSING_VALUE : `${heightCm} cm`;
}
