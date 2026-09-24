/**
 * Bibliothèque des modèles d'exercices et fiches prêtes à l'emploi.
 */
import { COLLEGE } from './gen-college';
import { LYCEE } from './gen-lycee';
import { PHYSIQUE } from './gen-physique';
import type { Difficulty, Generator, Level } from './types';

export const GENERATORS: Generator[] = [...COLLEGE, ...LYCEE, ...PHYSIQUE];
export const GENERATOR_BY_ID = new Map(GENERATORS.map((g) => [g.id, g]));

export const LEVELS: Level[] = ['6e', '5e', '4e', '3e', '2de', '1re', 'Tle'];

/** Niveau en HTML : 4<sup>e</sup>, 2<sup>de</sup>, T<sup>le</sup>. */
export function levelHtml(l: Level): string {
  const m = /^(\d|T)(.+)$/.exec(l)!;
  return `${m[1]}<sup>${m[2]}</sup>`;
}

/** Plage de niveaux : « 4e – 3e ». */
export function levelsHtml(levels: Level[]): string {
  if (levels.length === 1) return levelHtml(levels[0]);
  return `${levelHtml(levels[0])}–${levelHtml(levels[levels.length - 1])}`;
}

export type LevelFilter = 'all' | 'college' | '2de' | '1re' | 'Tle';

export function matchesLevel(g: Generator, f: LevelFilter): boolean {
  if (f === 'all') return true;
  if (f === 'college') return g.levels.some((l) => ['6e', '5e', '4e', '3e'].includes(l));
  return g.levels.includes(f);
}

export interface PresetExercise {
  g: string;
  n: number;
  d: Difficulty;
  p?: number;
}

export interface Preset {
  title: string;
  subtitle: string;
  level: string;
  subject: 'maths' | 'physique';
  exercises: PresetExercise[];
}

export const PRESETS: Preset[] = [
  {
    title: 'Calcul littéral', subtitle: 'Troisième', level: '3e', subject: 'maths',
    exercises: [{ g: 'developper', n: 6, d: 2, p: 5 }, { g: 'factoriser', n: 6, d: 2, p: 5 }, { g: 'equations', n: 4, d: 2, p: 4 }, { g: 'produit-nul', n: 3, d: 1, p: 3 }],
  },
  {
    title: 'Fractions, priorités et puissances', subtitle: 'Quatrième', level: '4e', subject: 'maths',
    exercises: [{ g: 'fractions', n: 6, d: 2, p: 6 }, { g: 'priorites', n: 4, d: 2, p: 4 }, { g: 'puissances', n: 6, d: 1, p: 3 }],
  },
  {
    title: 'Triangle rectangle', subtitle: 'Troisième', level: '3e', subject: 'maths',
    exercises: [{ g: 'pythagore', n: 2, d: 2, p: 4 }, { g: 'pythagore', n: 2, d: 3, p: 4 }, { g: 'trigonometrie', n: 4, d: 2, p: 8 }],
  },
  {
    title: 'Pourcentages et statistiques', subtitle: 'Seconde', level: '2de', subject: 'maths',
    exercises: [{ g: 'pourcentages', n: 4, d: 2, p: 6 }, { g: 'statistiques', n: 5, d: 2, p: 6 }, { g: 'affine', n: 2, d: 2, p: 4 }],
  },
  {
    title: 'Vecteurs', subtitle: 'Seconde', level: '2de', subject: 'maths',
    exercises: [{ g: 'vecteurs', n: 5, d: 2, p: 10 }, { g: 'vecteurs', n: 5, d: 3, p: 10 }],
  },
  {
    title: 'Second degré', subtitle: 'Première spécialité', level: '1re', subject: 'maths',
    exercises: [{ g: 'forme-canonique', n: 3, d: 2, p: 6 }, { g: 'second-degre', n: 4, d: 2, p: 8 }, { g: 'second-degre', n: 2, d: 3, p: 6 }],
  },
  {
    title: 'Dérivation et suites', subtitle: 'Première spécialité', level: '1re', subject: 'maths',
    exercises: [{ g: 'derivees', n: 6, d: 1, p: 6 }, { g: 'derivees', n: 4, d: 2, p: 6 }, { g: 'suites', n: 3, d: 2, p: 8 }],
  },
  {
    title: 'Exponentielle, logarithme, loi binomiale', subtitle: 'Terminale spécialité', level: 'Tle', subject: 'maths',
    exercises: [{ g: 'exp-ln', n: 6, d: 2, p: 6 }, { g: 'exp-ln', n: 3, d: 3, p: 6 }, { g: 'derivees', n: 4, d: 3, p: 4 }, { g: 'binomiale', n: 5, d: 2, p: 6 }],
  },
  {
    title: 'Électricité', subtitle: 'Quatrième – Troisième', level: '4e', subject: 'physique',
    exercises: [{ g: 'loi-ohm', n: 3, d: 1, p: 6 }, { g: 'loi-ohm', n: 3, d: 2, p: 6 }, { g: 'loi-ohm', n: 3, d: 3, p: 8 }],
  },
  {
    title: 'Mouvement et énergie', subtitle: 'Troisième', level: '3e', subject: 'physique',
    exercises: [{ g: 'conversions', n: 6, d: 3, p: 3 }, { g: 'vitesse', n: 3, d: 2, p: 6 }, { g: 'poids', n: 3, d: 2, p: 5 }, { g: 'energie', n: 3, d: 2, p: 6 }],
  },
  {
    title: 'Matière et transformations', subtitle: 'Seconde', level: '2de', subject: 'physique',
    exercises: [{ g: 'equations-reaction', n: 6, d: 2, p: 6 }, { g: 'quantite-matiere', n: 3, d: 2, p: 6 }, { g: 'concentration', n: 3, d: 3, p: 8 }],
  },
  {
    title: 'Mesures et unités', subtitle: 'Cycle 4', level: '5e', subject: 'physique',
    exercises: [{ g: 'conversions', n: 9, d: 1, p: 5 }, { g: 'conversions', n: 6, d: 2, p: 5 }, { g: 'notation-scientifique', n: 6, d: 1, p: 4 }, { g: 'masse-volumique', n: 3, d: 1, p: 6 }],
  },
];
