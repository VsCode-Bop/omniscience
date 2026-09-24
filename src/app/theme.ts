/** Thème clair / sombre / automatique (suit le système), mémorisé localement. */

export type ThemePref = 'light' | 'dark' | 'auto';
const KEY = 'omni:theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function apply(pref: ThemePref): void {
  const dark = pref === 'dark' || (pref === 'auto' && media.matches);
  const theme = dark ? 'dark' : 'light';
  if (document.documentElement.dataset.theme !== theme) {
    document.documentElement.dataset.theme = theme;
    window.dispatchEvent(new CustomEvent('omni:themechange'));
  }
}

export function setThemePref(pref: ThemePref): void {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* navigation privée : on applique sans mémoriser */
  }
  apply(pref);
}

export function cycleTheme(): ThemePref {
  const order: ThemePref[] = ['auto', 'light', 'dark'];
  const next = order[(order.indexOf(getThemePref()) + 1) % order.length];
  setThemePref(next);
  return next;
}

export function initTheme(): void {
  apply(getThemePref());
  media.addEventListener('change', () => apply(getThemePref()));
}

export const THEME_LABELS: Record<ThemePref, string> = {
  auto: 'Thème : automatique',
  light: 'Thème : clair',
  dark: 'Thème : sombre',
};
