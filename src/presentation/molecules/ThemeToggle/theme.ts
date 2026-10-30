/* Server-safe theme constants (imported by the root layout and the client hook). */

export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'hoop-theme';

/**
 * Inline script for <head>: applies the stored theme before the first paint
 * so light-theme users do not see a dark flash.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t}}catch(e){}`;
