/**
 * Outils d'analyse numérique partagés (grapheuse, suites, probabilités…).
 * Toutes les fonctions sont pures et testées (tests/numeric.test.ts).
 */

export type RealFn = (x: number) => number;

/** Recherche de racine par la méthode de Brent sur [a, b] avec f(a)·f(b) ≤ 0. */
export function brentRoot(f: RealFn, a: number, b: number, tol = 1e-13, maxIter = 100): number {
  let fa = f(a);
  let fb = f(b);
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (!(fa * fb < 0)) return Number.NaN;
  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;
  for (let iter = 0; iter < maxIter; iter++) {
    if (fb * fc > 0) {
      c = a;
      fc = fa;
      d = e = b - a;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b; b = c; c = a;
      fa = fb; fb = fc; fc = fa;
    }
    const tol1 = 2 * Number.EPSILON * Math.abs(b) + tol / 2;
    const xm = (c - b) / 2;
    if (Math.abs(xm) <= tol1 || fb === 0) return b;
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p: number;
      let q: number;
      if (a === c) {
        p = 2 * xm * s;
        q = 1 - s;
      } else {
        const qq = fa / fc;
        const r = fb / fc;
        p = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      p = Math.abs(p);
      if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = xm;
        e = d;
      }
    } else {
      d = xm;
      e = d;
    }
    a = b;
    fa = fb;
    b += Math.abs(d) > tol1 ? d : xm > 0 ? tol1 : -tol1;
    fb = f(b);
  }
  return b;
}

/** Minimum local de f sur [a, b] par section dorée. */
export function goldenMin(f: RealFn, a: number, b: number, tol = 1e-10, maxIter = 200): number {
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  let fc = f(c);
  let fd = f(d);
  for (let i = 0; i < maxIter && Math.abs(b - a) > tol * (1 + Math.abs(a) + Math.abs(b)); i++) {
    if (fc < fd) {
      b = d; d = c; fd = fc;
      c = b - g * (b - a);
      fc = f(c);
    } else {
      a = c; c = d; fc = fd;
      d = a + g * (b - a);
      fd = f(d);
    }
  }
  return (a + b) / 2;
}

/** Dérivée numérique (différences centrées + extrapolation de Richardson, erreur O(h⁴)). */
export function derivative(f: RealFn, x: number): number {
  const h = 1e-3 * Math.max(1, Math.abs(x));
  const d1 = (f(x + h) - f(x - h)) / (2 * h);
  const d2 = (f(x + h / 2) - f(x - h / 2)) / h;
  return (4 * d2 - d1) / 3;
}

export function secondDerivative(f: RealFn, x: number): number {
  const h = 1e-3 * Math.max(1, Math.abs(x));
  return (f(x + h) - 2 * f(x) + f(x - h)) / (h * h);
}

/** Intégrale par la méthode de Simpson adaptative. Retourne NaN si f n'est pas définie. */
export function integrate(f: RealFn, a: number, b: number, eps = 1e-10, maxDepth = 18): number {
  if (a === b) return 0;
  if (a > b) return -integrate(f, b, a, eps, maxDepth);
  const fa = f(a);
  const fb = f(b);
  const m = (a + b) / 2;
  const fm = f(m);
  const whole = ((b - a) / 6) * (fa + 4 * fm + fb);
  const result = simpsonRec(f, a, b, fa, fm, fb, whole, eps, maxDepth);
  return Number.isFinite(result) ? result : Number.NaN;
}

function simpsonRec(f: RealFn, a: number, b: number, fa: number, fm: number, fb: number, whole: number, eps: number, depth: number): number {
  const m = (a + b) / 2;
  const lm = (a + m) / 2;
  const rm = (m + b) / 2;
  const flm = f(lm);
  const frm = f(rm);
  const left = ((m - a) / 6) * (fa + 4 * flm + fm);
  const right = ((b - m) / 6) * (fm + 4 * frm + fb);
  const delta = left + right - whole;
  if (depth <= 0 || Math.abs(delta) <= 15 * eps) return left + right + delta / 15;
  return (
    simpsonRec(f, a, m, fa, flm, fm, left, eps / 2, depth - 1) +
    simpsonRec(f, m, b, fm, frm, fb, right, eps / 2, depth - 1)
  );
}

/**
 * Fonction Gamma, prolonge la factorielle : n! = Γ(n+1).
 * Entiers : produit exact ; sinon série de Stirling après translation (x ≥ 15,
 * erreur relative ~1e-13) et formule des compléments pour x < 1/2.
 */
export function gamma(x: number): number {
  if (Number.isNaN(x)) return Number.NaN;
  if (Number.isInteger(x)) {
    if (x <= 0) return Number.NaN;
    if (x > 171) return Infinity;
    let r = 1;
    for (let i = 2; i < x; i++) r *= i;
    return r;
  }
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  if (x > 171.6) return Infinity;
  let shift = 1;
  let z = x;
  while (z < 15) {
    shift *= z;
    z += 1;
  }
  const z2 = z * z;
  const series = (1 / 12 - (1 / 360 - (1 / 1260 - (1 / 1680 - 1 / (1188 * z2)) / z2) / z2) / z2) / z;
  const lnGamma = (z - 0.5) * Math.log(z) - z + 0.5 * Math.log(2 * Math.PI) + series;
  return Math.exp(lnGamma) / shift;
}

/** Pas « agréable » (1, 2 ou 5 × 10ⁿ) proche de `raw`. */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = raw / 10 ** exp;
  const nice = base < 1.5 ? 1 : base < 3.5 ? 2 : base < 7.5 ? 5 : 10;
  return nice * 10 ** exp;
}

/** Plus petit calibre 1, 2 ou 5 × 10ⁿ supérieur ou égal à `x` (oscilloscope, axes). */
export function niceCeil(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) return 1;
  const exp = Math.floor(Math.log10(x));
  for (const m of [1, 2, 5, 10]) {
    const v = m * 10 ** exp;
    if (v >= x * (1 - 1e-12)) return v;
  }
  return 10 ** (exp + 1);
}
