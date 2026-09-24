/**
 * Dessin de la scène de la grapheuse via l'abstraction Painter :
 * le même code produit l'affichage Canvas et l'export SVG/PDF.
 */
import { cssVar } from '../../core/dom';
import { fmt, fmtPoint } from '../../core/math/format';
import { integrate } from '../../core/math/numeric';
import { disc, line, MATH_FONT, type Painter, type StrokeStyle } from '../../core/graphics/painter';
import type { PointKind } from './analysis';
import type { CompiledRow } from './expr';
import { sampleCartesian, sampleParametric, type Polyline } from './sampling';
import type { DisplayOptions, RowState } from './state';
import { linearTicks, piTicks } from './ticks';
import type { Viewport } from './viewport';

export interface Palette {
  bg: string;
  gridMinor: string;
  gridMajor: string;
  axis: string;
  text: string;
  muted: string;
  curves: string[];
}

export function readPalette(): Palette {
  return {
    bg: cssVar('--canvas-bg'),
    gridMinor: cssVar('--grid-minor'),
    gridMajor: cssVar('--grid-major'),
    axis: cssVar('--axis'),
    text: cssVar('--canvas-text'),
    muted: cssVar('--canvas-muted'),
    curves: Array.from({ length: 8 }, (_, i) => cssVar(`--c${i + 1}`)),
  };
}

export interface ScenePoint {
  x: number;
  y: number;
  kind: PointKind;
  color: string;
  key: string;
}

export interface SceneRow {
  state: RowState;
  compiled: CompiledRow;
  color: string;
}

export interface Scene {
  vp: Viewport;
  rows: SceneRow[];
  opts: DisplayOptions;
  points: ScenePoint[];
  pinned: ReadonlySet<string>;
  /** Facteur d'agrandissement (mode présentation). */
  scale: number;
  hover?: { x: number; y: number; color: string } | null;
}

export const POINT_LABELS: Record<PointKind, string> = {
  root: 'Racine',
  max: 'Maximum local',
  min: 'Minimum local',
  intersection: 'Intersection',
  'y-intercept': 'Ordonnée à l\'origine',
};

const round = (v: number) => Math.round(v) + 0.5;

function strokeLines(p: Painter, lines: Polyline[], style: StrokeStyle): void {
  p.beginPath();
  for (const l of lines) {
    p.moveTo(l[0], l[1]);
    for (let i = 2; i < l.length; i += 2) p.lineTo(l[i], l[i + 1]);
  }
  p.stroke(style);
}

/** Équation réduite de la tangente, ex. « y = 2x − 1 ». */
export function tangentEquation(slope: number, intercept: number): string {
  const a = Math.abs(slope) < 1e-12 ? 0 : slope;
  const b = Math.abs(intercept) < 1e-12 ? 0 : intercept;
  const ax = a === 0 ? '' : a === 1 ? 'x' : a === -1 ? '−x' : `${fmt(a, 3)}x`;
  if (!ax) return `y = ${fmt(b, 3)}`;
  if (b === 0) return `y = ${ax}`;
  return `y = ${ax} ${b > 0 ? '+' : '−'} ${fmt(Math.abs(b), 3)}`;
}

function drawGrid(p: Painter, s: Scene, pal: Palette): void {
  const { vp, opts } = s;
  const xt = opts.pi ? piTicks(vp.xmin, vp.xmax, vp.scaleX) : linearTicks(vp.xmin, vp.xmax, vp.scaleX);
  const yt = linearTicks(vp.ymin, vp.ymax, vp.scaleY);
  if (opts.grid) {
    const minor: StrokeStyle = { color: pal.gridMinor, width: 1, cap: 'butt' };
    p.beginPath();
    for (const x of xt.minor) {
      const px = round(vp.xToPx(x));
      p.moveTo(px, 0);
      p.lineTo(px, vp.height);
    }
    for (const y of yt.minor) {
      const py = round(vp.yToPx(y));
      p.moveTo(0, py);
      p.lineTo(vp.width, py);
    }
    p.stroke(minor);
    p.beginPath();
    for (const { value } of xt.major) {
      const px = round(vp.xToPx(value));
      p.moveTo(px, 0);
      p.lineTo(px, vp.height);
    }
    for (const { value } of yt.major) {
      const py = round(vp.yToPx(value));
      p.moveTo(0, py);
      p.lineTo(vp.width, py);
    }
    p.stroke({ color: pal.gridMajor, width: 1, cap: 'butt' });
  }
  if (!opts.axes) return;

  const k = s.scale;
  const font = 12 * k;
  // Axes (ou bord de la fenêtre s'ils sont hors champ, pour garder les graduations lisibles).
  const ox = vp.xToPx(0);
  const oy = vp.yToPx(0);
  const axisY = Math.min(Math.max(oy, 0), vp.height);
  const axisX = Math.min(Math.max(ox, 0), vp.width);
  const axisStyle: StrokeStyle = { color: pal.axis, width: 1.5 * k, cap: 'butt' };
  if (oy >= 0 && oy <= vp.height) line(p, 0, round(oy), vp.width, round(oy), axisStyle);
  if (ox >= 0 && ox <= vp.width) line(p, round(ox), 0, round(ox), vp.height, axisStyle);

  // Flèches et noms des axes.
  const arrow = 8 * k;
  if (oy >= 0 && oy <= vp.height) {
    p.beginPath();
    p.moveTo(vp.width, oy);
    p.lineTo(vp.width - arrow, oy - arrow / 2);
    p.lineTo(vp.width - arrow, oy + arrow / 2);
    p.closePath();
    p.fill(pal.axis);
    p.text('x', vp.width - 8 * k, oy - 9 * k, { color: pal.text, size: font + 5, italic: true, family: MATH_FONT, align: 'right', baseline: 'bottom', halo: pal.bg });
  }
  if (ox >= 0 && ox <= vp.width) {
    p.beginPath();
    p.moveTo(ox, 0);
    p.lineTo(ox - arrow / 2, arrow);
    p.lineTo(ox + arrow / 2, arrow);
    p.closePath();
    p.fill(pal.axis);
    p.text('y', ox + 10 * k, 4 * k, { color: pal.text, size: font + 5, italic: true, family: MATH_FONT, align: 'left', baseline: 'top', halo: pal.bg });
  }

  const labelStyle = { color: pal.text, size: font, halo: pal.bg };
  const below = axisY < vp.height - 24 * k;
  const tick = 4 * k;
  p.beginPath();
  for (const { value, label } of xt.major) {
    if (value === 0) continue;
    const px = vp.xToPx(value);
    if (px < 8 || px > vp.width - 20 * k) continue;
    p.moveTo(px, axisY - tick);
    p.lineTo(px, axisY + tick);
    p.text(label, px, below ? axisY + 7 * k : axisY - 7 * k, { ...labelStyle, align: 'center', baseline: below ? 'top' : 'bottom' });
  }
  const left = axisX > 44 * k;
  for (const { value, label } of yt.major) {
    if (value === 0) continue;
    const py = vp.yToPx(value);
    if (py < 20 * k || py > vp.height - 8) continue;
    p.moveTo(axisX - tick, py);
    p.lineTo(axisX + tick, py);
    p.text(label, left ? axisX - 7 * k : axisX + 7 * k, py, { ...labelStyle, align: left ? 'right' : 'left', baseline: 'middle' });
  }
  p.stroke({ color: pal.axis, width: 1.2 * k, cap: 'butt' });
  if (ox >= 0 && ox <= vp.width && oy >= 0 && oy <= vp.height) {
    p.text('O', ox - 6 * k, oy + 5 * k, { ...labelStyle, size: font + 3, family: MATH_FONT, align: 'right', baseline: 'top', italic: true });
  }
}

function drawIntegral(p: Painter, s: Scene, row: SceneRow): void {
  const f = row.compiled.fn!;
  const [a0, b0] = row.state.integral!;
  const { vp } = s;
  const a = Math.min(a0, b0);
  const b = Math.max(a0, b0);
  const xa = Math.max(vp.xToPx(a), -10);
  const xb = Math.min(vp.xToPx(b), vp.width + 10);
  if (xb <= xa) return;
  const zero = Math.min(Math.max(vp.yToPx(0), -10), vp.height + 10);
  const clampY = (py: number) => Math.min(Math.max(py, -10), vp.height + 10);
  p.beginPath();
  p.moveTo(xa, zero);
  const steps = Math.max(2, Math.ceil(xb - xa));
  for (let i = 0; i <= steps; i++) {
    const px = xa + ((xb - xa) * i) / steps;
    const y = f(vp.pxToX(px));
    p.lineTo(px, Number.isFinite(y) ? clampY(vp.yToPx(y)) : zero);
  }
  p.lineTo(xb, zero);
  p.closePath();
  p.fill(row.color, 0.22);
  // Bornes
  const dash: StrokeStyle = { color: row.color, width: 1.5 * s.scale, dash: [5, 4] };
  for (const x of [a, b]) {
    const y = f(x);
    const px = vp.xToPx(x);
    line(p, px, zero, px, Number.isFinite(y) ? clampY(vp.yToPx(y)) : zero, dash);
  }
}

function drawHandle(p: Painter, x: number, y: number, color: string, bg: string, k: number): void {
  disc(p, x, y, 7 * k, color, { color: bg, width: 2.5 * k });
}

/** Libellé de l'intégrale (valeur numérique). */
export function integralValue(row: SceneRow): number {
  const [a, b] = row.state.integral!;
  return integrate(row.compiled.fn!, a, b);
}

export function drawScene(p: Painter, s: Scene, pal: Palette): void {
  const { vp } = s;
  const k = s.scale;
  drawGrid(p, s, pal);

  // Aires (sous les courbes)
  for (const row of s.rows) {
    if (row.state.hidden || row.compiled.kind !== 'function' || !row.state.integral) continue;
    drawIntegral(p, s, row);
  }

  const labels: (() => void)[] = [];
  const curveWidth = 2.6 * k;

  for (const row of s.rows) {
    const { compiled: c, state: st, color } = row;
    if (st.hidden) continue;
    switch (c.kind) {
      case 'function': {
        const f = c.fn!;
        strokeLines(p, sampleCartesian(f, vp), { color, width: curveWidth });
        if (st.deriv && c.dfn) {
          strokeLines(p, sampleCartesian(c.dfn, vp), { color, width: 1.8 * k, dash: [7 * k, 5 * k], alpha: 0.85 });
          const name = c.name ? `${c.name}′` : 'y′';
          labels.push(() => labelCurve(p, c.dfn!, vp, name, color, pal, k, 0.8));
        }
        if (c.name) labels.push(() => labelCurve(p, f, vp, c.name!, color, pal, k, 0.88, true));
        if (st.tangent !== undefined && c.dfn) {
          const x0 = st.tangent;
          const y0 = f(x0);
          const m = c.dfn(x0);
          if (Number.isFinite(y0) && Number.isFinite(m)) {
            const b = y0 - m * x0;
            line(p, 0, vp.yToPx(m * vp.xmin + b), vp.width, vp.yToPx(m * vp.xmax + b), { color, width: 1.8 * k, alpha: 0.9 });
            labels.push(() => {
              const px = vp.xToPx(x0);
              const py = vp.yToPx(y0);
              drawHandle(p, px, py, color, pal.bg, k);
              p.text(tangentEquation(m, b), px + 12 * k, py - 12 * k, { color, size: 15 * k, weight: 600, family: MATH_FONT, halo: pal.bg, baseline: 'bottom' });
            });
          }
        }
        if (st.integral) {
          const value = integralValue(row);
          const [a, b] = st.integral;
          labels.push(() => {
            const zero = Math.min(Math.max(vp.yToPx(0), 20 * k), vp.height - 20 * k);
            for (const x of [a, b]) {
              const px = vp.xToPx(x);
              p.beginPath();
              p.moveTo(px, zero - 7 * k);
              p.lineTo(px + 6 * k, zero);
              p.lineTo(px, zero + 7 * k);
              p.lineTo(px - 6 * k, zero);
              p.closePath();
              p.fill(color);
            }
            const mid = (a + b) / 2;
            const fm = f(mid);
            const py = Number.isFinite(fm) ? vp.yToPx(fm / 2) : zero - 20 * k;
            const integrand = c.name ? `∫ ${c.name}(x) dx` : '∫';
            const bounds = `sur [${fmt(Math.min(a, b), 3)} ; ${fmt(Math.max(a, b), 3)}]`;
            const text = `${integrand} ${bounds} ${Number.isFinite(value) ? `≈ ${fmt(a <= b ? value : -value, 5)}` : ': non définie'}`;
            p.text(text, vp.xToPx(mid), Math.min(Math.max(py, 24 * k), vp.height - 24 * k), {
              color: pal.text, size: 13 * k, weight: 'bold', align: 'center', baseline: 'middle', halo: pal.bg,
            });
          });
        }
        break;
      }
      case 'polar': {
        const r = c.fn!;
        const [t0, t1] = st.range ?? [0, 2 * Math.PI];
        strokeLines(p, sampleParametric((t) => r(t) * Math.cos(t), (t) => r(t) * Math.sin(t), t0, t1, vp), { color, width: curveWidth });
        break;
      }
      case 'parametric': {
        const [t0, t1] = st.range ?? [0, 2 * Math.PI];
        strokeLines(p, sampleParametric(c.fx!, c.fy!, t0, t1, vp), { color, width: curveWidth });
        break;
      }
      case 'vline': {
        const x = c.px!();
        if (Number.isFinite(x)) line(p, vp.xToPx(x), 0, vp.xToPx(x), vp.height, { color, width: curveWidth });
        break;
      }
      case 'point': {
        const x = c.px!();
        const y = c.py!();
        if (!Number.isFinite(x) || !Number.isFinite(y)) break;
        labels.push(() => {
          const px = vp.xToPx(x);
          const py = vp.yToPx(y);
          disc(p, px, py, 5 * k, color, { color: pal.bg, width: 2 * k });
          const text = c.name ? `${c.name} ${fmtPoint(x, y, 3)}` : fmtPoint(x, y, 3);
          p.text(text, px + 9 * k, py - 9 * k, { color, size: 13 * k, weight: 'bold', halo: pal.bg, baseline: 'bottom' });
        });
        break;
      }
    }
  }

  // Points remarquables
  for (const pt of s.points) {
    const px = vp.xToPx(pt.x);
    const py = vp.yToPx(pt.y);
    disc(p, px, py, 4.5 * k, pal.bg, { color: pt.color, width: 2.2 * k });
    if (s.opts.coords || s.pinned.has(pt.key)) {
      labels.push(() => p.text(fmtPoint(pt.x, pt.y, 4), px + 8 * k, py + (pt.kind === 'min' ? 10 : -8) * k, {
        color: pal.text, size: 12 * k, halo: pal.bg, baseline: pt.kind === 'min' ? 'top' : 'bottom',
      }));
    }
  }

  for (const draw of labels) draw();

  if (s.hover) {
    const px = vp.xToPx(s.hover.x);
    const py = vp.yToPx(s.hover.y);
    disc(p, px, py, 5 * k, s.hover.color, { color: pal.bg, width: 2 * k });
  }
}

function labelCurve(p: Painter, f: (x: number) => number, vp: Viewport, name: string, color: string, pal: Palette, k: number, at: number, curveName = false): void {
  // Cherche, de droite à gauche à partir de `at`, une abscisse où la courbe est visible.
  for (let t = at; t > 0.3; t -= 0.05) {
    const x = vp.pxToX(vp.width * t);
    const y = f(x);
    if (!Number.isFinite(y)) continue;
    const py = vp.yToPx(y);
    // Évite les barres d'outils flottantes (haut de la scène).
    if (py > 72 * k && py < vp.height - 24 * k) {
      const slopeUp = f(x + 1 / vp.scaleX) > y;
      const px = vp.xToPx(x);
      const ly = py + (slopeUp ? 18 : -14) * k;
      const style = { color, italic: true, family: MATH_FONT, baseline: 'middle' as const, halo: pal.bg };
      if (curveName) {
        // Notation 𝒞f : « C » suivi du nom de la fonction en indice.
        p.text('C', px - 4 * k, ly, { ...style, size: 19 * k, align: 'right' });
        p.text(name, px - 3 * k, ly + 6 * k, { ...style, size: 13 * k, align: 'left' });
      } else {
        p.text(name, px, ly, { ...style, size: 17 * k, align: 'center' });
      }
      return;
    }
  }
}
