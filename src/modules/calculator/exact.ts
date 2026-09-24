/**
 * Formes exactes : fractions (BigInt), reconnaissance de nombres de la forme
 * p/q, k√m/q, (a + b√m)/d et kπ/q à partir d'une valeur calculée avec 64 chiffres
 * significatifs, et polynômes à coefficients rationnels (racines exactes, factorisation).
 */

const abs = (a: bigint) => (a < 0n ? -a : a);
export const gcd = (a: bigint, b: bigint): bigint => {
  a = abs(a);
  b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};

/** Rationnel exact n/d (d > 0, fraction irréductible). */
export class Q {
  readonly n: bigint;
  readonly d: bigint;
  constructor(n: bigint, d = 1n) {
    if (d === 0n) throw new RangeError('division par zéro');
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d) || 1n;
    this.n = n / g;
    this.d = d / g;
  }
  static int(v: number | bigint): Q {
    return new Q(BigInt(v));
  }
  add(o: Q): Q {
    return new Q(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o: Q): Q {
    return new Q(this.n * o.d - o.n * this.d, this.d * o.d);
  }
  mul(o: Q): Q {
    return new Q(this.n * o.n, this.d * o.d);
  }
  div(o: Q): Q {
    return new Q(this.n * o.d, this.d * o.n);
  }
  neg(): Q {
    return new Q(-this.n, this.d);
  }
  isZero(): boolean {
    return this.n === 0n;
  }
  sign(): number {
    return this.n === 0n ? 0 : this.n > 0n ? 1 : -1;
  }
  toNumber(): number {
    return Number(this.n) / Number(this.d);
  }
  /** Approximation d'un réel par fraction continue (dénominateur ≤ maxDen). */
  static approx(x: number, maxDen = 1_000_000, tol = 1e-12): Q | null {
    if (!Number.isFinite(x)) return null;
    let h1 = 1n;
    let h0 = 0n;
    let k1 = 0n;
    let k0 = 1n;
    let v = x;
    for (let i = 0; i < 40; i++) {
      const a = Math.floor(v);
      const A = BigInt(a);
      [h1, h0] = [A * h1 + h0, h1];
      [k1, k0] = [A * k1 + k0, k1];
      if (k1 > BigInt(maxDen)) return null;
      if (Math.abs(x - Number(h1) / Number(k1)) <= tol * Math.max(1, Math.abs(x))) return new Q(h1, k1);
      const f = v - a;
      if (f < 1e-15) break;
      v = 1 / f;
    }
    return Math.abs(x - Number(h1) / Number(k1)) <= tol * Math.max(1, Math.abs(x)) ? new Q(h1, k1) : null;
  }
  tex(): string {
    if (this.d === 1n) return String(this.n);
    return `${this.n < 0n ? '-' : ''}\\frac{${abs(this.n)}}{${this.d}}`;
  }
  text(): string {
    return this.d === 1n ? String(this.n).replace('-', '−') : `${this.n < 0n ? '−' : ''}${abs(this.n)}/${this.d}`;
  }
}

/** Décomposition √n = k√m avec m sans facteur carré. */
export function sqrtParts(n: bigint): [bigint, bigint] {
  let k = 1n;
  let m = n;
  for (let p = 2n; p * p <= m && p < 100000n; p++) {
    while (m % (p * p) === 0n) {
      m /= p * p;
      k *= p;
    }
  }
  return [k, m];
}

// ─── Reconnaissance de formes exactes ────────────────────────────────────────

/** Valeur haute précision : chaîne décimale et fonctions de comparaison fournies par l'appelant. */
export interface HighPrecision {
  value: number;
  /** Vérifie qu'une expression mathjs (texte) vaut la valeur à 10⁻⁴⁰ près. */
  check(expr: string): boolean;
}

export interface ExactForm {
  tex: string;
  text: string;
}

const SQUAREFREE: number[] = [];
for (let m = 2; m <= 200; m++) {
  let ok = true;
  for (let p = 2; p * p <= m; p++) if (m % (p * p) === 0) ok = false;
  if (ok) SQUAREFREE.push(m);
}

function fracTex(num: string, den: bigint, negative: boolean): string {
  const body = den === 1n ? num : `\\frac{${num}}{${den}}`;
  return `${negative ? '-' : ''}${body}`;
}

/** Cherche une forme exacte simple ; null si aucune n'est vérifiée. */
export function identify(hp: HighPrecision): ExactForm | null {
  const v = hp.value;
  if (!Number.isFinite(v)) return null;
  // 1. Rationnel
  const q = Q.approx(v, 10_000_000, 1e-13);
  if (q && hp.check(`${q.n}/${q.d}`)) return { tex: q.tex(), text: q.text() };
  // 2. ±k√m/q : le carré est rationnel
  const q2 = Q.approx(v * v, 1_000_000, 1e-12);
  if (q2 && q2.n > 0n) {
    const [k, m] = sqrtParts(q2.n * q2.d);
    if (m > 1n && m < 1_000_000n) {
      const g = gcd(k, q2.d);
      const kk = k / g;
      const den = q2.d / g;
      const neg = v < 0;
      if (hp.check(`${neg ? '-' : ''}${kk}*sqrt(${m})/${den}`)) {
        const num = `${kk === 1n ? '' : kk}\\sqrt{${m}}`;
        return { tex: fracTex(num, den, neg), text: `${neg ? '−' : ''}${kk === 1n ? '' : kk}√${m}${den === 1n ? '' : `/${den}`}` };
      }
    }
  }
  // 3. kπ/q
  const qp = Q.approx(v / Math.PI, 1000, 1e-12);
  if (qp && !qp.isZero() && hp.check(`${qp.n}*pi/${qp.d}`)) {
    const a = abs(qp.n);
    const num = `${a === 1n ? '' : a}\\pi`;
    return { tex: fracTex(num, qp.d, qp.n < 0n), text: `${qp.n < 0n ? '−' : ''}${a === 1n ? '' : a}π${qp.d === 1n ? '' : `/${qp.d}`}` };
  }
  // 4. (a + b√m)/d
  for (const m of SQUAREFREE.slice(0, 60)) {
    const r = Math.sqrt(m);
    for (let d = 1; d <= 24; d++) {
      for (let b = -48; b <= 48; b++) {
        if (b === 0) continue;
        const a = v * d - b * r;
        const ai = Math.round(a);
        if (Math.abs(a - ai) > 1e-9 || Math.abs(ai) > 100000) continue;
        // Fraction irréductible
        const g = Number(gcd(gcd(BigInt(ai), BigInt(b)), BigInt(d)));
        const A = ai / g;
        const B = b / g;
        const D = d / g;
        if (!hp.check(`(${A} + ${B}*sqrt(${m}))/${D}`)) continue;
        const bAbs = Math.abs(B);
        const radical = `${bAbs === 1 ? '' : bAbs}\\sqrt{${m}}`;
        let num = A === 0 ? `${B < 0 ? '-' : ''}${radical}` : `${A} ${B < 0 ? '-' : '+'} ${radical}`;
        let neg = false;
        // −1 − √5 → −(1 + √5) quand tout est négatif et le dénominateur ≠ 1
        if (D !== 1 && A < 0 && B < 0) {
          neg = true;
          num = `${-A} + ${radical}`;
        }
        const text = `${neg ? '−' : ''}${D !== 1 ? '(' : ''}${neg ? -A : A === 0 ? '' : A}${A === 0 && !neg ? (B < 0 ? '−' : '') : neg ? ' + ' : B < 0 ? ' − ' : ' + '}${bAbs === 1 ? '' : bAbs}√${m}${D !== 1 ? `)/${D}` : ''}`;
        return { tex: D === 1 ? num : fracTex(num, BigInt(D), neg), text };
      }
    }
  }
  return null;
}

// ─── Polynômes à coefficients rationnels ─────────────────────────────────────

/** Polynôme : coefficients du degré 0 au degré n. */
export type Poly = Q[];

export function trim(p: Poly): Poly {
  const out = [...p];
  while (out.length > 1 && out[out.length - 1].isZero()) out.pop();
  return out;
}

export const degree = (p: Poly) => trim(p).length - 1;

export function evalPoly(p: Poly, x: Q): Q {
  let acc = new Q(0n);
  for (let i = p.length - 1; i >= 0; i--) acc = acc.mul(x).add(p[i]);
  return acc;
}

/** Division par (x − r) : quotient (le reste est supposé nul). */
function deflate(p: Poly, r: Q): Poly {
  const n = p.length - 1;
  const q: Q[] = new Array(n);
  let acc = new Q(0n);
  for (let i = n; i >= 1; i--) {
    acc = acc.mul(r).add(p[i]);
    q[i - 1] = acc;
  }
  return q;
}

function divisorsOf(n: bigint, limit = 5000): bigint[] {
  n = abs(n);
  if (n === 0n) return [1n];
  const out: bigint[] = [];
  for (let d = 1n; d * d <= n && out.length < limit; d++) {
    if (n % d === 0n) {
      out.push(d);
      if (d * d !== n) out.push(n / d);
    }
  }
  return out;
}

export interface Factored {
  /** Coefficient dominant (et contenu rationnel). */
  lead: Q;
  /** Racines rationnelles avec multiplicité. */
  roots: [Q, number][];
  /** Facteur restant sans racine rationnelle (degré ≥ 1), coefficients normalisés (unitaire). */
  rest: Poly;
}

/** Racines rationnelles (théorème des racines rationnelles) et reste unitaire. */
export function factorRational(p0: Poly): Factored {
  let p = trim(p0);
  const lead = p[p.length - 1];
  p = p.map((c) => c.div(lead));
  const roots: [Q, number][] = [];
  // Racine 0
  let zeros = 0;
  while (p.length > 1 && p[0].isZero()) {
    p = p.slice(1);
    zeros++;
  }
  if (zeros) roots.push([new Q(0n), zeros]);
  // Coefficients entiers : multiplication par le PPCM des dénominateurs.
  const tryRoots = () => {
    const lcm = p.reduce((l, c) => (l / gcd(l, c.d)) * c.d, 1n);
    const ints = p.map((c) => (c.n * lcm) / c.d);
    const a0 = ints[0];
    const an = ints[ints.length - 1];
    if (a0 === 0n) return null;
    const ps = divisorsOf(a0);
    const qs = divisorsOf(an);
    for (const num of ps) for (const den of qs) for (const s of [1n, -1n]) {
      const r = new Q(s * num, den);
      if (evalPoly(p, r).isZero()) return r;
    }
    return null;
  };
  let guard = 0;
  while (p.length > 1 && guard++ < 64) {
    const r = tryRoots();
    if (!r) break;
    p = deflate(p, r);
    const found = roots.find(([x]) => x.n === r.n && x.d === r.d);
    if (found) found[1]++;
    else roots.push([r, 1]);
  }
  roots.sort((a, b) => a[0].toNumber() - b[0].toNumber());
  return { lead, roots, rest: p };
}

/** Racines d'un trinôme unitaire x² + bx + c : formes exactes (TeX) et valeurs. */
export function quadraticRoots(b: Q, c: Q): { delta: Q; roots: { tex: string; text: string; value: number }[]; complex: boolean } {
  // Δ = b² − 4c ; racines (−b ± √Δ)/2
  const delta = b.mul(b).sub(new Q(4n).mul(c));
  const complex = delta.sign() < 0;
  const dAbs = complex ? delta.neg() : delta;
  // √(p/q) = √(p·q)/q = k√m / q
  const [k, m] = sqrtParts(dAbs.n * dAbs.d);
  const den = dAbs.d;
  // x = −b/2 ± (k√m)/(2q)
  const re = b.neg().div(new Q(2n));
  const coef = new Q(k, 2n * den); // coefficient devant √m
  const roots: { tex: string; text: string; value: number }[] = [];
  for (const s of [-1, 1]) {
    const im = s < 0 ? coef.neg() : coef;
    const rad = m === 1n ? '' : `\\sqrt{${m}}`;
    const radT = m === 1n ? '' : `√${m}`;
    const unit = complex ? '\\,i' : '';
    const unitT = complex ? 'i' : '';
    // Écriture sur un dénominateur commun : (A ± B√m)/D
    const D = (re.d * im.d) / gcd(re.d, im.d);
    const A = (re.n * D) / re.d;
    const B = (im.n * D) / im.d;
    const Bs = abs(B);
    const bPart = `${Bs === 1n && (m !== 1n || complex) ? '' : Bs}${rad}${unit}`;
    const bPartT = `${Bs === 1n && (m !== 1n || complex) ? '' : Bs}${radT}${unitT}`;
    const numTex = A === 0n ? `${B < 0n ? '-' : ''}${bPart}` : `${A} ${B < 0n ? '-' : '+'} ${bPart}`;
    const numText = A === 0n ? `${B < 0n ? '−' : ''}${bPartT}` : `${String(A).replace('-', '−')} ${B < 0n ? '−' : '+'} ${bPartT}`;
    const value = complex ? Number.NaN : re.toNumber() + im.toNumber() * Math.sqrt(Number(m));
    roots.push({ tex: D === 1n ? numTex : `\\frac{${numTex}}{${D}}`, text: D === 1n ? numText : `(${numText})/${D}`, value });
    if (delta.isZero()) break;
  }
  return { delta, roots, complex };
}

/** Racines réelles approchées d'un polynôme (méthode de Durand-Kerner). */
export function numericRoots(p: Poly): number[] {
  const c = trim(p).map((x) => x.toNumber());
  const n = c.length - 1;
  if (n < 1) return [];
  const a = c.map((x) => x / c[n]);
  let re = Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * i) / n + 0.4) * 1.3);
  let im = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * i) / n + 0.4) * 1.3);
  for (let it = 0; it < 500; it++) {
    let delta = 0;
    const nr = [...re];
    const ni = [...im];
    for (let i = 0; i < n; i++) {
      // p(z)
      let pr = 1;
      let pi = 0;
      for (let k = n - 1; k >= 0; k--) {
        [pr, pi] = [pr * re[i] - pi * im[i] + a[k], pr * im[i] + pi * re[i]];
      }
      let dr = 1;
      let di = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const xr = re[i] - re[j];
        const xi = im[i] - im[j];
        [dr, di] = [dr * xr - di * xi, dr * xi + di * xr];
      }
      const den = dr * dr + di * di || 1e-300;
      const qr = (pr * dr + pi * di) / den;
      const qi = (pi * dr - pr * di) / den;
      nr[i] = re[i] - qr;
      ni[i] = im[i] - qi;
      delta = Math.max(delta, Math.hypot(qr, qi));
    }
    re = nr;
    im = ni;
    if (delta < 1e-14) break;
  }
  const out = re.filter((_, i) => Math.abs(im[i]) < 1e-7 * Math.max(1, Math.abs(re[i])));
  return out.sort((x, y) => x - y);
}
