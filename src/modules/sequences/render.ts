/**
 * Dessin du module « Suites » : nuage de points (n ; uₙ) et toile d'araignée
 * (construction des termes d'une suite récurrente uₙ₊₁ = g(uₙ) à l'aide de y = x).
 */
import { disc, line, MATH_FONT, type Painter, type TextStyle } from '../../core/graphics/painter';
import { fmt } from '../../core/math/format';
import { drawGrid, type Palette } from '../grapher/renderer';
import type { Viewport } from '../grapher/viewport';
import type { FixedPoint, SeqName } from './model';

export interface Series {
  name: SeqName;
  color: string;
  n0: number;
  values: number[];
  /** Limite conjecturée (droite en pointillés). */
  limit: number | null;
}

export interface Cobweb {
  name: SeqName;
  color: string;
  g: (x: number) => number;
  values: number[];
  n0: number;
  fixed: FixedPoint[];
}

export interface SeqScene {
  vp: Viewport;
  mode: 'points' | 'cobweb';
  series: Series[];
  cobweb: Cobweb | null;
  /** Nombre de termes affichés (animation « pas à pas »). */
  shown: number;
  opts: { grid: boolean; join: boolean; limit: boolean };
  scale: number;
  hover: { name: SeqName; index: number } | null;
}

/** Nom de terme avec indice : « u » en italique, indice plus petit et abaissé. */
export function drawTerm(p: Painter, name: string, index: string, x: number, y: number, style: TextStyle): void {
  const size = style.size;
  const sub = size * 0.68;
  // Largeur approximative (pas de mesure de texte côté SVG) : on centre à partir de l'estimation.
  const w = size * 0.5 + sub * 0.52 * index.length;
  const align = style.align ?? 'left';
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  p.text(name, x0, y, { ...style, align: 'left', italic: true, family: MATH_FONT });
  p.text(index, x0 + size * 0.5, y + size * 0.22, { ...style, size: sub, align: 'left', italic: false, family: MATH_FONT });
}

export function drawSequences(p: Painter, s: SeqScene, pal: Palette): void {
  if (s.mode === 'cobweb' && s.cobweb) drawCobweb(p, s, s.cobweb, pal);
  else drawPoints(p, s, pal);
}

function drawPoints(p: Painter, s: SeqScene, pal: Palette): void {
  const { vp } = s;
  const k = s.scale;
  drawGrid(p, { vp, opts: { grid: s.opts.grid, axes: true, pi: false }, scale: k, axisNames: ['n', ''], integerX: true }, pal);

  // Limites conjecturées
  if (s.opts.limit) {
    for (const se of s.series) {
      if (se.limit === null || !Number.isFinite(se.limit)) continue;
      const y = vp.yToPx(se.limit);
      if (y < -2 || y > vp.height + 2 || Math.abs(y - vp.yToPx(0)) < 4) continue; // confondue avec l'axe
      line(p, 0, y, vp.width, y, { color: se.color, width: 1.3 * k, dash: [6 * k, 5 * k], alpha: 0.75 });
      p.text(`ℓ ≈ ${fmt(se.limit, 6)}`, vp.width - 12 * k, y - 6 * k, {
        color: se.color, size: 12.5 * k, align: 'right', baseline: 'bottom', halo: pal.bg, weight: 600,
      });
    }
  }

  const r = 3.8 * k;
  for (const se of s.series) {
    const count = Math.min(se.values.length, s.shown);
    // Segments reliant les points (lecture des variations)
    if (s.opts.join && count > 1) {
      p.beginPath();
      let pen = false;
      for (let i = 0; i < count; i++) {
        const v = se.values[i];
        if (!Number.isFinite(v)) {
          pen = false;
          continue;
        }
        const x = vp.xToPx(se.n0 + i);
        const y = clampY(vp, vp.yToPx(v));
        if (pen) p.lineTo(x, y);
        else p.moveTo(x, y);
        pen = true;
      }
      p.stroke({ color: se.color, width: 1.4 * k, alpha: 0.45, join: 'round' });
    }
    for (let i = 0; i < count; i++) {
      const v = se.values[i];
      if (!Number.isFinite(v)) continue;
      const x = vp.xToPx(se.n0 + i);
      const y = vp.yToPx(v);
      if (x < -r || x > vp.width + r || y < -r || y > vp.height + r) continue;
      disc(p, x, y, r, se.color, { color: pal.bg, width: 1.5 * k });
    }
  }

  // Terme survolé : repères vers les axes
  if (s.hover) {
    const se = s.series.find((x) => x.name === s.hover!.name);
    const v = se?.values[s.hover.index];
    if (se && v !== undefined && Number.isFinite(v)) {
      const x = vp.xToPx(se.n0 + s.hover.index);
      const y = vp.yToPx(v);
      const ox = Math.min(Math.max(vp.xToPx(0), 0), vp.width);
      const oy = Math.min(Math.max(vp.yToPx(0), 0), vp.height);
      const dash = { color: se.color, width: 1.2 * k, dash: [4 * k, 4 * k], alpha: 0.8 };
      line(p, x, y, x, oy, dash);
      line(p, x, y, ox, y, dash);
      disc(p, x, y, r * 2, se.color, undefined);
      disc(p, x, y, r * 1.1, pal.bg, undefined);
    }
  }
}

function clampY(vp: Viewport, y: number): number {
  return Math.min(Math.max(y, -1e4), vp.height + 1e4);
}

function drawCobweb(p: Painter, s: SeqScene, c: Cobweb, pal: Palette): void {
  const { vp } = s;
  const k = s.scale;
  drawGrid(p, { vp, opts: { grid: s.opts.grid, axes: true, pi: false }, scale: k }, pal);

  // Droite y = x
  const a = Math.max(vp.xmin, vp.ymin);
  const b = Math.min(vp.xmax, vp.ymax);
  if (b > a) {
    line(p, vp.xToPx(a), vp.yToPx(a), vp.xToPx(b), vp.yToPx(b), { color: pal.muted, width: 1.5 * k });
    const lx = a + (b - a) * 0.3;
    p.text('y = x', vp.xToPx(lx) + 8 * k, vp.yToPx(lx) + 4 * k, { color: pal.muted, size: 13 * k, italic: true, family: MATH_FONT, align: 'left', baseline: 'top', halo: pal.bg });
  }

  // Courbe y = g(x)
  p.beginPath();
  let pen = false;
  let lastY = 0;
  const step = 1.5;
  for (let px = 0; px <= vp.width + step; px += step) {
    const y = c.g(vp.pxToX(px));
    const py = vp.yToPx(y);
    if (!Number.isFinite(py) || Math.abs(py - vp.height / 2) > vp.height * 20) {
      pen = false;
      continue;
    }
    if (pen && Math.abs(py - lastY) > vp.height * 2) pen = false; // asymptote
    if (pen) p.lineTo(px, py);
    else p.moveTo(px, py);
    pen = true;
    lastY = py;
  }
  p.stroke({ color: c.color, width: 2.4 * k, join: 'round' });
  // Nom de la courbe : un endroit dégagé (loin des axes et de la droite y = x).
  const ox = vp.xToPx(0);
  for (const f of [0.82, 0.7, 0.2, 0.3, 0.9]) {
    const px = vp.width * f;
    const x = vp.pxToX(px);
    const y = c.g(x);
    const py = vp.yToPx(y);
    if (!Number.isFinite(py) || py < 40 * k || py > vp.height - 100 * k) continue;
    if (Math.abs(px - ox) < 70 * k || Math.abs(py - vp.yToPx(x)) < 36 * k) continue;
    if (c.fixed.some((f) => Math.hypot(vp.xToPx(f.x) - px, vp.yToPx(f.x) - py) < 90 * k)) continue;
    p.text('y = g(x)', px, py - 10 * k, { color: c.color, size: 13.5 * k, italic: true, family: MATH_FONT, align: 'center', baseline: 'bottom', halo: pal.bg });
    break;
  }

  // Points fixes : intersections avec y = x
  for (const f of c.fixed) {
    const x = vp.xToPx(f.x);
    const y = vp.yToPx(f.x);
    if (x < 0 || x > vp.width || y < 0 || y > vp.height) continue;
    disc(p, x, y, 5 * k, pal.bg, { color: pal.text, width: 1.6 * k });
    p.text(`ℓ = ${fmt(f.x, 5)}`, x + 9 * k, y + 4 * k, { color: pal.text, size: 12 * k, align: 'left', baseline: 'top', halo: pal.bg });
  }

  // Escalier / spirale : (u₀ ; 0) → (u₀ ; u₁) → (u₁ ; u₁) → (u₁ ; u₂) → …
  const count = Math.min(c.values.length, s.shown);
  const zero = Math.min(Math.max(vp.yToPx(0), 0), vp.height);
  const px = (x: number) => vp.xToPx(x);
  const py = (y: number) => clampY(vp, vp.yToPx(y));
  const proj = { color: c.color, width: 1 * k, dash: [3 * k, 4 * k], alpha: 0.55 };
  const labelled: number[] = [];
  for (let i = 0; i < count; i++) {
    const u = c.values[i];
    if (!Number.isFinite(u)) break;
    // Projection du terme sur l'axe des abscisses
    if (i > 0) line(p, px(u), py(u), px(u), zero, proj);
    // Étiquette uᵢ sous l'axe (si la place le permet)
    const x = px(u);
    if (x > 0 && x < vp.width && labelled.every((lx) => Math.abs(lx - x) > 22 * k) && labelled.length < 8) {
      labelled.push(x);
      disc(p, x, zero, 3 * k, c.color);
      drawTerm(p, c.name, String(c.n0 + i), x, zero + 18 * k, { color: c.color, size: 14 * k, align: 'center', baseline: 'middle', halo: pal.bg, weight: 600 });
    }
  }
  p.beginPath();
  for (let i = 0; i < count; i++) {
    const u = c.values[i];
    const next = c.values[i + 1];
    if (!Number.isFinite(u)) break;
    if (i === 0) p.moveTo(px(u), zero);
    if (i + 1 >= count || !Number.isFinite(next)) break;
    p.lineTo(px(u), py(next)); // vertical : jusqu'à la courbe
    p.lineTo(px(next), py(next)); // horizontal : jusqu'à la droite y = x
  }
  p.stroke({ color: pal.text, width: 1.7 * k, join: 'round', alpha: 0.9 });
  // Points de la construction sur la courbe
  for (let i = 0; i + 1 < count; i++) {
    const u = c.values[i];
    const next = c.values[i + 1];
    if (!Number.isFinite(u) || !Number.isFinite(next)) break;
    disc(p, px(u), py(next), 3 * k, c.color, { color: pal.bg, width: 1.2 * k });
  }
}
