/**
 * Scène de la mécanique : repère orthonormé, sol, lanceur, trajectoire,
 * chronophotographie, vecteurs vitesse et accélération, variation du vecteur vitesse.
 */
import { disc, line, MATH_FONT, type Painter, type TextStyle } from '../../core/graphics/painter';
import { fmt } from '../../core/math/format';
import { drawGrid, type Palette } from '../grapher/renderer';
import type { Viewport } from '../grapher/viewport';
import { stateAt, type Sample, type Trajectory } from './physics';

export interface MechPalette extends Palette {
  accent: string;
  velocity: string;
  accel: string;
  delta: string;
  ground: string;
  success: string;
  danger: string;
}

export interface Ghost {
  tr: Trajectory;
  label: string;
}

export interface SceneOptions {
  chrono: boolean;
  tau: number;
  velocity: boolean;
  accel: boolean;
  components: boolean;
  deltaV: boolean;
  target: { x: number; y: number; r: number } | null;
}

export interface MechScene {
  vp: Viewport;
  tr: Trajectory;
  ideal: Trajectory | null;
  ghosts: Ghost[];
  t: number;
  opts: SceneOptions;
  scale: number;
  /** Échelles des vecteurs (pixels par m/s et par m/s²). */
  vScale: number;
  aScale: number;
  /** Poignée de réglage du vecteur vitesse initiale visible. */
  handle: boolean;
}

/** Flèche d'un vecteur (pixels). */
export function arrow(p: Painter, x1: number, y1: number, x2: number, y2: number, color: string, width: number): void {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 1.5) return;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const head = Math.min(len * 0.45, 5 + width * 2.6);
  line(p, x1, y1, x2 - ux * head * 0.6, y2 - uy * head * 0.6, { color, width });
  p.beginPath();
  p.moveTo(x2, y2);
  p.lineTo(x2 - ux * head - uy * head * 0.45, y2 - uy * head + ux * head * 0.45);
  p.lineTo(x2 - ux * head + uy * head * 0.45, y2 - uy * head - ux * head * 0.45);
  p.closePath();
  p.fill(color);
}

/** Nom de vecteur surmonté d'une flèche (v⃗, a⃗, Δv⃗). */
export function vectorLabel(p: Painter, name: string, x: number, y: number, color: string, size: number, halo: string, sub = ''): void {
  const style: TextStyle = { color, size, italic: true, family: MATH_FONT, align: 'left', baseline: 'middle', halo, weight: 600 };
  p.text(name, x, y, style);
  const w = name.length * size * 0.52;
  if (sub) p.text(sub, x + w + 1, y + size * 0.28, { ...style, size: size * 0.66, italic: false });
  const ax = x + (name.startsWith('Δ') ? size * 0.55 : 0);
  const aw = w - (name.startsWith('Δ') ? size * 0.55 : 0);
  const ty = y - size * 0.62;
  line(p, ax, ty, ax + aw, ty, { color, width: Math.max(1, size * 0.07) });
  p.beginPath();
  p.moveTo(ax + aw + 1.5, ty);
  p.lineTo(ax + aw - size * 0.18, ty - size * 0.13);
  p.lineTo(ax + aw - size * 0.18, ty + size * 0.13);
  p.closePath();
  p.fill(color);
}

function path(p: Painter, vp: Viewport, samples: Sample[], upTo = Infinity): void {
  p.beginPath();
  let started = false;
  const step = Math.max(1, Math.floor(samples.length / 1500));
  for (let i = 0; i < samples.length; i += step) {
    const s = samples[i];
    if (s.t > upTo) break;
    if (started) p.lineTo(vp.xToPx(s.x), vp.yToPx(s.y));
    else p.moveTo(vp.xToPx(s.x), vp.yToPx(s.y));
    started = true;
  }
}

export function drawScene(p: Painter, s: MechScene, pal: MechPalette): void {
  const { vp, tr, opts } = s;
  const k = s.scale;
  drawGrid(p, { vp, opts: { grid: true, axes: true, pi: false }, scale: k, axisNames: ['x (m)', 'y (m)'] }, pal);

  // Sol
  const gy = vp.yToPx(0);
  if (gy < vp.height) {
    p.beginPath();
    p.rect(0, gy, vp.width, vp.height - gy);
    p.fill(pal.ground, 0.9);
    line(p, 0, gy, vp.width, gy, { color: pal.axis, width: 1.6 * k, cap: 'butt' });
  }

  // Lanceur (tour si hauteur initiale)
  const p0 = tr.samples[0];
  const lx = vp.xToPx(p0.x);
  const ly = vp.yToPx(p0.y);
  if (p0.y > 0) {
    p.beginPath();
    p.rect(lx - 9 * k, ly + 6 * k, 18 * k, Math.max(0, gy - ly - 6 * k));
    p.fill(pal.muted, 0.28);
  }
  const ang = (tr.params.angle * Math.PI) / 180;
  line(p, lx, ly, lx + Math.cos(ang) * 24 * k, ly - Math.sin(ang) * 24 * k, { color: pal.text, width: 9 * k, cap: 'round', alpha: 0.85 });
  disc(p, lx, ly, 8 * k, pal.text);

  // Trajectoires précédentes
  for (const g of s.ghosts) {
    path(p, vp, g.tr.samples);
    p.stroke({ color: pal.muted, width: 1.4 * k, alpha: 0.55, join: 'round' });
    const a = g.tr.apex;
    p.text(g.label, vp.xToPx(a.x), vp.yToPx(a.y) - 8 * k, { color: pal.muted, size: 11.5 * k, align: 'center', baseline: 'bottom', halo: pal.bg });
  }

  // Trajectoire sans frottements (comparaison)
  if (s.ideal) {
    path(p, vp, s.ideal.samples);
    p.stroke({ color: pal.muted, width: 1.6 * k, dash: [6 * k, 5 * k], join: 'round' });
    const a = s.ideal.apex;
    p.text('sans frottements', vp.xToPx(a.x), vp.yToPx(a.y) - 8 * k, { color: pal.muted, size: 12 * k, align: 'center', baseline: 'bottom', halo: pal.bg });
  }

  // Trajectoire complète (pointillés) puis partie parcourue
  path(p, vp, tr.samples);
  p.stroke({ color: pal.accent, width: 1.3 * k, dash: [3 * k, 5 * k], alpha: 0.55, join: 'round' });
  path(p, vp, tr.samples, s.t);
  const cur = stateAt(tr, s.t);
  p.lineTo(vp.xToPx(cur.x), vp.yToPx(cur.y));
  p.stroke({ color: pal.accent, width: 2.4 * k, join: 'round' });

  // Cible
  if (opts.target) {
    const { x, y, r } = opts.target;
    const hit = hits(tr, opts.target);
    const color = hit ? pal.success : pal.danger;
    const tx = vp.xToPx(x);
    const ty = vp.yToPx(y);
    const rp = Math.max(6 * k, r * vp.scaleX);
    p.beginPath();
    p.arc(tx, ty, rp, 0, Math.PI * 2);
    p.stroke({ color, width: 2.2 * k });
    line(p, tx - rp, ty, tx + rp, ty, { color, width: 1, alpha: 0.6 });
    if (s.t >= tr.T - 1e-9 || hitTime(tr, opts.target) <= s.t) {
      p.text(hit ? 'Touché !' : 'Manqué', tx, ty - rp - 8 * k, { color, size: 14 * k, weight: 700, align: 'center', baseline: 'bottom', halo: pal.bg });
    }
  }

  // Flèche (hauteur maximale) et portée, une fois atteintes
  const apex = tr.apex;
  if (s.t >= apex.t && apex.y > p0.y + 1e-6) {
    const ax = vp.xToPx(apex.x);
    const ay = vp.yToPx(apex.y);
    line(p, ax, ay, ax, gy, { color: pal.muted, width: 1 * k, dash: [3 * k, 4 * k] });
    p.text(`h max = ${fmt(apex.y, 4)} m`, ax + 8 * k, ay - 10 * k, { color: pal.text, size: 12.5 * k, baseline: 'bottom', halo: pal.bg });
  }
  if (tr.landed && s.t >= tr.T - 1e-9) {
    const rx = vp.xToPx(tr.range);
    line(p, lx, gy + 16 * k, rx, gy + 16 * k, { color: pal.text, width: 1.2 * k });
    for (const x of [lx, rx]) line(p, x, gy + 10 * k, x, gy + 22 * k, { color: pal.text, width: 1.2 * k });
    p.text(`portée d = ${fmt(tr.range, 4)} m`, (lx + rx) / 2, gy + 26 * k, { color: pal.text, size: 12.5 * k, weight: 600, align: 'center', baseline: 'top', halo: pal.bg });
  }

  // Chronophotographie
  if (opts.chrono && opts.tau > 0) {
    const n = Math.min(400, Math.floor(Math.min(s.t, tr.T) / opts.tau + 1e-9));
    const pts: Sample[] = [];
    for (let i = 0; i <= n; i++) pts.push(stateAt(tr, i * opts.tau));
    const spacing = pts.length > 1 ? Math.hypot(vp.xToPx(pts[1].x) - vp.xToPx(pts[0].x), vp.yToPx(pts[1].y) - vp.yToPx(pts[0].y)) : 99;
    pts.forEach((q, i) => {
      const x = vp.xToPx(q.x);
      const y = vp.yToPx(q.y);
      disc(p, x, y, 4 * k, pal.bg, { color: pal.text, width: 1.6 * k });
      if (spacing > 24 * k || i % Math.ceil((26 * k) / Math.max(spacing, 1)) === 0) {
        p.text('M', x - 7 * k, y + 8 * k, { color: pal.muted, size: 12 * k, italic: true, family: MATH_FONT, align: 'right', baseline: 'top', halo: pal.bg });
        p.text(String(i), x - 6 * k, y + 13 * k, { color: pal.muted, size: 8.5 * k, family: MATH_FONT, align: 'left', baseline: 'top', halo: pal.bg });
      }
      if (opts.velocity && spacing > 18 * k) arrow(p, x, y, x + q.vx * s.vScale, y - q.vy * s.vScale, pal.velocity, 1.6 * k);
    });
  }

  // Variation du vecteur vitesse au point Mᵢ : Δv⃗ = v⃗ᵢ₊₁ − v⃗ᵢ₋₁
  if (opts.deltaV && opts.tau > 0) {
    const i = Math.floor(Math.min(s.t, tr.T) / opts.tau + 1e-9) - 1;
    if (i >= 1 && (i + 1) * opts.tau <= tr.T + 1e-9) {
      const m = stateAt(tr, i * opts.tau);
      const before = stateAt(tr, (i - 1) * opts.tau);
      const after = stateAt(tr, (i + 1) * opts.tau);
      const x = vp.xToPx(m.x);
      const y = vp.yToPx(m.y);
      const bx = x + before.vx * s.vScale;
      const by = y - before.vy * s.vScale;
      const axx = x + after.vx * s.vScale;
      const ayy = y - after.vy * s.vScale;
      arrow(p, x, y, bx, by, pal.velocity, 1.8 * k);
      arrow(p, x, y, axx, ayy, pal.velocity, 2.2 * k);
      arrow(p, bx, by, axx, ayy, pal.delta, 2.4 * k);
      vectorLabel(p, 'v', bx + 6 * k, by - 4 * k, pal.velocity, 14 * k, pal.bg, String(i - 1));
      vectorLabel(p, 'v', axx + 6 * k, ayy + 2 * k, pal.velocity, 14 * k, pal.bg, String(i + 1));
      vectorLabel(p, 'Δv', (bx + axx) / 2 + 8 * k, (by + ayy) / 2, pal.delta, 14 * k, pal.bg);
    }
  }

  // Mobile, vecteurs à l'instant t
  const x = vp.xToPx(cur.x);
  const y = vp.yToPx(cur.y);
  if (opts.components && opts.velocity) {
    const vxEnd = x + cur.vx * s.vScale;
    const vyEnd = y - cur.vy * s.vScale;
    arrow(p, x, y, vxEnd, y, pal.velocity, 1.3 * k);
    arrow(p, x, y, x, vyEnd, pal.velocity, 1.3 * k);
    line(p, vxEnd, y, vxEnd, vyEnd, { color: pal.velocity, width: 1, dash: [3 * k, 3 * k], alpha: 0.7 });
    line(p, x, vyEnd, vxEnd, vyEnd, { color: pal.velocity, width: 1, dash: [3 * k, 3 * k], alpha: 0.7 });
    vectorLabel(p, 'v', vxEnd + 4 * k, y + 10 * k, pal.velocity, 12.5 * k, pal.bg, 'x');
    vectorLabel(p, 'v', x - 20 * k, vyEnd, pal.velocity, 12.5 * k, pal.bg, 'y');
  }
  if (opts.velocity) {
    const ex = x + cur.vx * s.vScale;
    const ey = y - cur.vy * s.vScale;
    arrow(p, x, y, ex, ey, pal.velocity, 2.6 * k);
    vectorLabel(p, 'v', ex + 6 * k, ey - 2 * k, pal.velocity, 16 * k, pal.bg);
  }
  if (opts.accel) {
    const ex = x + cur.ax * s.aScale;
    const ey = y - cur.ay * s.aScale;
    arrow(p, x, y, ex, ey, pal.accel, 2.6 * k);
    vectorLabel(p, 'a', ex + 6 * k, ey, pal.accel, 16 * k, pal.bg);
  }
  disc(p, x, y, 7.5 * k, pal.accent, { color: pal.bg, width: 2 * k });

  // Poignée : vecteur vitesse initiale réglable à la souris
  if (s.handle) {
    const v0x = tr.samples[0].vx * s.vScale;
    const v0y = tr.samples[0].vy * s.vScale;
    arrow(p, lx, ly, lx + v0x, ly - v0y, pal.velocity, 2.2 * k);
    disc(p, lx + v0x, ly - v0y, 7 * k, pal.bg, { color: pal.velocity, width: 2.2 * k });
    vectorLabel(p, 'v', lx + v0x + 12 * k, ly - v0y - 4 * k, pal.velocity, 15 * k, pal.bg, '0');
  }
}

/** Instant où le projectile passe dans la cible (Infinity sinon). */
export function hitTime(tr: Trajectory, target: { x: number; y: number; r: number }): number {
  for (const s of tr.samples) if (Math.hypot(s.x - target.x, s.y - target.y) <= target.r) return s.t;
  return Infinity;
}

export function hits(tr: Trajectory, target: { x: number; y: number; r: number }): boolean {
  return Number.isFinite(hitTime(tr, target));
}
