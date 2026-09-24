/**
 * Étude numérique des fonctions sur un intervalle : racines, extremums, intersections,
 * bornes du domaine, asymptotes verticales et limites (estimations signalées « ≈ »).
 */
import { brentRoot, goldenMin, type RealFn } from '../../core/math/numeric';

export type PointKind = 'root' | 'max' | 'min' | 'intersection' | 'y-intercept';

export interface RemarkablePoint {
  x: number;
  y: number;
  kind: PointKind;
}

const MAX_POINTS = 40;

/** Arrondit les résultats numériques très proches d'une valeur « simple » (entier, 1/2, 1/3…). */
export function snap(v: number, relTol = 1e-9): number {
  if (!Number.isFinite(v)) return v;
  const tol = relTol * Math.max(1, Math.abs(v));
  for (const den of [1, 2, 3, 4, 5, 6, 8, 10, 100]) {
    const r = Math.round(v * den) / den;
    if (Math.abs(r - v) < tol) return r === 0 ? 0 : r;
  }
  return v;
}

function samples(f: RealFn, a: number, b: number, n: number): { xs: Float64Array; ys: Float64Array } {
  const xs = new Float64Array(n + 1);
  const ys = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) {
    xs[i] = a + ((b - a) * i) / n;
    ys[i] = f(xs[i]);
  }
  return { xs, ys };
}

/** Racines de f sur [a, b] (changements de signe + racines doubles via les extremums). */
export function findRoots(f: RealFn, a: number, b: number, n = 800): number[] {
  const { xs, ys } = samples(f, a, b, n);
  const roots: number[] = [];
  const scale = (b - a) / n;
  for (let i = 0; i < n; i++) {
    const y0 = ys[i];
    const y1 = ys[i + 1];
    if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue;
    if (y0 === 0) {
      roots.push(xs[i]);
      continue;
    }
    if (y0 * y1 < 0) {
      const r = brentRoot(f, xs[i], xs[i + 1]);
      const fr = f(r);
      // Rejette les changements de signe dus à une asymptote (1/x en 0).
      if (Number.isFinite(fr) && Math.abs(fr) < 1e-6 * (1 + Math.min(Math.abs(y0), Math.abs(y1)))) roots.push(r);
    }
    if (roots.length > MAX_POINTS) return [];
  }
  if (ys[n] === 0) roots.push(xs[n]);
  // Racines « doubles » (tangence avec l'axe) : extremums où f s'annule.
  for (const e of findExtrema(f, a, b, n)) {
    if (Math.abs(e.y) < 1e-10 * (1 + Math.abs(e.x))) roots.push(e.x);
  }
  return dedupe(roots.map((r) => snap(r)), scale * 0.5).sort((p, q) => p - q);
}

/**
 * Extremums locaux stricts de f sur ]a, b[. Si la dérivée `df` est fournie, l'abscisse est
 * affinée comme racine de f' (précision ~1e-12, contre ~1e-8 pour la seule section dorée).
 */
export function findExtrema(f: RealFn, a: number, b: number, n = 800, df?: RealFn): RemarkablePoint[] {
  const { xs, ys } = samples(f, a, b, n);
  const out: RemarkablePoint[] = [];
  const scale = (b - a) / n;
  for (let i = 1; i < n; i++) {
    const y0 = ys[i - 1];
    const y1 = ys[i];
    const y2 = ys[i + 1];
    if (!Number.isFinite(y0) || !Number.isFinite(y1) || !Number.isFinite(y2)) continue;
    const isMax = y1 >= y0 && y1 >= y2 && (y1 > y0 || y1 > y2);
    const isMin = y1 <= y0 && y1 <= y2 && (y1 < y0 || y1 < y2);
    if (!isMax && !isMin) continue;
    const g: RealFn = isMax ? (x) => -f(x) : f;
    let x = goldenMin((t) => {
      const v = g(t);
      return Number.isFinite(v) ? v : Infinity;
    }, xs[i - 1], xs[i + 1]);
    let precise = false;
    if (df) {
      const r = brentRoot(df, x - scale, x + scale);
      if (Number.isFinite(r) && Math.abs(r - x) < scale) {
        x = r;
        precise = true;
      }
    }
    const y = f(x);
    if (!Number.isFinite(y)) continue;
    // Écarte les pics d'asymptote (valeurs démesurées par rapport aux voisins).
    const span = Math.abs(y2 - y0) + Math.abs(y1 - y0);
    if (Math.abs(y - y1) > 10 * span + 1e-9 * (1 + Math.abs(y1))) continue;
    // Plateau (fonction constante par morceaux) : pas un extremum strict exploitable.
    if (Math.abs(f(x - scale) - y) < 1e-14 && Math.abs(f(x + scale) - y) < 1e-14) continue;
    out.push({ x: snap(x, precise ? 1e-9 : 5e-8), y: snap(y), kind: isMax ? 'max' : 'min' });
    if (out.length > MAX_POINTS) return [];
  }
  return out;
}

/** Abscisses des points d'intersection des courbes de f et g sur [a, b]. */
export function findIntersections(f: RealFn, g: RealFn, a: number, b: number, n = 800): number[] {
  return findRoots((x) => f(x) - g(x), a, b, n);
}

function dedupe(values: number[], tol: number): number[] {
  const out: number[] = [];
  for (const v of values.sort((p, q) => p - q)) {
    if (!out.length || Math.abs(v - out[out.length - 1]) > tol) out.push(v);
  }
  return out;
}

// ─── Limites ────────────────────────────────────────────────────────────────

export type LimitResult =
  | { kind: 'value'; value: number }
  | { kind: '+inf' }
  | { kind: '-inf' }
  | { kind: 'none' }
  | { kind: 'undefined' }
  | { kind: 'unknown' };

/** Classe une suite de valeurs f(xₖ) où xₖ tend vers le point étudié. */
export function classifySequence(values: number[]): LimitResult {
  const vals = values.filter((v) => !Number.isNaN(v));
  if (vals.length < values.length / 2) return { kind: 'undefined' };
  const tail = vals.slice(-4);
  if (tail.every((v) => v === Infinity)) return { kind: '+inf' };
  if (tail.every((v) => v === -Infinity)) return { kind: '-inf' };
  if (tail.some((v) => !Number.isFinite(v))) {
    const last = tail[tail.length - 1];
    if (last === Infinity) return { kind: '+inf' };
    if (last === -Infinity) return { kind: '-inf' };
    return { kind: 'unknown' };
  }
  const [a, b, c, d] = tail.length === 4 ? tail : [tail[0], tail[0], tail[1] ?? tail[0], tail[tail.length - 1]];
  const mag = 1 + Math.abs(d);
  const diffs = [b - a, c - b, d - c];
  if (Math.abs(d - c) < 1e-9 * mag && Math.abs(c - b) < 1e-7 * mag) return { kind: 'value', value: snap(d, 1e-7) };

  // Convergence géométrique (typiquement en 1/x) : extrapolation d'Aitken.
  const r1 = diffs[1] / diffs[0];
  const r2 = diffs[2] / diffs[1];
  if (Number.isFinite(r1) && Number.isFinite(r2) && Math.abs(r2) < 0.6 && Math.abs(r1) < 0.6 && Math.abs(r1 - r2) < 0.25) {
    const limit = d + (diffs[2] * r2) / (1 - r2);
    if (Math.abs(limit - d) < 1e-2 * mag) return { kind: 'value', value: snap(limit, 1e-6) };
  }

  const increasing = diffs.every((x) => x > 0);
  const decreasing = diffs.every((x) => x < 0);
  if (increasing && d > 10) return { kind: '+inf' };
  if (decreasing && d < -10) return { kind: '-inf' };
  const signChanges = diffs.slice(1).filter((x, i) => Math.sign(x) !== Math.sign(diffs[i])).length;
  if (signChanges >= 1 && Math.max(...diffs.map(Math.abs)) > 1e-3 * mag) return { kind: 'none' };
  return { kind: 'unknown' };
}

/** Limite en +∞ (direction = 1) ou en −∞ (direction = −1). */
export function limitAtInfinity(f: RealFn, direction: 1 | -1): LimitResult {
  const values: number[] = [];
  for (let k = 2; k <= 8; k++) values.push(f(direction * 10 ** k));
  // Oscillations (sin x) : on échantillonne aussi des points non alignés sur les puissances de 10.
  const probe = [3.7e5, 5.3e6, 7.1e7].map((x) => f(direction * x));
  const res = classifySequence(values);
  if (res.kind === 'value' && probe.some((v) => Math.abs(v - res.value) > 1e-4 * (1 + Math.abs(res.value)))) return { kind: 'none' };
  return res;
}

/** Limite à gauche (side = −1) ou à droite (side = 1) en x0. */
export function limitAt(f: RealFn, x0: number, side: 1 | -1): LimitResult {
  const scale = Math.max(1, Math.abs(x0));
  const values: number[] = [];
  for (let k = 2; k <= 8; k++) values.push(f(x0 + side * scale * 10 ** -k));
  return classifySequence(values);
}

export interface Singularity {
  x: number;
  /** 'asymptote' : f non bornée au voisinage ; 'edge' : bord du domaine de définition. */
  kind: 'asymptote' | 'edge';
  left: LimitResult;
  right: LimitResult;
}

/** Asymptotes verticales et bords du domaine visibles sur [a, b]. */
export function findSingularities(f: RealFn, a: number, b: number, n = 600): Singularity[] {
  const { xs, ys } = samples(f, a, b, n);
  const out: Singularity[] = [];
  const scale = (b - a) / n;
  const push = (x: number, kind: Singularity['kind']) => {
    const sx = snap(x, 1e-7);
    if (out.some((s) => Math.abs(s.x - sx) < scale)) return;
    out.push({ x: sx, kind, left: limitAt(f, sx, -1), right: limitAt(f, sx, 1) });
  };
  // « Défini » = pas NaN : une valeur ±∞ isolée (1/x en 0) signale une asymptote, pas un bord.
  const defined = (y: number) => !Number.isNaN(y);
  for (let i = 0; i < n && out.length < 20; i++) {
    const y0 = ys[i];
    const y1 = ys[i + 1];
    const d0 = defined(y0);
    const d1 = defined(y1);
    if (d0 !== d1) {
      // Bord du domaine : dichotomie sur « f est définie ».
      let lo = xs[i];
      let hi = xs[i + 1];
      for (let k = 0; k < 50; k++) {
        const m = (lo + hi) / 2;
        if (defined(f(m)) === d0) lo = m;
        else hi = m;
      }
      push((lo + hi) / 2, 'edge');
      continue;
    }
    if (!d0) continue;
    // Asymptote : saut démesuré avec changement de signe ou valeurs qui explosent.
    const big = Math.max(Math.abs(y0), Math.abs(y1));
    const neighbors = Math.max(Math.abs(ys[Math.max(0, i - 3)]), Math.abs(ys[Math.min(n, i + 4)]));
    if (!(big > 50 * (1 + neighbors) || (y0 * y1 < 0 && Math.abs(y1 - y0) > 100 * (1 + Math.min(Math.abs(y0), Math.abs(y1)))))) continue;
    // Localise le point où |f| est maximal.
    let lo = xs[i];
    let hi = xs[i + 1];
    for (let k = 0; k < 60; k++) {
      const m1 = lo + (hi - lo) / 3;
      const m2 = hi - (hi - lo) / 3;
      const v1 = Math.abs(f(m1));
      const v2 = Math.abs(f(m2));
      if (!(v1 >= v2 || !Number.isFinite(v1))) lo = m1;
      else hi = m2;
    }
    const x = (lo + hi) / 2;
    const l = limitAt(f, x, -1);
    const r = limitAt(f, x, 1);
    const infinite = (res: LimitResult) => res.kind === '+inf' || res.kind === '-inf';
    if (infinite(l) || infinite(r)) push(x, 'asymptote');
  }
  return out;
}
