import type { Rng } from './rng';

/**
 * Contenu d'un exercice, indépendant du format de sortie. Les textes sont « riches » :
 * du texte ordinaire avec des formules entre $…$ (LaTeX), « \n » pour un retour à la
 * ligne et « \n\n » pour un nouveau paragraphe.
 */

export interface Figure {
  /** SVG autonome (aperçu, impression, Markdown). */
  svg: string;
  /** Même figure en TikZ (export LaTeX). */
  tikz: string;
}

export interface Item {
  /** Question (texte riche). */
  q: string;
  /** Réponse rédigée (texte riche). */
  a: string;
  fig?: Figure;
}

export interface Exercise {
  /** Consigne ou mise en situation (texte riche). */
  intro: string;
  /** Tableau de données : première ligne = en-têtes (textes riches). */
  table?: string[][];
  fig?: Figure;
  items: Item[];
  /** a), b)… pour des calculs indépendants ; 1., 2.… pour les questions d'un problème. */
  numbering: 'alpha' | 'num' | 'none';
  /** Nombre de colonnes pour les questions courtes. */
  cols: 1 | 2 | 3;
  /** Corrigé global (exercice rédigé librement). */
  answer?: string;
}

export type Level = '6e' | '5e' | '4e' | '3e' | '2de' | '1re' | 'Tle';
export type Subject = 'maths' | 'physique';
export type Difficulty = 1 | 2 | 3;

export interface Generator {
  id: string;
  title: string;
  subject: Subject;
  theme: string;
  levels: Level[];
  /** Description courte (bibliothèque). */
  desc: string;
  /** Nombre de questions : minimum, maximum, valeur par défaut. */
  count: [number, number, number];
  /** Libellé du nombre de questions (« calculs », « questions »…). */
  countLabel?: string;
  generate(rng: Rng, n: number, d: Difficulty): Exercise;
}

/**
 * Dans un corrigé, rappeler la question si elle est courte et que la réponse ne la
 * reprend pas déjà (« f(x) = … » avant « f′(x) = … », l'équation avant sa résolution).
 */
export function needsRecall(it: Item): boolean {
  const core = it.q.replace(/^\$|\$$/g, '');
  return it.q.length <= 200 && !it.a.includes(core);
}

/**
 * Engendre n questions distinctes (même énoncé exclu) ; `make(i)` reçoit l'indice de la
 * question pour varier les modèles de façon stable.
 */
export function distinct(n: number, make: (i: number) => Item): Item[] {
  const items: Item[] = [];
  const seen = new Set<string>();
  let tries = 0;
  while (items.length < n) {
    const it = make(items.length);
    tries++;
    // Au-delà d'un certain nombre d'essais, un doublon est accepté (petits réservoirs).
    if (seen.has(it.q) && tries < n * 60) continue;
    seen.add(it.q);
    items.push(it);
  }
  return items;
}
