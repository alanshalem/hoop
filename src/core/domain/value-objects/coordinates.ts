import { z } from 'zod';

/**
 * =============================================================================
 * HOOP OS - VALUE OBJECT: COURT COORDINATES
 * Half-court normalized coordinate system (0% to 100%)
 * =============================================================================
 */

export const CourtCoordinatesSchema = z.object({
  /**
   * Horizontal position along court width (0 = left sideline, 50 = basket center axis, 100 = right sideline).
   */
  x: z
    .number()
    .min(0, 'X coordinate must be >= 0%')
    .max(100, 'X coordinate must be <= 100%'),
  /**
   * Vertical distance from the baseline under the hoop (0 = baseline, 100 = half-court line).
   */
  y: z
    .number()
    .min(0, 'Y coordinate must be >= 0%')
    .max(100, 'Y coordinate must be <= 100%'),
});

export type CourtCoordinates = z.infer<typeof CourtCoordinatesSchema>;

/**
 * Distance calculation in normalized court space (useful for automatic 2pt vs 3pt zone determination).
 */
export function calculateNormalizedDistance(
  p1: CourtCoordinates,
  p2: CourtCoordinates
): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

