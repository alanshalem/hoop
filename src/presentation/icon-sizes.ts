/**
 * Shared lucide-react icon sizes (px).
 * xs/sm: inline with text, md: navigation and buttons, lg: section heroes, xl: empty states and dialogs.
 */
export const ICON_SIZE = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const;

export type IconSize = keyof typeof ICON_SIZE;
