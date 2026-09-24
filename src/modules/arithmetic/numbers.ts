/**
 * Arithmétique exacte sur les entiers (BigInt) : PGCD pas à pas, Bézout,
 * primalité (Miller-Rabin déterministe), décomposition en facteurs premiers
 * (divisions successives puis rho de Pollard), diviseurs, crible, puissances modulaires.
 */

export const abs = (a: bigint) => (a < 0n ? -a : a);

export function gcd(a: bigint, b: bigint): bigint {
  a = abs(a);
  b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function lcm(a: bigint, b: bigint): bigint {
  if (a === 0n || b === 0n) return 0n;
  return abs(a / gcd(a, b) * b);
}

/** Division euclidienne : a = b·q + r avec 0 ≤ r < |b|. */
export function divmod(a: bigint, b: bigint): [bigint, bigint] {
  let q = a / b;
  let r = a % b;
  if (r < 0n) {
    r += abs(b);
    q = b > 0n ? q - 1n : q + 1n;
  }
  return [q, r];
}

export interface EuclidStep {
  a: bigint;
  b: bigint;
  q: bigint;
  r: bigint;
}

/** Étapes de l'algorithme d'Euclide (sur les valeurs absolues). */
export function euclidSteps(a: bigint, b: bigint): EuclidStep[] {
  a = abs(a);
  b = abs(b);
  const steps: EuclidStep[] = [];
  while (b !== 0n && steps.length < 500) {
    const [q, r] = divmod(a, b);
    steps.push({ a, b, q, r });
    [a, b] = [b, r];
  }
  return steps;
}

export interface BezoutRow {
  r: bigint;
  u: bigint;
  v: bigint;
  q: bigint | null;
}

/** Algorithme d'Euclide étendu : lignes (r, u, v) avec r = a·u + b·v. */
export function extendedEuclid(a: bigint, b: bigint): { d: bigint; u: bigint; v: bigint; rows: BezoutRow[] } {
  const rows: BezoutRow[] = [{ r: a, u: 1n, v: 0n, q: null }, { r: b, u: 0n, v: 1n, q: null }];
  while (rows[rows.length - 1].r !== 0n && rows.length < 500) {
    const x = rows[rows.length - 2];
    const y = rows[rows.length - 1];
    const q = x.r / y.r;
    rows.push({ r: x.r - q * y.r, u: x.u - q * y.u, v: x.v - q * y.v, q });
  }
  const last = rows[rows.length - 2];
  const sign = last.r < 0n ? -1n : 1n;
  return { d: last.r * sign, u: last.u * sign, v: last.v * sign, rows };
}

export function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  if (mod === 1n) return 0n;
  let result = 1n;
  base = ((base % mod) + mod) % mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return result;
}

const SMALL_PRIMES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];

/** Test de Miller-Rabin, déterministe pour n < 3,3 × 10²⁴ avec ces 12 bases. */
export function isPrime(n: bigint): boolean {
  if (n < 2n) return false;
  for (const p of SMALL_PRIMES) {
    if (n === p) return true;
    if (n % p === 0n) return false;
  }
  let d = n - 1n;
  let s = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    s++;
  }
  outer: for (const a of SMALL_PRIMES) {
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    for (let i = 1; i < s; i++) {
      x = (x * x) % n;
      if (x === n - 1n) continue outer;
    }
    return false;
  }
  return true;
}

/** Rho de Pollard (variante de Brent) : un facteur non trivial de n composé. */
function pollard(n: bigint): bigint {
  if (n % 2n === 0n) return 2n;
  for (let c = 1n; c < 50n; c++) {
    let x = 2n;
    let y = 2n;
    let d = 1n;
    const f = (v: bigint) => (v * v + c) % n;
    let guard = 0;
    while (d === 1n && guard++ < 2_000_000) {
      x = f(x);
      y = f(f(y));
      d = gcd(x > y ? x - y : y - x, n);
    }
    if (d !== n && d !== 1n) return d;
  }
  return n;
}

/** Décomposition en facteurs premiers : [[p, exposant], …] triés. */
export function factorize(n: bigint): [bigint, number][] {
  n = abs(n);
  const map = new Map<bigint, number>();
  const add = (p: bigint) => map.set(p, (map.get(p) ?? 0) + 1);
  if (n < 2n) return [];
  // Petits facteurs par divisions successives (rapide et suffisant en classe).
  for (let p = 2n; p < 1000n && p * p <= n; p += p === 2n ? 1n : 2n) {
    while (n % p === 0n) {
      add(p);
      n /= p;
    }
  }
  const stack = n > 1n ? [n] : [];
  while (stack.length) {
    const m = stack.pop()!;
    if (m === 1n) continue;
    if (isPrime(m)) {
      add(m);
      continue;
    }
    const d = pollard(m);
    if (d === m) {
      add(m); // échec improbable : on conserve le facteur tel quel
      continue;
    }
    stack.push(d, m / d);
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** Liste des diviseurs positifs (à partir de la décomposition). */
export function divisors(factors: [bigint, number][], limit = 5000): bigint[] {
  let divs = [1n];
  for (const [p, e] of factors) {
    const next: bigint[] = [];
    for (const d of divs) {
      let pk = 1n;
      for (let i = 0; i <= e; i++) {
        next.push(d * pk);
        pk *= p;
      }
    }
    divs = next;
    if (divs.length > limit) break;
  }
  return divs.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function divisorCount(factors: [bigint, number][]): bigint {
  return factors.reduce((acc, [, e]) => acc * BigInt(e + 1), 1n);
}

export function divisorSum(factors: [bigint, number][]): bigint {
  return factors.reduce((acc, [p, e]) => acc * ((p ** BigInt(e + 1) - 1n) / (p - 1n)), 1n);
}

/** Crible d'Ératosthène : pour chaque entier ≤ n, le plus petit facteur premier (0 pour 0 et 1). */
export function sieve(n: number): Int32Array {
  const spf = new Int32Array(n + 1);
  for (let i = 2; i <= n; i++) {
    if (spf[i]) continue;
    for (let j = i; j <= n; j += i) if (!spf[j]) spf[j] = i;
  }
  return spf;
}

/** Lecture d'un entier saisi (espaces et séparateurs de milliers tolérés). */
export function parseBigInt(text: string): bigint | null {
  const t = text.replace(/[\s .]/g, '').replace('−', '-');
  if (!/^[-+]?\d{1,40}$/.test(t)) return null;
  return BigInt(t);
}

/** Écriture d'un entier avec espaces fines entre les milliers (à partir de 10 000). */
export function fmtBig(n: bigint): string {
  const s = abs(n).toString();
  const grouped = s.length > 4 ? s.replace(/\B(?=(\d{3})+$)/g, ' ') : s;
  return (n < 0n ? '−' : '') + grouped;
}

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
export const superscript = (n: number) => String(n).replace(/\d/g, (d) => SUP[d]);

/** « 2³ × 3² × 5 ». */
export function factorText(factors: [bigint, number][]): string {
  return factors.map(([p, e]) => `${fmtBig(p)}${e > 1 ? superscript(e) : ''}`).join(' × ');
}
