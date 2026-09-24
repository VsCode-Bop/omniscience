/**
 * Calcul matriciel exact : fractions à numérateur et dénominateur BigInt,
 * opérations usuelles, déterminant, inverse, rang, résolution de systèmes,
 * avec les étapes de la méthode du pivot de Gauss.
 */
import { abs, gcd } from './numbers';

export class Fraction {
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

  static readonly ZERO = new Fraction(0n);
  static readonly ONE = new Fraction(1n);

  static of(v: number | bigint): Fraction {
    return new Fraction(BigInt(v));
  }

  /** « 3 », « −2/5 », « 0,25 », « 1.5 », « 1e3 ». */
  static parse(text: string): Fraction | null {
    const t = text.trim().replace(/[\s ]/g, '').replace('−', '-').replace(',', '.');
    if (!t) return null;
    const frac = /^([-+]?\d+)\/([-+]?\d+)$/.exec(t);
    if (frac) {
      const d = BigInt(frac[2]);
      return d === 0n ? null : new Fraction(BigInt(frac[1]), d);
    }
    const dec = /^([-+]?)(\d*)(?:\.(\d*))?(?:e([-+]?\d+))?$/i.exec(t);
    if (!dec || (!dec[2] && !dec[3])) return null;
    const sign = dec[1] === '-' ? -1n : 1n;
    const digits = (dec[2] || '0') + (dec[3] ?? '');
    const exp = -(dec[3]?.length ?? 0) + Number(dec[4] ?? 0);
    if (Math.abs(exp) > 60) return null;
    let n = BigInt(digits) * sign;
    let d = 1n;
    if (exp >= 0) n *= 10n ** BigInt(exp);
    else d = 10n ** BigInt(-exp);
    return new Fraction(n, d);
  }

  add(o: Fraction): Fraction {
    return new Fraction(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o: Fraction): Fraction {
    return new Fraction(this.n * o.d - o.n * this.d, this.d * o.d);
  }
  mul(o: Fraction): Fraction {
    return new Fraction(this.n * o.n, this.d * o.d);
  }
  div(o: Fraction): Fraction {
    return new Fraction(this.n * o.d, this.d * o.n);
  }
  neg(): Fraction {
    return new Fraction(-this.n, this.d);
  }
  isZero(): boolean {
    return this.n === 0n;
  }
  isOne(): boolean {
    return this.n === 1n && this.d === 1n;
  }
  equals(o: Fraction): boolean {
    return this.n === o.n && this.d === o.d;
  }
  toNumber(): number {
    return Number(this.n) / Number(this.d);
  }

  /** Écriture texte : « −2/5 ». */
  toString(): string {
    const s = `${abs(this.n)}${this.d === 1n ? '' : `/${this.d}`}`;
    return this.n < 0n ? `−${s}` : s;
  }

  toTex(): string {
    if (this.d === 1n) return String(this.n);
    return `${this.n < 0n ? '-' : ''}\\frac{${abs(this.n)}}{${this.d}}`;
  }
}

export type Matrix = Fraction[][];

export const rows = (m: Matrix) => m.length;
export const cols = (m: Matrix) => m[0]?.length ?? 0;

export function zeros(r: number, c: number): Matrix {
  return Array.from({ length: r }, () => Array.from({ length: c }, () => Fraction.ZERO));
}

export function identity(n: number): Matrix {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? Fraction.ONE : Fraction.ZERO)));
}

export class MatrixError extends Error {}

export function add(a: Matrix, b: Matrix): Matrix {
  if (rows(a) !== rows(b) || cols(a) !== cols(b)) throw new MatrixError('A et B doivent avoir la même taille.');
  return a.map((r, i) => r.map((x, j) => x.add(b[i][j])));
}

export function sub(a: Matrix, b: Matrix): Matrix {
  if (rows(a) !== rows(b) || cols(a) !== cols(b)) throw new MatrixError('A et B doivent avoir la même taille.');
  return a.map((r, i) => r.map((x, j) => x.sub(b[i][j])));
}

export function scale(a: Matrix, k: Fraction): Matrix {
  return a.map((r) => r.map((x) => x.mul(k)));
}

export function mul(a: Matrix, b: Matrix): Matrix {
  if (cols(a) !== rows(b)) throw new MatrixError(`Produit impossible : A a ${cols(a)} colonne${cols(a) > 1 ? 's' : ''}, B a ${rows(b)} ligne${rows(b) > 1 ? 's' : ''}.`);
  return a.map((r) => Array.from({ length: cols(b) }, (_, j) => r.reduce((s, x, k) => s.add(x.mul(b[k][j])), Fraction.ZERO)));
}

export function transpose(a: Matrix): Matrix {
  return Array.from({ length: cols(a) }, (_, j) => a.map((r) => r[j]));
}

export function power(a: Matrix, n: number): Matrix {
  if (rows(a) !== cols(a)) throw new MatrixError('La puissance n\'est définie que pour une matrice carrée.');
  if (n < 0) return power(inverse(a).result, -n);
  let result = identity(rows(a));
  let base = a;
  while (n > 0) {
    if (n & 1) result = mul(result, base);
    base = mul(base, base);
    n >>= 1;
  }
  return result;
}

// ─── Pivot de Gauss ──────────────────────────────────────────────────────────

export interface GaussStep {
  /** Opération sur les lignes (« L₂ ← L₂ − 3L₁ »), plusieurs à la fois si elles portent sur le même pivot. */
  ops: string[];
  matrix: Matrix;
}

const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
const L = (i: number) => `L${String(i + 1).replace(/\d/g, (d) => SUB[d])}`;

/** Coefficient écrit devant une ligne : « 3L₁ », « L₁ », « (2/3)L₁ ». */
function coefText(k: Fraction, line: string): string {
  const a = k.n < 0n ? k.neg() : k;
  const body = a.isOne() ? line : a.d === 1n ? `${a}${line}` : `(${a})${line}`;
  return body;
}

/**
 * Forme échelonnée réduite par la méthode de Gauss-Jordan, avec les étapes.
 * `augmented` : nombre de colonnes (à droite) qui ne servent pas de pivots.
 */
export function rref(m: Matrix, augmented = 0): { result: Matrix; steps: GaussStep[]; rank: number; pivots: number[] } {
  const a = m.map((r) => [...r]);
  const R = rows(a);
  const C = cols(a) - augmented;
  const steps: GaussStep[] = [];
  const pivots: number[] = [];
  let row = 0;
  for (let col = 0; col < C && row < R; col++) {
    // Pivot : premier coefficient non nul de la colonne, en privilégiant 1 ou −1.
    let p = -1;
    for (let i = row; i < R; i++) {
      if (a[i][col].isZero()) continue;
      if (p < 0) p = i;
      if (a[i][col].d === 1n && abs(a[i][col].n) === 1n) {
        p = i;
        break;
      }
    }
    if (p < 0) continue;
    if (p !== row) {
      [a[p], a[row]] = [a[row], a[p]];
      steps.push({ ops: [`${L(row)} ↔ ${L(p)}`], matrix: a.map((r) => [...r]) });
    }
    const pv = a[row][col];
    if (!pv.isOne()) {
      a[row] = a[row].map((x) => x.div(pv));
      const inv = Fraction.ONE.div(pv);
      steps.push({ ops: [`${L(row)} ← ${inv.n < 0n ? '−' : ''}${coefText(inv, L(row))}`], matrix: a.map((r) => [...r]) });
    }
    const ops: string[] = [];
    for (let i = 0; i < R; i++) {
      if (i === row || a[i][col].isZero()) continue;
      const k = a[i][col];
      a[i] = a[i].map((x, j) => x.sub(k.mul(a[row][j])));
      ops.push(`${L(i)} ← ${L(i)} ${k.n < 0n ? '+' : '−'} ${coefText(k, L(row))}`);
    }
    if (ops.length) steps.push({ ops, matrix: a.map((r) => [...r]) });
    pivots.push(col);
    row++;
  }
  return { result: a, steps, rank: pivots.length, pivots };
}

export function determinant(a: Matrix): Fraction {
  if (rows(a) !== cols(a)) throw new MatrixError('Le déterminant n\'est défini que pour une matrice carrée.');
  const n = rows(a);
  const m = a.map((r) => [...r]);
  let det = Fraction.ONE;
  for (let c = 0; c < n; c++) {
    let p = c;
    while (p < n && m[p][c].isZero()) p++;
    if (p === n) return Fraction.ZERO;
    if (p !== c) {
      [m[p], m[c]] = [m[c], m[p]];
      det = det.neg();
    }
    det = det.mul(m[c][c]);
    for (let i = c + 1; i < n; i++) {
      const k = m[i][c].div(m[c][c]);
      if (!k.isZero()) m[i] = m[i].map((x, j) => x.sub(k.mul(m[c][j])));
    }
  }
  return det;
}

export function inverse(a: Matrix): { result: Matrix; steps: GaussStep[] } {
  const n = rows(a);
  if (n !== cols(a)) throw new MatrixError('Seule une matrice carrée peut être inversible.');
  const aug = a.map((r, i) => [...r, ...identity(n)[i]]);
  const { result, steps, rank } = rref(aug, n);
  if (rank < n) throw new MatrixError('Matrice non inversible : son déterminant est nul.');
  return { result: result.map((r) => r.slice(n)), steps };
}

export type Solution =
  | { kind: 'unique'; x: Fraction[] }
  | { kind: 'none' }
  | { kind: 'infinite'; particular: Fraction[]; free: number[] };

/** Résolution de A·X = B (B colonne) par Gauss-Jordan. */
export function solve(a: Matrix, b: Fraction[]): { solution: Solution; steps: GaussStep[] } {
  if (rows(a) !== b.length) throw new MatrixError('B doit avoir autant de lignes que A.');
  const n = cols(a);
  const aug = a.map((r, i) => [...r, b[i]]);
  const { result, steps, pivots } = rref(aug, 1);
  // Ligne 0 = c non nul : incompatible.
  for (const r of result) if (r.slice(0, n).every((x) => x.isZero()) && !r[n].isZero()) return { solution: { kind: 'none' }, steps };
  const x = Array.from({ length: n }, () => Fraction.ZERO);
  pivots.forEach((c, i) => (x[c] = result[i][n]));
  if (pivots.length === n) return { solution: { kind: 'unique', x }, steps };
  return { solution: { kind: 'infinite', particular: x, free: Array.from({ length: n }, (_, i) => i).filter((i) => !pivots.includes(i)) }, steps };
}

export function toTex(m: Matrix, augmented = 0): string {
  const c = cols(m);
  const spec = augmented ? `${'c'.repeat(c - augmented)}|${'c'.repeat(augmented)}` : 'c'.repeat(c);
  return `\\left(\\begin{array}{${spec}}${m.map((r) => r.map((x) => x.toTex()).join(' & ')).join(' \\\\ ')}\\end{array}\\right)`;
}
