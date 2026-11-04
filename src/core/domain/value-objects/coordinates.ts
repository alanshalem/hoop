import { z } from 'zod';

/**
 * =============================================================================
 * HOOP - VALUE OBJECT: COURT COORDINATES
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
