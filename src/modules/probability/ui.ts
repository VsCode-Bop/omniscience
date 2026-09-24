/**
 * Contrat des onglets du module Probabilités & statistiques (composants : core/widgets).
 */
import type { Painter } from '../../core/graphics/painter';
import type { ChartPalette, Rect } from './charts';

export { html, numberField, parseNum, pct, section, segmented, statGrid } from '../../core/widgets';

/** Zone survolable d'un graphique (info-bulle). */
export interface Hit {
  rect: Rect;
  html: string;
}

export interface TabHost {
  invalidate(): void;
  /** L'état partageable a changé. */
  notify(): void;
  toast(message: string, kind?: 'info' | 'success' | 'error'): void;
  renderTex(el: HTMLElement, tex: string): boolean;
}

export interface Tab {
  readonly panel: HTMLElement;
  draw(p: Painter, area: Rect, pal: ChartPalette, k: number, hits: Hit[]): void;
  /** Rendu KaTeX une fois la bibliothèque chargée. */
  renderTex?(): void;
  destroy?(): void;
}
