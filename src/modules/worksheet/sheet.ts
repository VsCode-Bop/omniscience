/**
 * Modèle d'une fiche : état sérialisable (lien de partage), validation, et génération
 * reproductible des exercices pour chaque version (A, B, C, D).
 */
import { GENERATOR_BY_ID, PRESETS, type Preset } from './library';
import { isSeed, randomSeed, Rng } from './rng';
import type { Difficulty, Exercise, Generator } from './types';

export interface ExerciseSpec {
  /** Identifiant du modèle, ou « libre ». */
  g: string;
  /** Nombre de questions. */
  n: number;
  d: Difficulty;
  /** Sel propre à l'exercice : « nouvelles valeurs » pour cet exercice seul. */
  s: number;
  /** Barème (points), facultatif. */
  p?: number;
  /** Exercice libre : titre, énoncé, corrigé. */
  title?: string;
  text?: string;
  answer?: string;
}

export interface SheetState {
  v: 1;
  title: string;
  subtitle: string;
  /** Cartouche nom / prénom / classe. */
  header: boolean;
  /** Afficher le thème de chaque exercice. */
  themes: boolean;
  seed: string;
  versions: number;
  exercises: ExerciseSpec[];
}

export interface Built {
  spec: ExerciseSpec;
  gen: Generator | null;
  title: string;
  ex: Exercise;
  error?: string;
}

export const VERSION_LETTERS = 'ABCD';
export const MAX_EXERCISES = 20;
const MAX_TEXT = 4000;

const str = (v: unknown, max: number, fallback = '') => (typeof v === 'string' ? v.slice(0, max) : fallback);
const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(max, Math.max(min, n));
};

export function newSalt(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % 1_000_000;
}

export function specFromGenerator(g: Generator, d: Difficulty = 2, n = g.count[2], p?: number): ExerciseSpec {
  return { g: g.id, n, d, s: newSalt(), ...(p ? { p } : {}) };
}

export function stateFromPreset(preset: Preset, seed = randomSeed()): SheetState {
  return {
    v: 1,
    title: preset.title,
    subtitle: preset.subtitle,
    header: true,
    themes: true,
    seed,
    versions: 1,
    exercises: preset.exercises.map((e) => specFromGenerator(GENERATOR_BY_ID.get(e.g)!, e.d, e.n, e.p)),
  };
}

export function defaultState(): SheetState {
  return stateFromPreset(PRESETS[0]);
}

/** Valide un état venant d'un lien (types, bornes, modèles connus). */
export function sanitize(raw: unknown): SheetState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const exercises: ExerciseSpec[] = [];
  for (const e of Array.isArray(r.exercises) ? r.exercises.slice(0, MAX_EXERCISES) : []) {
    if (!e || typeof e !== 'object') continue;
    const x = e as Record<string, unknown>;
    const id = str(x.g, 40);
    const p = typeof x.p === 'number' && x.p > 0 ? Math.min(100, Math.round(x.p * 4) / 4) : undefined;
    if (id === 'libre') {
      exercises.push({ g: 'libre', n: 1, d: 1, s: 0, title: str(x.title, 120), text: str(x.text, MAX_TEXT), answer: str(x.answer, MAX_TEXT), ...(p ? { p } : {}) });
      continue;
    }
    const gen = GENERATOR_BY_ID.get(id);
    if (!gen) continue;
    exercises.push({
      g: id,
      n: int(x.n, gen.count[0], gen.count[1], gen.count[2]),
      d: int(x.d, 1, 3, 2) as Difficulty,
      s: int(x.s, 0, 999_999, 0),
      ...(p ? { p } : {}),
    });
  }
  return {
    v: 1,
    title: str(r.title, 160, 'Fiche d\'exercices'),
    subtitle: str(r.subtitle, 160),
    header: typeof r.header === 'boolean' ? r.header : true,
    themes: typeof r.themes === 'boolean' ? r.themes : true,
    seed: isSeed(r.seed) ? r.seed : randomSeed(),
    versions: int(r.versions, 1, 4, 1),
    exercises,
  };
}

/** Génère les exercices d'une version (0 = A). */
export function buildVersion(state: SheetState, version: number): Built[] {
  return state.exercises.map((spec) => {
    if (spec.g === 'libre') {
      return {
        spec,
        gen: null,
        title: spec.title ?? '',
        ex: { intro: spec.text ?? '', items: [], numbering: 'none', cols: 1, answer: spec.answer ?? '' },
      };
    }
    const gen = GENERATOR_BY_ID.get(spec.g)!;
    const rng = new Rng(`${state.seed}|${version}|${spec.g}|${spec.s}|${spec.d}`);
    try {
      return { spec, gen, title: gen.title, ex: gen.generate(rng, spec.n, spec.d) };
    } catch (err) {
      return {
        spec,
        gen,
        title: gen.title,
        ex: { intro: '', items: [], numbering: 'none', cols: 1 },
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
}

/** Barème : « 3 points », « 1,5 point ». */
export function pointsText(p: number | undefined): string {
  if (!p) return '';
  const v = String(p).replace('.', ',');
  return `${v} point${p >= 2 ? 's' : ''}`;
}

export function totalPoints(state: SheetState): number {
  return state.exercises.reduce((s, e) => s + (e.p ?? 0), 0);
}
