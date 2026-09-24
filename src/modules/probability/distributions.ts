/**
 * Lois de probabilité usuelles (programme de lycée et premier cycle) :
 * densités, fonctions de répartition, quantiles, espérance et variance.
 * Aucune dépendance : fonctions spéciales implémentées ici (précision ~1e-14).
 */

// ─── Fonctions spéciales ─────────────────────────────────────────────────────

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** ln Γ(x) (approximation de Lanczos, x > 0). */
export function logGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x);
  const z = x - 1;
  let a = LANCZOS[0];
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

const FACT_CACHE: number[] = [0];
/** ln(k!) exact pour les petits entiers (somme cumulée), Lanczos au-delà. */
export function logFactorial(k: number): number {
  if (k < 0) return Number.NaN;
  if (k < 1024) {
    for (let i = FACT_CACHE.length; i <= k; i++) FACT_CACHE[i] = FACT_CACHE[i - 1] + Math.log(i);
    return FACT_CACHE[k];
  }
  return logGamma(k + 1);
}

/** Coefficient binomial C(n, k) (exact tant qu'il reste un entier représentable). */
export function binomialCoefficient(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let c = 1;
  for (let i = 1; i <= k; i++) {
    c = (c * (n - k + i)) / i;
    if (!Number.isFinite(c)) return Math.round(Math.exp(logFactorial(n) - logFactorial(k) - logFactorial(n - k)));
  }
  return Math.round(c);
}

/** Φ(x) : fonction de répartition de la loi normale centrée réduite (algorithme de Hart, double précision). */
export function normalCdf(x: number): number {
  const ax = Math.abs(x);
  let c: number;
  if (ax > 37) c = 0;
  else {
    const e = Math.exp((-ax * ax) / 2);
    if (ax < 7.07106781186547) {
      let b = 3.52624965998911e-2 * ax + 0.700383064443688;
      b = b * ax + 6.37396220353165;
      b = b * ax + 33.912866078383;
      b = b * ax + 112.079291497871;
      b = b * ax + 221.213596169931;
      b = b * ax + 220.206867912376;
      c = e * b;
      b = 8.83883476483184e-2 * ax + 1.75566716318264;
      b = b * ax + 16.064177579207;
      b = b * ax + 86.7807322029461;
      b = b * ax + 296.564248779674;
      b = b * ax + 637.333633378831;
      b = b * ax + 793.826512519948;
      b = b * ax + 440.413735824752;
      c /= b;
    } else {
      let b = ax + 0.65;
      b = ax + 4 / b;
      b = ax + 3 / b;
      b = ax + 2 / b;
      b = ax + 1 / b;
      c = e / b / 2.506628274631;
    }
  }
  return x > 0 ? 1 - c : c;
}

/** Φ⁻¹(p) : algorithme d'Acklam affiné par une itération de Halley. */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  let x: number;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - low) {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const e = normalCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

// ─── Lois ────────────────────────────────────────────────────────────────────

export type LawId = 'binomial' | 'geometric' | 'poisson' | 'uniformDiscrete' | 'hypergeometric' | 'normal' | 'uniform' | 'exponential';

export interface ParamSpec {
  key: string;
  label: string;
  /** Notation mathématique (HTML). */
  symbol: string;
  min: number;
  max: number;
  step: number;
  integer?: boolean;
}

export interface Law {
  discrete: boolean;
  /** Densité (continue) ou P(X = k) (discrète). */
  pdf(x: number): number;
  /** P(X ≤ x). */
  cdf(x: number): number;
  mean: number;
  variance: number;
  /** Intervalle où se concentre l'essentiel de la masse (tracé). */
  range: [number, number];
  /** Plus petit x (entier si discrète) tel que P(X ≤ x) ≥ p. */
  quantile(p: number): number;
}

export interface LawSpec {
  id: LawId;
  name: string;
  /** Notation : B(n ; p)… (HTML). */
  notation: (p: Record<string, number>) => string;
  discrete: boolean;
  params: ParamSpec[];
  defaults: Record<string, number>;
  /** Formule de P(X = k) ou de la densité (LaTeX). */
  formula: string;
  make(p: Record<string, number>): Law;
}

/** Quantile d'une loi discrète par recherche sur le support. */
function discreteQuantile(cdf: (k: number) => number, lo: number, hi: number, p: number): number {
  if (p <= 0) return lo;
  // Recherche dichotomique du plus petit k tel que F(k) ≥ p (tolérance d'arrondi).
  let a = lo;
  let b = hi;
  if (cdf(b) < p - 1e-12) return b;
  while (a < b) {
    const m = Math.floor((a + b) / 2);
    if (cdf(m) >= p - 1e-12) b = m;
    else a = m + 1;
  }
  return a;
}

/** Fonction de répartition d'une loi discrète à support fini, par cumul (mise en cache). */
function cumulative(pmf: (k: number) => number, lo: number, hi: number): (x: number) => number {
  const acc: number[] = [];
  let s = 0;
  for (let k = lo; k <= hi; k++) {
    s += pmf(k);
    acc.push(s);
  }
  return (x: number) => {
    if (x < lo) return 0;
    if (x >= hi) return 1;
    return Math.min(1, acc[Math.floor(x) - lo]);
  };
}

function binomial(n: number, p: number): Law {
  const logp = Math.log(p);
  const logq = Math.log1p(-p);
  const pmf = (k: number) => {
    if (!Number.isInteger(k) || k < 0 || k > n) return 0;
    if (p === 0) return k === 0 ? 1 : 0;
    if (p === 1) return k === n ? 1 : 0;
    return Math.exp(logFactorial(n) - logFactorial(k) - logFactorial(n - k) + k * logp + (n - k) * logq);
  };
  const cdf = cumulative(pmf, 0, n);
  const mean = n * p;
  const sd = Math.sqrt(n * p * (1 - p));
  return {
    discrete: true, pdf: pmf, cdf, mean, variance: n * p * (1 - p),
    range: [Math.max(0, Math.floor(mean - 5.5 * sd - 1)), Math.min(n, Math.ceil(mean + 5.5 * sd + 1))],
    quantile: (q) => discreteQuantile(cdf, 0, n, q),
  };
}

function geometric(p: number): Law {
  const pmf = (k: number) => (Number.isInteger(k) && k >= 1 ? (1 - p) ** (k - 1) * p : 0);
  const cdf = (x: number) => (x < 1 ? 0 : 1 - (1 - p) ** Math.floor(x));
  const hi = p >= 1 ? 1 : Math.max(5, Math.ceil(Math.log(1e-4) / Math.log(1 - p)));
  return {
    discrete: true, pdf: pmf, cdf, mean: 1 / p, variance: (1 - p) / (p * p),
    range: [1, Math.min(hi, 400)],
    quantile: (q) => (q <= 0 ? 1 : p >= 1 ? 1 : Math.max(1, Math.ceil(Math.log(1 - q) / Math.log(1 - p) - 1e-9))),
  };
}

function poisson(lambda: number): Law {
  const pmf = (k: number) => (Number.isInteger(k) && k >= 0 ? Math.exp(k * Math.log(lambda) - lambda - logFactorial(k)) : 0);
  const hi = Math.ceil(lambda + 10 * Math.sqrt(lambda) + 10);
  const cdf = cumulative(pmf, 0, hi);
  const sd = Math.sqrt(lambda);
  return {
    discrete: true, pdf: pmf, cdf, mean: lambda, variance: lambda,
    range: [Math.max(0, Math.floor(lambda - 5.5 * sd - 1)), Math.ceil(lambda + 5.5 * sd + 2)],
    quantile: (q) => discreteQuantile(cdf, 0, hi, q),
  };
}

function uniformDiscrete(a: number, b: number): Law {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const n = hi - lo + 1;
  const pmf = (k: number) => (Number.isInteger(k) && k >= lo && k <= hi ? 1 / n : 0);
  const cdf = (x: number) => (x < lo ? 0 : x >= hi ? 1 : (Math.floor(x) - lo + 1) / n);
  return {
    discrete: true, pdf: pmf, cdf, mean: (lo + hi) / 2, variance: (n * n - 1) / 12,
    range: [lo, hi],
    quantile: (q) => discreteQuantile(cdf, lo, hi, q),
  };
}

function hypergeometric(N: number, K: number, n: number): Law {
  K = Math.min(K, N);
  n = Math.min(n, N);
  const lo = Math.max(0, n - (N - K));
  const hi = Math.min(n, K);
  const logC = (a: number, b: number) => logFactorial(a) - logFactorial(b) - logFactorial(a - b);
  const pmf = (k: number) => (Number.isInteger(k) && k >= lo && k <= hi ? Math.exp(logC(K, k) + logC(N - K, n - k) - logC(N, n)) : 0);
  const cdf = cumulative(pmf, lo, hi);
  const mean = (n * K) / N;
  return {
    discrete: true, pdf: pmf, cdf, mean, variance: N > 1 ? (mean * (N - K) * (N - n)) / (N * (N - 1)) : 0,
    range: [lo, hi],
    quantile: (q) => discreteQuantile(cdf, lo, hi, q),
  };
}

function normal(mu: number, sigma: number): Law {
  return {
    discrete: false,
    pdf: (x) => Math.exp(-(((x - mu) / sigma) ** 2) / 2) / (sigma * Math.sqrt(2 * Math.PI)),
    cdf: (x) => normalCdf((x - mu) / sigma),
    mean: mu, variance: sigma * sigma,
    range: [mu - 4.2 * sigma, mu + 4.2 * sigma],
    quantile: (q) => mu + sigma * normalQuantile(q),
  };
}

function uniform(a: number, b: number): Law {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const w = hi - lo || 1e-12;
  const pad = w * 0.25;
  return {
    discrete: false,
    pdf: (x) => (x >= lo && x <= hi ? 1 / w : 0),
    cdf: (x) => (x <= lo ? 0 : x >= hi ? 1 : (x - lo) / w),
    mean: (lo + hi) / 2, variance: (w * w) / 12,
    range: [lo - pad, hi + pad],
    quantile: (q) => lo + Math.min(1, Math.max(0, q)) * w,
  };
}

function exponential(lambda: number): Law {
  return {
    discrete: false,
    pdf: (x) => (x < 0 ? 0 : lambda * Math.exp(-lambda * x)),
    cdf: (x) => (x <= 0 ? 0 : -Math.expm1(-lambda * x)),
    mean: 1 / lambda, variance: 1 / (lambda * lambda),
    range: [-0.3 / lambda, 6 / lambda],
    quantile: (q) => (q <= 0 ? 0 : q >= 1 ? Infinity : -Math.log1p(-q) / lambda),
  };
}

const num = (v: number) => String(Number(v.toPrecision(6))).replace('.', ',');

export const LAWS: LawSpec[] = [
  {
    id: 'binomial', name: 'Binomiale', discrete: true,
    notation: (p) => `ℬ(${num(p.n)} ; ${num(p.p)})`,
    params: [
      { key: 'n', label: 'Nombre d\'épreuves', symbol: '<i>n</i>', min: 1, max: 200, step: 1, integer: true },
      { key: 'p', label: 'Probabilité de succès', symbol: '<i>p</i>', min: 0, max: 1, step: 0.01 },
    ],
    defaults: { n: 20, p: 0.3 },
    formula: 'P(X=k)=\\binom{n}{k}\\,p^{k}(1-p)^{n-k}',
    make: (p) => binomial(Math.round(p.n), p.p),
  },
  {
    id: 'geometric', name: 'Géométrique', discrete: true,
    notation: (p) => `𝒢(${num(p.p)})`,
    params: [{ key: 'p', label: 'Probabilité de succès', symbol: '<i>p</i>', min: 0.01, max: 1, step: 0.01 }],
    defaults: { p: 0.2 },
    formula: 'P(X=k)=(1-p)^{k-1}\\,p\\quad(k\\geq 1)',
    make: (p) => geometric(p.p),
  },
  {
    id: 'poisson', name: 'Poisson', discrete: true,
    notation: (p) => `𝒫(${num(p.lambda)})`,
    params: [{ key: 'lambda', label: 'Paramètre', symbol: '<i>λ</i>', min: 0.1, max: 50, step: 0.1 }],
    defaults: { lambda: 4 },
    formula: 'P(X=k)=\\mathrm{e}^{-\\lambda}\\,\\frac{\\lambda^{k}}{k!}',
    make: (p) => poisson(p.lambda),
  },
  {
    id: 'uniformDiscrete', name: 'Uniforme discrète', discrete: true,
    notation: (p) => `𝒰(⟦${num(p.a)} ; ${num(p.b)}⟧)`,
    params: [
      { key: 'a', label: 'Plus petite valeur', symbol: '<i>a</i>', min: -20, max: 50, step: 1, integer: true },
      { key: 'b', label: 'Plus grande valeur', symbol: '<i>b</i>', min: -20, max: 50, step: 1, integer: true },
    ],
    defaults: { a: 1, b: 6 },
    formula: 'P(X=k)=\\frac{1}{b-a+1}',
    make: (p) => uniformDiscrete(Math.round(p.a), Math.round(p.b)),
  },
  {
    id: 'hypergeometric', name: 'Hypergéométrique', discrete: true,
    notation: (p) => `ℋ(${num(p.N)} ; ${num(p.K)} ; ${num(p.n)})`,
    params: [
      { key: 'N', label: 'Taille de la population', symbol: '<i>N</i>', min: 1, max: 200, step: 1, integer: true },
      { key: 'K', label: 'Individus « succès »', symbol: '<i>K</i>', min: 0, max: 200, step: 1, integer: true },
      { key: 'n', label: 'Taille du tirage (sans remise)', symbol: '<i>n</i>', min: 1, max: 200, step: 1, integer: true },
    ],
    defaults: { N: 50, K: 20, n: 10 },
    formula: 'P(X=k)=\\frac{\\binom{K}{k}\\binom{N-K}{n-k}}{\\binom{N}{n}}',
    make: (p) => hypergeometric(Math.round(p.N), Math.round(p.K), Math.round(p.n)),
  },
  {
    id: 'normal', name: 'Normale', discrete: false,
    notation: (p) => `𝒩(${num(p.mu)} ; ${num(p.sigma)}²)`,
    params: [
      { key: 'mu', label: 'Espérance', symbol: '<i>μ</i>', min: -50, max: 50, step: 0.1 },
      { key: 'sigma', label: 'Écart-type', symbol: '<i>σ</i>', min: 0.1, max: 20, step: 0.1 },
    ],
    defaults: { mu: 0, sigma: 1 },
    formula: 'f(x)=\\frac{1}{\\sigma\\sqrt{2\\pi}}\\,\\mathrm{e}^{-\\frac{1}{2}\\left(\\frac{x-\\mu}{\\sigma}\\right)^{2}}',
    make: (p) => normal(p.mu, p.sigma),
  },
  {
    id: 'uniform', name: 'Uniforme continue', discrete: false,
    notation: (p) => `𝒰([${num(p.a)} ; ${num(p.b)}])`,
    params: [
      { key: 'a', label: 'Borne inférieure', symbol: '<i>a</i>', min: -20, max: 50, step: 0.1 },
      { key: 'b', label: 'Borne supérieure', symbol: '<i>b</i>', min: -20, max: 50, step: 0.1 },
    ],
    defaults: { a: 0, b: 1 },
    formula: 'f(x)=\\frac{1}{b-a}\\quad\\text{sur }[a\\,;b]',
    make: (p) => uniform(p.a, p.b),
  },
  {
    id: 'exponential', name: 'Exponentielle', discrete: false,
    notation: (p) => `ℰ(${num(p.lambda)})`,
    params: [{ key: 'lambda', label: 'Paramètre', symbol: '<i>λ</i>', min: 0.05, max: 10, step: 0.05 }],
    defaults: { lambda: 0.5 },
    formula: 'f(x)=\\lambda\\,\\mathrm{e}^{-\\lambda x}\\quad(x\\geq 0)',
    make: (p) => exponential(p.lambda),
  },
];

export function lawSpec(id: LawId): LawSpec {
  return LAWS.find((l) => l.id === id) ?? LAWS[0];
}

// ─── Calculs de probabilités ─────────────────────────────────────────────────

export type Query =
  | { kind: 'eq'; k: number }
  | { kind: 'le'; b: number }
  | { kind: 'ge'; a: number }
  | { kind: 'between'; a: number; b: number }
  | { kind: 'quantile'; alpha: number }
  | { kind: 'interval'; level: number };

export interface QueryResult {
  /** Probabilité calculée (ou niveau atteint pour un intervalle). */
  value: number;
  /** Intervalle mis en évidence sur le graphique. */
  lo: number;
  hi: number;
  /** Quantile ou bornes calculées (requêtes inverses). */
  bounds?: [number, number];
}

/** P(X < x) pour une loi discrète (sur les entiers). */
const below = (law: Law, x: number) => (law.discrete ? law.cdf(Math.ceil(x) - 1) : law.cdf(x));

export function evaluate(law: Law, q: Query): QueryResult {
  switch (q.kind) {
    case 'eq':
      return { value: law.discrete ? law.pdf(q.k) : 0, lo: q.k, hi: q.k };
    case 'le':
      return { value: law.cdf(q.b), lo: -Infinity, hi: q.b };
    case 'ge':
      return { value: 1 - below(law, q.a), lo: q.a, hi: Infinity };
    case 'between': {
      const a = Math.min(q.a, q.b);
      const b = Math.max(q.a, q.b);
      return { value: Math.max(0, law.cdf(b) - below(law, a)), lo: a, hi: b };
    }
    case 'quantile': {
      const x = law.quantile(q.alpha);
      return { value: law.cdf(x), lo: -Infinity, hi: x, bounds: [x, x] };
    }
    case 'interval': {
      // Intervalle « centré » : a le plus petit tel que P(X ≤ a) > α/2 (discret), b tel que P(X ≤ b) ≥ 1 − α/2.
      const alpha = 1 - q.level;
      const a = law.discrete ? law.quantile(alpha / 2 + 1e-12) : law.quantile(alpha / 2);
      const b = law.quantile(1 - alpha / 2);
      return { value: Math.max(0, law.cdf(b) - below(law, a)), lo: a, hi: b, bounds: [a, b] };
    }
  }
}
