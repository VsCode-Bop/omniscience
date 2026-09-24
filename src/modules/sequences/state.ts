/**
 * État sérialisable du module « Suites » (lien de partage) et exemples prêts à projeter.
 */
import { SEQ_NAMES, type SeqDef, type SeqName, type ThresholdOp } from './model';

export interface ParamState {
  value: number;
  min: number;
  max: number;
  step: number;
}

export interface SequencesState {
  v: 1;
  seqs: SeqDef[];
  params: Record<string, ParamState>;
  /** Indice du dernier terme calculé. */
  N: number;
  view: 'points' | 'cobweb';
  cobweb: SeqName;
  /** Fenêtre fixée par l'utilisateur, ou null (cadrage automatique). */
  window: [number, number, number, number] | null;
  opts: { grid: boolean; join: boolean; limit: boolean; sums: boolean; table: boolean };
  threshold: { name: SeqName; op: ThresholdOp; value: string };
}

export const MAX_N = 500;

export function defaultParam(value = 1): ParamState {
  const span = Math.max(5, Math.ceil(Math.abs(value) * 2));
  return { value, min: Math.min(-span, value), max: Math.max(span, value), step: 0.01 };
}

const seq = (name: SeqName, kind: SeqDef['kind'], expr: string, init: string[] = [], n0 = 0, color = SEQ_NAMES.indexOf(name)): SeqDef => ({
  name, kind, expr, n0, init, color,
});

function base(seqs: SeqDef[], extra: Partial<SequencesState> = {}): SequencesState {
  return {
    v: 1,
    seqs,
    params: {},
    N: 20,
    view: 'points',
    cobweb: seqs.find((s) => s.kind === 'recursive')?.name ?? 'u',
    window: null,
    opts: { grid: true, join: false, limit: true, sums: false, table: true },
    threshold: { name: seqs[0]?.name ?? 'u', op: '>', value: '100' },
    ...extra,
  };
}

export function defaultState(): SequencesState {
  return base([seq('u', 'recursive', '0,5u + 3', ['1'])], { view: 'cobweb', N: 15, threshold: { name: 'u', op: '>', value: '5,9' } });
}

export interface SequenceExample {
  title: string;
  level: string;
  hint: string;
  make: () => SequencesState;
}

export const EXAMPLES: SequenceExample[] = [
  {
    title: 'Suite arithmétique',
    level: 'Première',
    hint: 'Les points sont alignés : l\'écart entre deux termes consécutifs est constant (raison r = 2).',
    make: () => base([seq('u', 'explicit', '3 + 2n')], { N: 15, opts: { grid: true, join: true, limit: true, sums: true, table: true } }),
  },
  {
    title: 'Suite géométrique',
    level: 'Première',
    hint: 'Chaque terme est obtenu en multipliant le précédent par q = 0,8 : la suite décroît vers 0.',
    make: () => base([seq('u', 'recursive', '0,8u', ['10'])], { N: 25, threshold: { name: 'u', op: '<', value: '1' } }),
  },
  {
    title: 'Arithmético-géométrique et suite auxiliaire',
    level: 'Terminale',
    hint: 'uₙ₊₁ = 0,5uₙ + 3 : la suite auxiliaire vₙ = uₙ − 6 est géométrique de raison 0,5, donc uₙ → 6.',
    make: () => base([seq('u', 'recursive', '0,5u + 3', ['1']), seq('v', 'explicit', 'u(n) - 6')], { N: 15 }),
  },
  {
    title: 'Toile d\'araignée : spirale vers le nombre d\'or',
    level: 'Terminale',
    hint: 'g est décroissante : les termes encadrent alternativement la limite φ ≈ 1,618, la toile forme une spirale.',
    make: () => base([seq('u', 'recursive', '1 + 1/u', ['1'])], { view: 'cobweb', N: 12 }),
  },
  {
    title: 'Suite logistique (paramètre a)',
    level: 'Supérieur',
    hint: 'Faites varier a : convergence (a < 3), cycle de période 2 (a ≈ 3,2), puis chaos (a > 3,57).',
    make: () => ({
      ...base([seq('u', 'recursive', 'a·u(1 − u)', ['0,2'])], { view: 'cobweb', N: 60 }),
      params: { a: { value: 3.2, min: 0, max: 4, step: 0.01 } },
    }),
  },
  {
    title: 'Suite de Fibonacci',
    level: 'Terminale',
    hint: 'Récurrence d\'ordre 2. Le quotient vₙ = uₙ₊₁ / uₙ converge vers le nombre d\'or φ = (1 + √5)/2.',
    make: () => base([{ ...seq('u', 'recursive', 'u(n) + u(n-1)', ['1', '1']), hidden: true }, seq('v', 'explicit', 'u(n+1) / u(n)')], { N: 15, threshold: { name: 'u', op: '>', value: '1000' } }),
  },
  {
    title: 'Méthode de Héron (√2)',
    level: 'Terminale',
    hint: 'Convergence très rapide : le nombre de décimales exactes double à chaque étape.',
    make: () => base([seq('u', 'recursive', '(u + 2/u) / 2', ['1'])], { view: 'cobweb', N: 6 }),
  },
  {
    title: 'Conjecture de Syracuse',
    level: 'Culture',
    hint: 'Pair : on divise par 2 ; impair : 3u + 1. Partant de 27, la suite finit par boucler sur 4, 2, 1.',
    make: () => base([seq('u', 'recursive', 'u mod 2 == 0 ? u/2 : 3u + 1', ['27'])], { N: 120, opts: { grid: true, join: true, limit: false, sums: false, table: true } }),
  },
  {
    title: 'Placement à intérêts composés',
    level: 'Première',
    hint: 'Capital placé à 3 % par an avec 100 € de versement annuel : algorithme de seuil pour dépasser 5 000 €.',
    make: () => base([seq('u', 'recursive', '1,03u + 100', ['1000'])], { N: 30, threshold: { name: 'u', op: '>', value: '5000' } }),
  },
  {
    title: 'Série harmonique',
    level: 'Supérieur',
    hint: 'Les termes ajoutés tendent vers 0 et pourtant la somme diverge (comme ln n), très lentement.',
    make: () => base([seq('u', 'recursive', 'u + 1/(n+1)', ['1'], 1)], { N: 200, threshold: { name: 'u', op: '>', value: '5' } }),
  },
];

// ─── Validation d'un état reçu par lien ──────────────────────────────────────

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string' && x.length < 300;

export function sanitizeState(raw: unknown): SequencesState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<SequencesState>;
  if (r.v !== 1 || !Array.isArray(r.seqs)) return null;
  const seqs: SeqDef[] = [];
  for (const s of r.seqs.slice(0, 3)) {
    if (!s || !SEQ_NAMES.includes(s.name) || seqs.some((x) => x.name === s.name)) continue;
    seqs.push({
      name: s.name,
      kind: s.kind === 'explicit' ? 'explicit' : 'recursive',
      expr: isStr(s.expr) ? s.expr : '',
      n0: isNum(s.n0) ? Math.max(0, Math.min(10, Math.round(s.n0))) : 0,
      init: Array.isArray(s.init) ? s.init.filter(isStr).slice(0, 2) : [],
      color: isNum(s.color) ? Math.max(0, Math.min(7, Math.round(s.color))) : 0,
      ...(s.hidden === true ? { hidden: true } : {}),
    });
  }
  if (!seqs.length) return null;
  const params: Record<string, ParamState> = {};
  if (r.params && typeof r.params === 'object') {
    for (const [name, p] of Object.entries(r.params).slice(0, 12)) {
      if (!/^[a-zA-Z]\w{0,7}$/.test(name) || !p || !isNum(p.value)) continue;
      const min = isNum(p.min) ? p.min : -5;
      const max = isNum(p.max) && p.max > min ? p.max : min + 10;
      params[name] = { value: p.value, min, max, step: isNum(p.step) && p.step > 0 ? p.step : 0.01 };
    }
  }
  const o = (r.opts ?? {}) as Partial<SequencesState['opts']>;
  const t = (r.threshold ?? {}) as Partial<SequencesState['threshold']>;
  const w = r.window;
  return {
    v: 1,
    seqs,
    params,
    N: isNum(r.N) ? Math.max(1, Math.min(MAX_N, Math.round(r.N))) : 20,
    view: r.view === 'cobweb' ? 'cobweb' : 'points',
    cobweb: SEQ_NAMES.includes(r.cobweb as SeqName) ? (r.cobweb as SeqName) : seqs[0].name,
    window: Array.isArray(w) && w.length === 4 && w.every(isNum) && w[1] > w[0] && w[3] > w[2] ? (w as SequencesState['window']) : null,
    opts: {
      grid: o.grid !== false,
      join: o.join === true,
      limit: o.limit !== false,
      sums: o.sums === true,
      table: o.table !== false,
    },
    threshold: {
      name: SEQ_NAMES.includes(t.name as SeqName) ? (t.name as SeqName) : seqs[0].name,
      op: (['>', '>=', '<', '<='] as const).includes(t.op as ThresholdOp) ? (t.op as ThresholdOp) : '>',
      value: isStr(t.value) ? t.value : '100',
    },
  };
}
