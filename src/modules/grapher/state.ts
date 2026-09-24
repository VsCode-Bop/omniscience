/** État sérialisable de la grapheuse (lien de partage) + exemples prêts à projeter. */

export interface SliderConfig {
  min: number;
  max: number;
  step: number;
}

export interface RowState {
  id: string;
  src: string;
  /** Indice dans la palette --c1…--c8 (la couleur suit ainsi le thème). */
  color: number;
  hidden?: boolean;
  slider?: SliderConfig;
  /** Tracer la dérivée f'. */
  deriv?: boolean;
  /** Abscisse du point de tangence (absent : pas de tangente). */
  tangent?: number;
  /** Bornes de l'intégrale (absent : pas d'intégrale). */
  integral?: [number, number];
  /** Afficher les points remarquables. */
  points?: boolean;
  /** Afficher l'étude (dérivée, limites…). */
  study?: boolean;
  /** Intervalle du paramètre t ou θ. */
  range?: [number, number];
}

export interface DisplayOptions {
  grid: boolean;
  axes: boolean;
  pi: boolean;
  ortho: boolean;
  coords: boolean;
}

export interface GrapherState {
  v: 1;
  rows: RowState[];
  view: [number, number, number, number];
  opts: DisplayOptions;
}

export const PALETTE_SIZE = 8;
export const DEFAULT_VIEW: [number, number, number, number] = [-8, 8, -6, 6];
export const DEFAULT_OPTS: DisplayOptions = { grid: true, axes: true, pi: false, ortho: true, coords: false };

let counter = 0;
export function newId(): string {
  counter = (counter + 1) % 1e6;
  return `${Date.now().toString(36).slice(-4)}${counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function defaultSlider(value: number): SliderConfig {
  const span = Math.max(5, Math.ceil(Math.abs(value) * 2));
  return { min: -span, max: span, step: span > 20 ? 1 : 0.1 };
}

type RowSeed = Omit<RowState, 'id' | 'color'> & { color?: number };

function build(rows: RowSeed[], view = DEFAULT_VIEW, opts: Partial<DisplayOptions> = {}): GrapherState {
  let c = 0;
  return {
    v: 1,
    rows: rows.map((r) => {
      const isSlider = /^\s*[a-zA-Z]\w*\s*=\s*-?[\d.]+\s*$/.test(r.src) && !/^\s*[xyr]\s*=/.test(r.src);
      return { id: newId(), color: r.color ?? (isSlider ? 0 : c++ % PALETTE_SIZE), ...r };
    }),
    view,
    opts: { ...DEFAULT_OPTS, ...opts },
  };
}

export interface Example {
  title: string;
  level: string;
  make: () => GrapherState;
}

export const EXAMPLES: Example[] = [
  {
    title: 'Second degré : rôle de a, b, c',
    level: 'Première',
    make: () => build([
      { src: 'f(x) = a*x^2 + b*x + c', points: true },
      { src: 'a = 1', slider: { min: -3, max: 3, step: 0.1 } },
      { src: 'b = -2', slider: { min: -6, max: 6, step: 0.1 } },
      { src: 'c = -3', slider: { min: -6, max: 6, step: 0.1 } },
    ]),
  },
  {
    title: 'Dérivée et tangente',
    level: 'Première',
    make: () => build([{ src: 'f(x) = x^3 - 3x', deriv: true, tangent: 1.5, points: true }], [-4, 4, -4, 4]),
  },
  {
    title: 'Intégrale et aire sous la courbe',
    level: 'Terminale',
    make: () => build([{ src: 'f(x) = sin(x) + 1', integral: [0, Math.PI] }], [-1, 7, -1.5, 3], { pi: true }),
  },
  {
    title: 'Exponentielle, logarithme et symétrie',
    level: 'Terminale',
    make: () => build([{ src: 'f(x) = e^x' }, { src: 'g(x) = ln(x)', study: true }, { src: 'y = x', color: 7 }], [-5, 7, -4, 5]),
  },
  {
    title: 'Fonction rationnelle et asymptotes',
    level: 'Terminale',
    make: () => build([{ src: 'f(x) = (x^2 + 1)/(x - 1)', study: true, points: true }, { src: 'y = x + 1', color: 7 }], [-8, 10, -8, 12]),
  },
  {
    title: 'Fonctions trigonométriques',
    level: 'Première',
    make: () => build([{ src: 'f(x) = sin(x)' }, { src: 'g(x) = cos(x)' }], [-7, 7, -2, 2], { pi: true, ortho: false }),
  },
  {
    title: 'Sinusoïde : amplitude, pulsation, phase',
    level: 'Terminale (physique)',
    make: () => build([
      { src: 'u(t) = A*sin(w*t + p)' },
      { src: 'A = 2', slider: { min: 0, max: 5, step: 0.1 } },
      { src: 'w = 1', slider: { min: 0.1, max: 5, step: 0.1 } },
      { src: 'p = 0', slider: { min: -3.2, max: 3.2, step: 0.05 } },
    ], [-1, 13, -3, 3], { ortho: false }),
  },
  {
    title: 'Cardioïde (courbe polaire)',
    level: 'Supérieur',
    make: () => build([{ src: 'r = 1 + cos(θ)', range: [0, 2 * Math.PI] }], [-2, 3, -2, 2]),
  },
  {
    title: 'Rosace à k pétales (polaire)',
    level: 'Supérieur',
    make: () => build([{ src: 'r = cos(k θ)', range: [0, 2 * Math.PI] }, { src: 'k = 4', slider: { min: 1, max: 9, step: 1 } }], [-1.6, 1.6, -1.2, 1.2]),
  },
  {
    title: 'Courbe de Lissajous (paramétrique)',
    level: 'Supérieur',
    make: () => build([
      { src: '(sin(a t), cos(b t))', range: [0, 2 * Math.PI] },
      { src: 'a = 3', slider: { min: 1, max: 8, step: 1 } },
      { src: 'b = 2', slider: { min: 1, max: 8, step: 1 } },
    ], [-1.6, 1.6, -1.2, 1.2]),
  },
];

export function defaultState(): GrapherState {
  return EXAMPLES[0].make();
}

// ─── Validation des états reçus par lien (données non fiables) ──────────────

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const pair = (v: unknown): [number, number] | undefined =>
  Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]) ? [v[0], v[1]] : undefined;

export function sanitizeState(input: unknown): GrapherState | null {
  if (!input || typeof input !== 'object') return null;
  const s = input as Record<string, unknown>;
  if (!Array.isArray(s.rows)) return null;
  const view = s.view as unknown[];
  const validView = Array.isArray(view) && view.length === 4 && view.every(isNum) && view[0] < view[1] && view[2] < view[3];
  const opts = (s.opts ?? {}) as Record<string, unknown>;
  const rows: RowState[] = s.rows.slice(0, 60).flatMap((raw): RowState[] => {
    if (!raw || typeof raw !== 'object') return [];
    const r = raw as Record<string, unknown>;
    if (typeof r.src !== 'string') return [];
    const row: RowState = {
      id: typeof r.id === 'string' && /^[\w-]{1,24}$/.test(r.id) ? r.id : newId(),
      src: r.src.slice(0, 400),
      color: isNum(r.color) ? Math.abs(Math.trunc(r.color)) % PALETTE_SIZE : 0,
    };
    if (r.hidden === true) row.hidden = true;
    if (r.deriv === true) row.deriv = true;
    if (r.points === true) row.points = true;
    if (r.study === true) row.study = true;
    if (isNum(r.tangent)) row.tangent = r.tangent;
    const integral = pair(r.integral);
    if (integral) row.integral = integral;
    const range = pair(r.range);
    if (range) row.range = range;
    const sl = r.slider as Record<string, unknown> | undefined;
    if (sl && isNum(sl.min) && isNum(sl.max) && isNum(sl.step) && sl.min < sl.max && sl.step > 0) {
      row.slider = { min: sl.min, max: sl.max, step: sl.step };
    }
    return [row];
  });
  return {
    v: 1,
    rows,
    view: validView ? (view as [number, number, number, number]) : DEFAULT_VIEW,
    opts: {
      grid: opts.grid !== false,
      axes: opts.axes !== false,
      pi: opts.pi === true,
      ortho: opts.ortho !== false,
      coords: opts.coords === true,
    },
  };
}
