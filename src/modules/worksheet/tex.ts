/**
 * Écriture des nombres et des expressions en LaTeX « à la française » : virgule
 * décimale {,}, espaces fines entre les milliers, fractions, polynômes, radicaux,
 * notation scientifique. Le même LaTeX sert à l'aperçu (KaTeX) et à l'export .tex.
 */

export const t = String.raw;

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function lcm(a: number, b: number): number {
  return a && b ? Math.abs(a * b) / gcd(a, b) : 0;
}

// ─── Nombres décimaux ──────────────────────────────────────────────────────

/** Groupe les chiffres par trois (espace fine) si la partie compte au moins 5 chiffres. */
function groupDigits(int: string, frac: string): string {
  const i = int.length >= 5 ? int.replace(/\B(?=(\d{3})+$)/g, '\\,') : int;
  const f = frac.length >= 5 ? frac.replace(/(\d{3})(?=\d)/g, '$1\\,') : frac;
  return f ? `${i}{,}${f}` : i;
}

/** Nombre décimal exact (au plus `maxDec` décimales) : 12\,500 ; -3{,}25. */
export function dec(x: number, maxDec = 8): string {
  const r = Number(x.toFixed(maxDec));
  if (r === 0) return '0';
  const s = Math.abs(r).toFixed(maxDec).replace(/\.?0+$/, '');
  const [int, frac = ''] = s.split('.');
  return (r < 0 ? '-' : '') + groupDigits(int, frac);
}

/** Nombre entre parenthèses s'il est négatif : (-3). */
export function paren(x: number, maxDec = 8): string {
  return x < 0 ? `(${dec(x, maxDec)})` : dec(x, maxDec);
}

/** Arrondi à `n` décimales, sans erreur d'affichage binaire. */
export function round(x: number, n = 0): number {
  const f = 10 ** n;
  return Math.round((x + Math.sign(x) * Number.EPSILON * Math.abs(x)) * f) / f;
}

/** Écriture scientifique a × 10ⁿ avec `sig` chiffres significatifs (zéros conservés). */
export function sci(x: number, sig = 3, keepZeros = true): string {
  if (x === 0) return '0';
  const [m, e] = x.toExponential(sig - 1).split('e');
  const mant = keepZeros ? m : m.replace(/\.?0+$/, '');
  const exp = Number(e);
  return exp === 0 ? mant.replace('.', '{,}') : `${mant.replace('.', '{,}')} \\times 10^{${exp}}`;
}

/**
 * Valeur avec `n` chiffres significatifs (zéros conservés : 0{,}50), en écriture
 * scientifique au-delà de 10⁵ ou en deçà de 10⁻³.
 */
export function sig(x: number, n = 3): string {
  if (x === 0) return '0';
  const ax = Math.abs(x);
  if (ax >= 1e5 || ax < 1e-3) return sci(x, n);
  const s = x.toPrecision(n);
  if (s.includes('e')) return dec(Number(s));
  const neg = s.startsWith('-');
  const [int, frac = ''] = (neg ? s.slice(1) : s).split('.');
  return (neg ? '-' : '') + groupDigits(int, frac);
}

/** Nombre de chiffres significatifs d'une donnée écrite en décimal (convention du lycée). */
export function sigCount(value: string): number {
  const digits = value.replace(/[^0-9]/g, '').replace(/^0+/, '');
  return Math.max(1, digits.length);
}

/**
 * Décimal exact m × 10ᵉ (m entier) : sert aux conversions d'unités et à l'écriture
 * scientifique, sans aucune erreur d'arrondi binaire.
 */
export interface Decimal {
  m: number;
  e: number;
}

export function normDec(d: Decimal): Decimal {
  let { m, e } = d;
  if (m === 0) return { m: 0, e: 0 };
  while (m % 10 === 0) {
    m /= 10;
    e++;
  }
  return { m, e };
}

export function decTex(d: Decimal): string {
  const { m, e } = normDec(d);
  if (m === 0) return '0';
  const digits = String(Math.abs(m));
  let int: string;
  let frac: string;
  if (e >= 0) {
    int = digits + '0'.repeat(e);
    frac = '';
  } else if (-e < digits.length) {
    int = digits.slice(0, digits.length + e);
    frac = digits.slice(digits.length + e);
  } else {
    int = '0';
    frac = '0'.repeat(-e - digits.length) + digits;
  }
  return (m < 0 ? '-' : '') + groupDigits(int, frac);
}

/** Écriture scientifique exacte d'un décimal : 4{,}5 \times 10^{4}. */
export function decSci(d: Decimal): string {
  const { m, e } = normDec(d);
  if (m === 0) return '0';
  const digits = String(Math.abs(m));
  const n = e + digits.length - 1;
  const mant = digits.length > 1 ? `${digits[0]}{,}${digits.slice(1)}` : digits;
  return `${m < 0 ? '-' : ''}${mant} \\times 10^{${n}}`;
}

export function decValue(d: Decimal): number {
  return Number(`${d.m}e${d.e}`);
}

// ─── Fractions ─────────────────────────────────────────────────────────────

export class Frac {
  readonly n: number;
  readonly d: number;

  constructor(n: number, d = 1) {
    if (d === 0) throw new Error('Fraction de dénominateur nul');
    if (d < 0) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d) || 1;
    this.n = n / g + 0;
    this.d = d / g;
  }

  static of(x: number | Frac): Frac {
    return x instanceof Frac ? x : new Frac(x);
  }

  add(o: number | Frac): Frac {
    const b = Frac.of(o);
    return new Frac(this.n * b.d + b.n * this.d, this.d * b.d);
  }

  sub(o: number | Frac): Frac {
    return this.add(Frac.of(o).neg());
  }

  mul(o: number | Frac): Frac {
    const b = Frac.of(o);
    return new Frac(this.n * b.n, this.d * b.d);
  }

  div(o: number | Frac): Frac {
    const b = Frac.of(o);
    return new Frac(this.n * b.d, this.d * b.n);
  }

  neg(): Frac {
    return new Frac(-this.n, this.d);
  }

  get isInt(): boolean {
    return this.d === 1;
  }

  get value(): number {
    return this.n / this.d;
  }

  sign(): number {
    return Math.sign(this.n);
  }

  equals(o: number | Frac): boolean {
    const b = Frac.of(o);
    return this.n === b.n && this.d === b.d;
  }

  /** -\dfrac{3}{4} ; 5. Décimal si la fraction est un décimal simple et `decimal` est vrai. */
  tex(big = true, decimal = false): string {
    if (this.d === 1) return String(this.n);
    if (decimal && isDecimalDen(this.d)) return dec(this.value);
    const f = big ? 'dfrac' : 'frac';
    return `${this.n < 0 ? '-' : ''}\\${f}{${Math.abs(this.n)}}{${this.d}}`;
  }

  /** Opérande : entre parenthèses si négatif. */
  texParen(big = true, decimal = false): string {
    return this.n < 0 ? `\\left(${this.tex(big, decimal)}\\right)` : this.tex(big, decimal);
  }
}

function isDecimalDen(d: number): boolean {
  while (d % 2 === 0) d /= 2;
  while (d % 5 === 0) d /= 5;
  return d === 1;
}

/** Fraction non simplifiée n/d telle qu'écrite (signe devant). */
export function rawFrac(n: number, d: number, big = true): string {
  if (Math.abs(d) === 1) return String(n * d);
  const neg = n * d < 0;
  return `${neg ? '-' : ''}\\${big ? 'dfrac' : 'frac'}{${Math.abs(n)}}{${Math.abs(d)}}`;
}

// ─── Polynômes (coefficients par puissances croissantes) ───────────────────

type Coef = number | Frac;

const isZero = (c: Coef) => (c instanceof Frac ? c.n === 0 : c === 0);
const isNeg = (c: Coef) => (c instanceof Frac ? c.n < 0 : c < 0);
const absTex = (c: Coef, big: boolean) => (c instanceof Frac ? (isNeg(c) ? c.neg() : c).tex(big) : dec(Math.abs(c)));
const isOne = (c: Coef) => (c instanceof Frac ? Math.abs(c.n) === 1 && c.d === 1 : Math.abs(c) === 1);

/** Monôme sans signe : 3x^{2}, x, 5. */
function monomial(c: Coef, p: number, v: string, big: boolean): string {
  const vp = p === 0 ? '' : p === 1 ? v : `${v}^{${p}}`;
  if (p === 0) return absTex(c, big);
  return isOne(c) ? vp : `${absTex(c, big)}${vp}`;
}

/** Termes [coefficient, puissance] écrits dans l'ordre donné, sans regroupement. */
export function terms(list: [Coef, number][], v = 'x', big = false): string {
  let out = '';
  for (const [c, p] of list) {
    if (isZero(c)) continue;
    const m = monomial(c, p, v, big);
    out += out ? (isNeg(c) ? ` - ${m}` : ` + ${m}`) : isNeg(c) ? `-${m}` : m;
  }
  return out || '0';
}

/** Polynôme réduit et ordonné (puissances décroissantes) : c[i] est le coefficient de xⁱ. */
export function poly(c: Coef[], v = 'x', big = false): string {
  const list: [Coef, number][] = [];
  for (let p = c.length - 1; p >= 0; p--) list.push([c[p], p]);
  return terms(list, v, big);
}

/** ax + b. */
export function lin(a: Coef, b: Coef, v = 'x', big = false): string {
  return poly([b, a], v, big);
}

export function polyMul(a: number[], b: number[]): number[] {
  const out = new Array(a.length + b.length - 1).fill(0);
  a.forEach((x, i) => b.forEach((y, j) => (out[i + j] += x * y)));
  return out;
}

export function polyAdd(a: number[], b: number[], k = 1): number[] {
  const out = new Array(Math.max(a.length, b.length)).fill(0);
  a.forEach((x, i) => (out[i] += x));
  b.forEach((y, i) => (out[i] += k * y));
  return out;
}

/** Facteur (ax + b) entre parenthèses, ou x seul. */
export function factor(a: number, b: number, v = 'x'): string {
  return b === 0 && a === 1 ? v : `(${lin(a, b, v)})`;
}

/** Coefficient devant une parenthèse : 3( ; -( ; ( . */
export function coefBefore(k: number): string {
  return k === 1 ? '' : k === -1 ? '-' : dec(k);
}

// ─── Radicaux ──────────────────────────────────────────────────────────────

/** n = k² × m avec m sans facteur carré. */
export function sqrtParts(n: number): [number, number] {
  let k = 1;
  let m = n;
  for (let d = 2; d * d <= m; d++) {
    while (m % (d * d) === 0) {
      m /= d * d;
      k *= d;
    }
  }
  return [k, m];
}

/** √n simplifié : 2\sqrt{3}, 5 ou \sqrt{7}. */
export function sqrtTex(n: number): string {
  const [k, m] = sqrtParts(n);
  if (m === 1) return String(k);
  return `${k === 1 ? '' : k}\\sqrt{${m}}`;
}

// ─── Divers ────────────────────────────────────────────────────────────────

/** Ensemble de solutions : S = \{-5 ; \dfrac{3}{2}\}. */
export function solSet(values: string[]): string {
  if (!values.length) return 'S = \\varnothing';
  const inner = values.join(' \\,;\\, ');
  return /\\d?frac/.test(inner) ? `S = \\left\\{${inner}\\right\\}` : `S = \\{${inner}\\}`;
}

/** Enchaîne des égalités en supprimant les étapes identiques consécutives. */
export function chain(steps: string[], rel = '='): string {
  const out: string[] = [];
  for (const s of steps) if (out[out.length - 1] !== s) out.push(s);
  return out.join(` ${rel} `);
}

/** Lignes d'un corrigé (une ligne par étape). */
export function lines(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join('\n');
}

/** « = x » si la valeur arrondie à n décimales est exacte, « \approx x » sinon. */
export function eqApprox(x: number, n = 2): string {
  const r = round(x, n);
  return Math.abs(r - x) < 1e-9 * Math.max(1, Math.abs(x)) ? `= ${dec(x)}` : `\\approx ${dec(r)}`;
}

/** Unité droite : \mathrm{km/h}. */
export function unit(u: string): string {
  return u ? `\\ \\mathrm{${u}}` : '';
}
