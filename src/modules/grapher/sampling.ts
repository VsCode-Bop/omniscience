/**
 * Échantillonnage des courbes en coordonnées écran.
 *
 * - Cartésiennes : un échantillon par pixel, subdivision récursive là où la courbe
 *   n'est pas localement rectiligne, coupure du tracé aux discontinuités (asymptotes,
 *   sauts) et aux bords du domaine de définition (recherchés par dichotomie).
 * - Polaires / paramétriques : subdivision tant que deux points consécutifs sont
 *   éloignés de plus de quelques pixels.
 * Le résultat est une liste de polylignes [x0, y0, x1, y1, …] en pixels.
 */
import type { RealFn } from '../../core/math/numeric';
import type { Viewport } from './viewport';

export type Polyline = number[];

const MAX_DEPTH = 10;
/** Saut (px) au-delà duquel deux échantillons très proches sont considérés comme discontinus. */
const JUMP_PX = 30;

export function sampleCartesian(f: RealFn, vp: Viewport, stepPx = 1): Polyline[] {
  const lines: Polyline[] = [];
  const lo = -4 * vp.height;
  const hi = 5 * vp.height;
  let cur: Polyline = [];

  const flush = () => {
    if (cur.length >= 4) lines.push(cur);
    cur = [];
  };
  const sy = (y: number) => vp.yToPx(y);
  const emit = (x: number, y: number) => {
    const py = sy(y);
    cur.push(vp.xToPx(x), py < lo ? lo : py > hi ? hi : py);
  };
  const isStraight = (x0: number, y0: number, x1: number, y1: number): boolean => {
    for (const t of [0.37, 0.63]) {
      const y = f(x0 + t * (x1 - x0));
      if (!Number.isFinite(y) || Math.abs(sy(y) - (sy(y0) + t * (sy(y1) - sy(y0)))) > 0.5) return false;
    }
    return true;
  };

  /** Relie (x0, y0) — fini et déjà émis — à (x1, y1). */
  const connect = (x0: number, y0: number, x1: number, y1: number, depth: number): void => {
    const finite1 = Number.isFinite(y1);
    if (finite1) {
      const jump = Math.abs(sy(y1) - sy(y0));
      if (jump <= 2 || (depth >= 2 && jump < vp.height && isStraight(x0, y0, x1, y1))) {
        emit(x1, y1);
        return;
      }
      if (depth >= MAX_DEPTH) {
        if (jump > JUMP_PX) flush();
        emit(x1, y1);
        return;
      }
    } else if (depth >= MAX_DEPTH) {
      flush();
      return;
    }
    const xm = (x0 + x1) / 2;
    const ym = f(xm);
    if (Number.isFinite(ym)) {
      connect(x0, y0, xm, ym, depth + 1);
      if (cur.length === 0) emit(xm, ym);
      connect(xm, ym, x1, y1, depth + 1);
    } else {
      connect(x0, y0, xm, ym, depth + 1);
      flush();
      if (finite1) enter(xm, x1, y1);
    }
  };

  /** Entrée dans le domaine : f(x0) non défini, f(x1) fini. On localise le bord par dichotomie. */
  const enter = (x0: number, x1: number, y1: number): void => {
    flush();
    let a = x0;
    let b = x1;
    let yb = y1;
    for (let i = 0; i < 30; i++) {
      const m = (a + b) / 2;
      const ym = f(m);
      if (Number.isFinite(ym)) {
        b = m;
        yb = ym;
      } else a = m;
    }
    emit(b, yb);
    if (b !== x1) connect(b, yb, x1, y1, 0);
  };

  let prevX = Number.NaN;
  let prevY = Number.NaN;
  for (let px = 0; px <= vp.width + stepPx; px += stepPx) {
    const x = vp.pxToX(px);
    const y = f(x);
    if (Number.isNaN(prevX)) {
      if (Number.isFinite(y)) emit(x, y);
    } else if (Number.isFinite(prevY)) {
      connect(prevX, prevY, x, y, 0);
    } else if (Number.isFinite(y)) {
      enter(prevX, x, y);
    }
    prevX = x;
    prevY = y;
  }
  flush();
  return lines;
}

/** Courbe paramétrée (x(s), y(s)) pour s ∈ [s0, s1] (polaire : x = r cos θ, y = r sin θ). */
export function sampleParametric(fx: RealFn, fy: RealFn, s0: number, s1: number, vp: Viewport, baseSamples = 720): Polyline[] {
  const lines: Polyline[] = [];
  const LIMIT = 1e5;
  const bigJump = 2 * Math.max(vp.width, vp.height);
  let cur: Polyline = [];
  const flush = () => {
    if (cur.length >= 4) lines.push(cur);
    cur = [];
  };
  const toPx = (s: number): [number, number] | null => {
    const x = fx(s);
    const y = fy(s);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const px = vp.xToPx(x);
    const py = vp.yToPx(y);
    return Math.abs(px) > LIMIT || Math.abs(py) > LIMIT ? null : [px, py];
  };
  const emit = (p: [number, number]) => cur.push(p[0], p[1]);

  /** Relie a (fini, déjà émis) à b (éventuellement non défini). */
  const connect = (sa: number, a: [number, number], sb: number, b: [number, number] | null, depth: number): void => {
    if (b) {
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d <= 3) {
        emit(b);
        return;
      }
      if (depth >= 10) {
        if (d > bigJump) flush();
        emit(b);
        return;
      }
    } else if (depth >= 10) {
      flush();
      return;
    }
    const sm = (sa + sb) / 2;
    const m = toPx(sm);
    if (m) {
      connect(sa, a, sm, m, depth + 1);
      if (cur.length === 0) emit(m);
      connect(sm, m, sb, b, depth + 1);
    } else {
      connect(sa, a, sm, null, depth + 1);
      flush();
      if (b) emit(b);
    }
  };

  let prevS = s0;
  let prev = toPx(s0);
  if (prev) emit(prev);
  for (let i = 1; i <= baseSamples; i++) {
    const s = s0 + ((s1 - s0) * i) / baseSamples;
    const p = toPx(s);
    if (prev) connect(prevS, prev, s, p, 0);
    else if (p) {
      flush();
      emit(p);
    }
    prevS = s;
    prev = p;
  }
  flush();
  return lines;
}
