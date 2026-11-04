/** Device preference: the navigation (tablet rail, phone bottom bar) can be hidden to give content the room. */
export const NAV_COLLAPSED_STORAGE_KEY = 'hoop-nav-collapsed';

export const parseNavCollapsed = (value: string | null): boolean => value === 'true';

export const serializeNavCollapsed = (collapsed: boolean): string => String(collapsed);
