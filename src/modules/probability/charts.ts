/**
 * Graphiques statistiques dessinés via Painter (écran, SVG, PDF) : repère à
 * graduations « rondes », barres, courbes, zones, boîte à moustaches, nuage de points.
 */
import { disc, line, MATH_FONT, type Painter, type TextStyle } from '../../core/graphics/painter';
import { fmt } from '../../core/math/format';
import { niceStep } from '../../core/math/numeric';
import type { Palette } from '../grapher/renderer';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AxesOptions {
  xLabel?: string;
  yLabel?: string;
  /** Graduations entières seulement en abscisse. */
  integerX?: boolean;
  /** Ordonnées affichées en pourcentage. */
  percentY?: boolean;
  /** Graduations entières seulement en ordonnée (effectifs). */
  integerY?: boolean;
  /** Graduations imposées en abscisse (barres qualitatives). */
  xTicks?: { value: number; label: string }[];
}

export interface ChartPalette extends Palette {
  accent: string;
  accentSoft: string;
  danger: string;
}

function ticks(min: number, max: number, px: number, target: number): number[] {
  const step = niceStep(((max - min) * target) / Math.max(px, 1));
  const out: number[] = [];
  for (let k = Math.ceil(min / step - 1e-9); k * step <= max + step * 1e-9 && out.length < 60; k++) out.push(Number((k * step).toPrecision(12)));
  return out;
}

/** Repère cartésien dans un rectangle de la scène. */
export class Axes {
  readonly plot: Rect;

  constructor(
    readonly rect: Rect,
    public x0: number,
    public x1: number,
    public y0: number,
    public y1: number,
    readonly opts: AxesOptions = {},
    readonly k = 1,
  ) {
    const left = 58 * k;
    const bottom = (opts.xLabel ? 44 : 30) * k;
    this.plot = { x: rect.x + left, y: rect.y + 12 * k, w: Math.max(10, rect.w - left - 16 * k), h: Math.max(10, rect.h - bottom - 12 * k) };
  }

  x(v: number): number {
    return this.plot.x + ((v - this.x0) / (this.x1 - this.x0)) * this.plot.w;
  }

  y(v: number): number {
    return this.plot.y + this.plot.h - ((v - this.y0) / (this.y1 - this.y0)) * this.plot.h;
  }

  invX(px: number): number {
    return this.x0 + ((px - this.plot.x) / this.plot.w) * (this.x1 - this.x0);
  }

  contains(px: number, py: number): boolean {
    const p = this.plot;
    return px >= p.x && px <= p.x + p.w && py >= p.y && py <= p.y + p.h;
  }

  draw(p: Painter, pal: ChartPalette): void {
    const { plot, k, opts } = this;
    const label: TextStyle = { color: pal.muted, size: 11.5 * k };
    // Quadrillage horizontal et graduations en ordonnée
    const ys = ticks(this.y0, this.y1, plot.h, 46 * k).filter((v) => !opts.integerY || Number.isInteger(v));
    p.beginPath();
    for (const v of ys) {
      const py = Math.round(this.y(v)) + 0.5;
      p.moveTo(plot.x, py);
      p.lineTo(plot.x + plot.w, py);
    }
    p.stroke({ color: pal.gridMajor, width: 1, cap: 'butt' });
    for (const v of ys) {
      const text = opts.percentY ? `${fmt(v * 100, 4)} %` : fmt(v, 6);
      p.text(text, plot.x - 8 * k, this.y(v), { ...label, align: 'right', baseline: 'middle' });
    }
    // Graduations en abscisse
    const xs = opts.xTicks ?? ticks(this.x0, this.x1, plot.w, 70 * k).filter((v) => !opts.integerX || Number.isInteger(v)).map((v) => ({ value: v, label: fmt(v, 6) }));
    const base = plot.y + plot.h;
    p.beginPath();
    for (const t of xs) {
      const px = this.x(t.value);
      if (px < plot.x - 1 || px > plot.x + plot.w + 1) continue;
      p.moveTo(px, base);
      p.lineTo(px, base + 4 * k);
    }
    p.stroke({ color: pal.axis, width: 1, cap: 'butt' });
    let lastRight = -Infinity;
    for (const t of xs) {
      const px = this.x(t.value);
      if (px < plot.x - 1 || px > plot.x + plot.w + 1) continue;
      const w = t.label.length * 6.4 * k;
      if (px - w / 2 < lastRight + 4 * k) continue;
      lastRight = px + w / 2;
      p.text(t.label, px, base + 8 * k, { ...label, align: 'center', baseline: 'top' });
    }
    // Axes
    line(p, plot.x, base, plot.x + plot.w, base, { color: pal.axis, width: 1.3 * k, cap: 'butt' });
    if (this.y0 < 0 && this.y1 > 0) line(p, plot.x, this.y(0), plot.x + plot.w, this.y(0), { color: pal.axis, width: 1, cap: 'butt' });
    if (opts.xLabel) p.text(opts.xLabel, plot.x + plot.w, base + 26 * k, { color: pal.text, size: 13 * k, italic: true, family: MATH_FONT, align: 'right', baseline: 'top' });
    if (opts.yLabel) p.text(opts.yLabel, plot.x - 8 * k, plot.y - 6 * k, { color: pal.text, size: 13 * k, italic: true, family: MATH_FONT, align: 'right', baseline: 'bottom' });
  }
}

/** Titre d'un graphique, avec légende et valeur mise en avant à droite (si la place le permet). */
export function chartTitle(
  p: Painter,
  rect: Rect,
  title: string,
  pal: ChartPalette,
  k: number,
  legend: { color: string; label: string; dashed?: boolean }[] = [],
  highlight?: string,
): void {
  const y = rect.y + 14 * k;
  const x0 = rect.x + 58 * k;
  const right = rect.x + rect.w - 16 * k;
  // Largeurs estimées (pas de mesure de texte côté SVG).
  const titleEnd = x0 + title.length * 8.2 * k;
  const hlWidth = highlight ? highlight.length * 10 * k : 0;
  const showHighlight = !!highlight && titleEnd + 24 * k + hlWidth <= right;
  const limit = showHighlight ? right - hlWidth - 20 * k : right;
  p.text(title, x0, y, { color: pal.text, size: 14 * k, weight: 600, baseline: 'middle' });
  let x = titleEnd + 18 * k;
  for (const l of legend) {
    const w = 21 * k + l.label.length * 6.8 * k;
    if (x + w > limit) break;
    if (l.dashed) line(p, x, y, x + 16 * k, y, { color: l.color, width: 2 * k, dash: [4 * k, 3 * k] });
    else {
      p.beginPath();
      p.rect(x, y - 5 * k, 14 * k, 10 * k);
      p.fill(l.color);
    }
    p.text(l.label, x + 21 * k, y, { color: pal.muted, size: 12 * k, baseline: 'middle' });
    x += w + 16 * k;
  }
  if (showHighlight) p.text(highlight!, right, y, { color: pal.text, size: 19 * k, weight: 600, align: 'right', baseline: 'middle', family: MATH_FONT });
}

export function bar(p: Painter, ax: Axes, x: number, width: number, value: number, color: string, alpha = 1): void {
  const x0 = ax.x(x - width / 2);
  const x1 = ax.x(x + width / 2);
  const top = ax.y(Math.max(value, 0));
  const base = ax.y(Math.max(ax.y0, 0));
  if (Math.abs(base - top) < 0.3) return;
  p.beginPath();
  p.rect(x0, Math.min(top, base), Math.max(1, x1 - x0), Math.abs(base - top));
  p.fill(color, alpha);
}

export function polyline(p: Painter, ax: Axes, pts: [number, number][], color: string, width: number, dash?: number[]): void {
  if (pts.length < 2) return;
  p.beginPath();
  pts.forEach(([x, y], i) => (i ? p.lineTo(ax.x(x), ax.y(y)) : p.moveTo(ax.x(x), ax.y(y))));
  p.stroke({ color, width, dash, join: 'round' });
}

/** Aire sous une courbe entre a et b. */
export function area(p: Painter, ax: Axes, f: (x: number) => number, a: number, b: number, color: string, alpha: number): void {
  const lo = Math.max(a, ax.x0);
  const hi = Math.min(b, ax.x1);
  if (hi <= lo) return;
  const steps = Math.max(8, Math.ceil((ax.x(hi) - ax.x(lo)) / 2));
  p.beginPath();
  p.moveTo(ax.x(lo), ax.y(0));
  for (let i = 0; i <= steps; i++) {
    const x = lo + ((hi - lo) * i) / steps;
    p.lineTo(ax.x(x), ax.y(Math.min(f(x), ax.y1 * 1.2)));
  }
  p.lineTo(ax.x(hi), ax.y(0));
  p.closePath();
  p.fill(color, alpha);
}

export function curve(p: Painter, ax: Axes, f: (x: number) => number, color: string, width: number, dash?: number[]): void {
  const steps = Math.ceil(ax.plot.w / 1.5);
  p.beginPath();
  let pen = false;
  for (let i = 0; i <= steps; i++) {
    const x = ax.x0 + ((ax.x1 - ax.x0) * i) / steps;
    const y = f(x);
    if (!Number.isFinite(y)) {
      pen = false;
      continue;
    }
    const py = ax.y(Math.min(y, ax.y1 * 1.5));
    if (pen) p.lineTo(ax.x(x), py);
    else p.moveTo(ax.x(x), py);
    pen = true;
  }
  p.stroke({ color, width, dash, join: 'round' });
}

/** Diagramme en boîte horizontal (min, Q₁, Me, Q₃, max) avec la moyenne. */
export function boxPlot(
  p: Painter,
  ax: Axes,
  cy: number,
  height: number,
  s: { min: number; q1: number; median: number; q3: number; max: number; mean: number },
  color: string,
  pal: ChartPalette,
  k: number,
): void {
  const h = height / 2;
  const stroke = { color: pal.text, width: 1.6 * k };
  line(p, ax.x(s.min), cy, ax.x(s.q1), cy, stroke);
  line(p, ax.x(s.q3), cy, ax.x(s.max), cy, stroke);
  line(p, ax.x(s.min), cy - h * 0.55, ax.x(s.min), cy + h * 0.55, stroke);
  line(p, ax.x(s.max), cy - h * 0.55, ax.x(s.max), cy + h * 0.55, stroke);
  p.beginPath();
  p.rect(ax.x(s.q1), cy - h, Math.max(1, ax.x(s.q3) - ax.x(s.q1)), 2 * h);
  p.fill(color, 0.22);
  p.beginPath();
  p.rect(ax.x(s.q1), cy - h, Math.max(1, ax.x(s.q3) - ax.x(s.q1)), 2 * h);
  p.stroke({ color: pal.text, width: 1.6 * k });
  line(p, ax.x(s.median), cy - h, ax.x(s.median), cy + h, { color, width: 3 * k, cap: 'butt' });
  // Moyenne : losange
  const mx = ax.x(s.mean);
  const d = 5 * k;
  p.beginPath();
  p.moveTo(mx, cy - d);
  p.lineTo(mx + d, cy);
  p.lineTo(mx, cy + d);
  p.lineTo(mx - d, cy);
  p.closePath();
  p.fill(pal.bg);
  p.stroke({ color: pal.danger, width: 1.8 * k });
  // Étiquettes
  const style: TextStyle = { color: pal.muted, size: 11.5 * k, align: 'center', baseline: 'bottom', halo: pal.bg };
  const labels: [number, string][] = [[s.min, 'min'], [s.q1, 'Q₁'], [s.median, 'Me'], [s.q3, 'Q₃'], [s.max, 'max']];
  let last = -Infinity;
  for (const [v, name] of labels) {
    const x = ax.x(v);
    if (x - last < 26 * k) continue;
    last = x;
    p.text(name, x, cy - h - 6 * k, style);
  }
}

export function points(p: Painter, ax: Axes, xs: number[], ys: number[], color: string, r: number, pal: ChartPalette): void {
  for (let i = 0; i < xs.length; i++) {
    const px = ax.x(xs[i]);
    const py = ax.y(ys[i]);
    if (!ax.contains(px, py)) continue;
    disc(p, px, py, r, color, { color: pal.bg, width: 1.2 });
  }
}
