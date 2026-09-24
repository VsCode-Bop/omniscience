/**
 * Statistiques descriptives (conventions du lycée français) et simulation d'expériences.
 *
 * Quartiles : Q₁ est la plus petite valeur de la série telle qu'au moins 25 % des
 * valeurs lui soient inférieures ou égales (idem Q₃ avec 75 %). Médiane : valeur
 * centrale, ou moyenne des deux valeurs centrales. Variance : 1/N Σ nᵢ(xᵢ − x̄)².
 */

export interface Series {
  /** Valeurs distinctes triées. */
  values: number[];
  /** Effectifs correspondants. */
  counts: number[];
}

export interface Summary {
  n: number;
  mean: number;
  median: number;
  q1: number;
  q3: number;
  d1: number;
  d9: number;
  min: number;
  max: number;
  variance: number;
  sd: number;
  /** Valeur(s) de plus grand effectif. */
  modes: number[];
}

/**
 * Lecture d'une saisie : valeurs séparées par des espaces, des retours à la ligne ou des
 * points-virgules (virgule décimale acceptée), ou lignes « valeur ; effectif » (tabulations
 * d'un tableur acceptées).
 */
export function parseSeries(text: string): { series: Series; errors: number } {
  const map = new Map<number, number>();
  let errors = 0;
  const num = (s: string) => Number(s.trim().replace(/\s/g, '').replace(',', '.').replace('−', '-'));
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const pairs = lines.length > 1 && lines.every((l) => /^[-−+]?[\d.,]+\s*[;\t|]\s*[\d.,]+$/.test(l));
  const add = (v: number, c: number) => {
    if (!Number.isFinite(v) || !Number.isFinite(c) || c < 0) {
      errors++;
      return;
    }
    if (c > 0) map.set(v, (map.get(v) ?? 0) + c);
  };
  if (pairs) {
    for (const l of lines) {
      const [v, c] = l.split(/[;\t|]/);
      add(num(v), num(c));
    }
  } else {
    for (const tok of text.split(/[\s;]+/).filter(Boolean)) add(num(tok), 1);
  }
  const values = [...map.keys()].sort((a, b) => a - b);
  return { series: { values, counts: values.map((v) => map.get(v)!) }, errors };
}

/** Valeur de rang r (1 ≤ r ≤ N) dans la série ordonnée. */
function valueAtRank(s: Series, r: number): number {
  let acc = 0;
  for (let i = 0; i < s.values.length; i++) {
    acc += s.counts[i];
    if (acc >= r) return s.values[i];
  }
  return s.values[s.values.length - 1];
}

export function summarize(s: Series): Summary | null {
  const n = s.counts.reduce((a, b) => a + b, 0);
  if (!n) return null;
  let sum = 0;
  for (let i = 0; i < s.values.length; i++) sum += s.values[i] * s.counts[i];
  const mean = sum / n;
  let sq = 0;
  for (let i = 0; i < s.values.length; i++) sq += s.counts[i] * (s.values[i] - mean) ** 2;
  const variance = sq / n;
  const median = n % 2 ? valueAtRank(s, (n + 1) / 2) : (valueAtRank(s, n / 2) + valueAtRank(s, n / 2 + 1)) / 2;
  const maxCount = Math.max(...s.counts);
  return {
    n,
    mean,
    median,
    q1: valueAtRank(s, Math.ceil(n / 4)),
    q3: valueAtRank(s, Math.ceil((3 * n) / 4)),
    d1: valueAtRank(s, Math.ceil(n / 10)),
    d9: valueAtRank(s, Math.ceil((9 * n) / 10)),
    min: s.values[0],
    max: s.values[s.values.length - 1],
    variance,
    sd: Math.sqrt(variance),
    modes: maxCount > 1 || s.values.length === 1 ? s.values.filter((_, i) => s.counts[i] === maxCount).slice(0, 4) : [],
  };
}

/** Classes de même amplitude pour un histogramme (règle de Sturges par défaut). */
export function histogram(s: Series, classes?: number, start?: number, width?: number): { edges: number[]; counts: number[] } {
  const n = s.counts.reduce((a, b) => a + b, 0);
  const min = s.values[0];
  const max = s.values[s.values.length - 1];
  const k = Math.max(1, Math.min(60, classes ?? Math.ceil(Math.log2(Math.max(1, n)) + 1)));
  const w = width ?? niceWidth((max - min) / k || 1);
  const x0 = start ?? Math.floor(min / w) * w;
  // Classes [eᵢ ; eᵢ₊₁[ : le maximum doit tomber dans la dernière.
  const count = Math.max(1, Math.floor((max - x0) / w + 1e-9) + 1);
  const edges = Array.from({ length: count + 1 }, (_, i) => x0 + i * w);
  const counts = new Array(count).fill(0);
  for (let i = 0; i < s.values.length; i++) {
    const j = Math.min(count - 1, Math.max(0, Math.floor((s.values[i] - x0) / w + 1e-9)));
    counts[j] += s.counts[i];
  }
  return { edges, counts };
}

function niceWidth(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

// ─── Séries doubles ──────────────────────────────────────────────────────────

export interface Regression {
  n: number;
  meanX: number;
  meanY: number;
  /** y = a·x + b (moindres carrés). */
  a: number;
  b: number;
  /** Coefficient de corrélation linéaire. */
  r: number;
  covariance: number;
}

export function parsePairs(text: string): { xs: number[]; ys: number[]; errors: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  let errors = 0;
  const num = (s: string) => Number(s.trim().replace(',', '.').replace('−', '-'));
  for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const parts = line.split(/\s*[;\t|]\s*|\s+/).filter(Boolean);
    if (parts.length !== 2) {
      errors++;
      continue;
    }
    const [x, y] = parts.map(num);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      xs.push(x);
      ys.push(y);
    } else errors++;
  }
  return { xs, ys, errors };
}

export function linearRegression(xs: number[], ys: number[]): Regression | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
  }
  const meanX = sx / n;
  const meanY = sy / n;
  let vx = 0;
  let vy = 0;
  let cov = 0;
  for (let i = 0; i < n; i++) {
    vx += (xs[i] - meanX) ** 2;
    vy += (ys[i] - meanY) ** 2;
    cov += (xs[i] - meanX) * (ys[i] - meanY);
  }
  if (vx === 0) return null;
  const a = cov / vx;
  return { n, meanX, meanY, a, b: meanY - a * meanX, r: vy === 0 ? 0 : cov / Math.sqrt(vx * vy), covariance: cov / n };
}

// ─── Hasard ──────────────────────────────────────────────────────────────────

/** Générateur pseudo-aléatoire rapide (xoshiro128**), graine aléatoire par défaut. */
export class Random {
  private s: Uint32Array<ArrayBuffer>;

  constructor(seed?: number) {
    this.s = new Uint32Array(4);
    if (seed === undefined) crypto.getRandomValues(this.s);
    else {
      // SplitMix32 pour initialiser l'état à partir d'une graine.
      let x = seed >>> 0;
      for (let i = 0; i < 4; i++) {
        x = (x + 0x9e3779b9) >>> 0;
        let z = x;
        z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
        z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
        this.s[i] = (z ^ (z >>> 16)) >>> 0;
      }
    }
    if (!this.s.some((v) => v !== 0)) this.s[0] = 1;
  }

  /** Nombre réel uniforme dans [0 ; 1[. */
  next(): number {
    const s = this.s;
    const result = Math.imul(rotl(Math.imul(s[1], 5), 7), 9) >>> 0;
    const t = s[1] << 9;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = rotl(s[3], 11);
    return result / 4294967296;
  }

  /** Issue tirée selon des probabilités (cumulées) données. */
  pick(cumulative: number[]): number {
    const u = this.next() * cumulative[cumulative.length - 1];
    let i = 0;
    while (i < cumulative.length - 1 && u >= cumulative[i]) i++;
    return i;
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}
