import type { ModuleCategory, ModuleDefinition } from '../core/types';

/**
 * Registre central des modules. Ajouter un module = ajouter une entrée ici et un
 * dossier dans src/modules/<id>/ exportant `mount()`. Le chunk n'est téléchargé
 * qu'à la première ouverture du module (puis mis en cache par le service worker).
 */
export const MODULES: ModuleDefinition[] = [
  // ─── Mathématiques ───────────────────────────────────────────────────────
  {
    id: 'grapheuse',
    title: 'Grapheuse',
    category: 'maths',
    status: 'prototype',
    icon: 'graph',
    summary: 'Courbes cartésiennes, polaires et paramétriques, curseurs, dérivées, tangentes, intégrales et points remarquables.',
    tagline: `Tracez, animez les paramètres, étudiez : dérivée, tangente, intégrale, limites.`,
    features: [
      'Rendu Canvas 2D haute densité avec échantillonnage adaptatif et détection des asymptotes',
      'Fonctions nommées f(x)=…, dérivées f\'(x), polaires r=…, paramétriques (x(t) ; y(t)), points',
      'Paramètres a, b, k… détectés automatiquement → curseurs animables',
      'Tangente déplaçable, intégrale sur [a ; b], racines, extremums, intersections',
      'Étude : dérivée formelle (LaTeX), limites en ±∞ et aux bornes',
      'Graduations en π, repère orthonormé, export PNG/SVG/PDF, lien de partage',
    ],
    libraries: ['mathjs (analyse syntaxique, dérivation formelle)', 'KaTeX (rendu LaTeX)'],
    load: () => import('../modules/grapher'),
  },
  {
    id: 'calculatrice',
    title: 'Calculatrice augmentée',
    category: 'maths',
    status: 'prototype',
    icon: 'calculator',
    summary: 'Calcul exact (fractions, radicaux, π) et approché, calcul formel, unités, complexes et matrices, avec historique réutilisable.',
    tagline: `Calcul exact et formel, saisie naturelle des expressions, historique.`,
    features: [
      'Calcul exact : fractions, grands entiers, radicaux et multiples de π reconnus et vérifiés à 64 chiffres',
      'Calcul formel : développer, factoriser (avec radicaux), résoudre, dériver, primitive, intégrale',
      'Syntaxe française (virgule décimale, ln, log décimal, « ; »), variables et fonctions, unités de physique',
      'Aperçu de la saisie en écriture mathématique, clavier virtuel pour tablette et TBI, catalogue',
      'Historique réutilisable, partageable par lien et exportable en LaTeX',
    ],
    libraries: ['mathjs (analyse, fractions, grands nombres, unités, complexes, matrices)', 'KaTeX', 'Racines exactes et factorisation maison'],
    load: () => import('../modules/calculator'),
  },
  {
    id: 'suites',
    title: 'Suites numériques',
    category: 'maths',
    status: 'prototype',
    icon: 'sequence',
    summary: 'Suites explicites uₙ = f(n) et récurrentes uₙ₊₁ = f(uₙ) : termes, sommes, toile d\'araignée, conjectures et algorithme de seuil.',
    tagline: `Termes, sommes et toile d'araignée pour conjecturer la convergence.`,
    features: [
      'Suites explicites, récurrentes d\'ordre 1 ou 2, définies par cas ; jusqu\'à trois suites liées (vₙ = uₙ − 6)',
      'Nuage de points (n ; uₙ) et toile d\'araignée, construction animée terme à terme',
      'Observations : nature (arithmétique, géométrique, arithmético-géométrique), sens de variation, limite conjecturée, points fixes',
      'Paramètres animables (suite logistique), tableau de valeurs et sommes partielles',
      'Algorithme de seuil avec le programme Python correspondant',
    ],
    libraries: ['mathjs (analyse syntaxique)', 'KaTeX', 'Painter Canvas/SVG partagé avec la grapheuse'],
    load: () => import('../modules/sequences'),
  },
  {
    id: 'probabilites',
    title: 'Probabilités & statistiques',
    category: 'maths',
    status: 'prototype',
    icon: 'dice',
    summary: 'Simulations de pièces, dés et urnes, fluctuation d\'échantillonnage, lois binomiale, normale, de Poisson…, statistiques à une ou deux variables.',
    tagline: `Simulations de hasard et lois de probabilité en un coup d'œil.`,
    features: [
      'Pièce, dé, somme de deux dés, urne : fréquences observées et théoriques, jusqu\'à des millions de tirages',
      'Loi des grands nombres (entonnoir p ± 1/√n) et fluctuation d\'échantillonnage',
      'Lois binomiale, géométrique, de Poisson, hypergéométrique, uniformes, normale, exponentielle : P(X = k), P(a ≤ X ≤ b), seuils, intervalles, fonction de répartition',
      'Statistiques : moyenne, médiane, quartiles (définition du lycée), écart-type, boîte à moustaches, histogramme, effectifs cumulés',
      'Séries doubles : nuage de points, droite des moindres carrés, corrélation, estimation',
    ],
    libraries: ['Fonctions spéciales implémentées dans le module (sans dépendance)', 'Painter Canvas/SVG (exports PNG, SVG, PDF)'],
    load: () => import('../modules/probability'),
  },
  {
    id: 'arithmetique',
    title: 'Arithmétique & matrices',
    category: 'maths',
    status: 'prototype',
    icon: 'matrix',
    summary: 'Décomposition en facteurs premiers, PGCD et Bézout pas à pas, crible d\'Ératosthène animé, calcul matriciel exact et transformations du plan.',
    tagline: `Facteurs premiers, algorithme d'Euclide et matrices en valeurs exactes.`,
    features: [
      'Décomposition en facteurs premiers : divisions successives et arbre (entiers jusqu\'à 40 chiffres)',
      'Algorithme d\'Euclide pas à pas, pavage du rectangle par des carrés, PGCD, PPCM, Bézout',
      'Crible d\'Ératosthène animé jusqu\'à 500',
      'Matrices en fractions exactes : somme, produit, puissance, déterminant, inverse, rang, systèmes, étapes du pivot de Gauss',
      'Transformation du plan associée à une matrice 2 × 2 ; export LaTeX du résultat',
    ],
    libraries: ['BigInt natif (Miller-Rabin, rho de Pollard)', 'Painter Canvas/SVG (exports PNG, SVG, PDF)'],
    load: () => import('../modules/arithmetic'),
  },

  // ─── Physique-chimie ─────────────────────────────────────────────────────
  {
    id: 'circuits',
    title: 'Simulateur de circuits',
    category: 'physique',
    status: 'prototype',
    icon: 'circuit',
    summary: 'Construisez et simulez des circuits : courant conventionnel et électrons animés, lois d\'Ohm et de Kirchhoff en direct.',
    tagline: `Construisez un circuit et voyez le courant circuler, électron par électron.`,
    features: [
      'Moteur MNA (analyse nodale modifiée) + Newton-Raphson + intégration trapézoïdale',
      'Piles, générateurs AC, sources de courant, résistances, lampes, moteurs, condensateurs, bobines, diodes, DEL, interrupteurs',
      'Ampèremètre, voltmètre, multimètre intégré et oscilloscope 2 voies',
      'Sens conventionnel (flèches rouges) et électrons (particules) simultanément ou séparément',
      'Loi des nœuds vérifiée au survol, détection des courts-circuits, DEL et lampes qui grillent',
      'Symboles normalisés (IEC), annuler/rétablir, exemples prêts à projeter',
    ],
    libraries: ['Moteur maison en TypeScript (aucune dépendance)'],
    load: () => import('../modules/circuit'),
  },
  {
    id: 'optique',
    title: 'Optique géométrique',
    category: 'physique',
    status: 'prototype',
    icon: 'optics',
    summary: 'Banc d\'optique à une ou deux lentilles minces, construction des images, dioptre plan et réflexion totale, dispersion par un prisme.',
    tagline: `Rayons lumineux, lentilles et construction des images.`,
    features: [
      'Lentilles convergentes et divergentes, objet à distance finie ou à l\'infini, rayons particuliers et faisceaux',
      'Constructions avec prolongements virtuels, relation de conjugaison, grandissement ; objet, lentille et foyer déplaçables',
      'Association de deux lentilles : lunette astronomique afocale et grossissement',
      'Dioptre plan sur rapporteur : Snell-Descartes, angle limite, réflexion totale, relevé de mesures et droite sin i₂ = f(sin i₁)',
      'Prisme : dispersion de la lumière blanche (loi de Cauchy), déviation et minimum de déviation',
    ],
    libraries: ['Tracé de rayons paraxial et réfraction vectorielle maison', 'Painter Canvas/SVG'],
    load: () => import('../modules/optics'),
  },
  {
    id: 'mecanique',
    title: 'Mécanique : projectiles',
    category: 'physique',
    status: 'prototype',
    icon: 'projectile',
    summary: 'Lancer de projectiles avec ou sans frottements : chronophotographie, vecteurs vitesse et accélération, variation du vecteur vitesse, énergies et graphes.',
    tagline: `Trajectoires, vecteurs vitesse et énergies d'un projectile.`,
    features: [
      'Trajectoire dans un champ de pesanteur uniforme (Terre, Lune, Mars, Jupiter), frottements linéaires ou quadratiques',
      'Chronophotographie, vecteurs vitesse et accélération animés, composantes, construction de Δv⃗',
      'Graphes x(t), y(t), vitesses et énergies (cinétique, potentielle, mécanique) synchronisés',
      'Vecteur vitesse initiale réglable à la souris, cible à atteindre, comparaison de trajectoires',
      'Équations horaires et équation de la trajectoire avec les valeurs numériques',
    ],
    libraries: ['Intégrateur Runge-Kutta 4 maison (validé par les solutions analytiques)', 'Painter Canvas/SVG'],
    load: () => import('../modules/mechanics'),
  },

  // ─── Espace enseignant ───────────────────────────────────────────────────
  {
    id: 'fiches',
    title: 'Générateur de fiches',
    category: 'enseignant',
    status: 'planned',
    icon: 'worksheet',
    summary: 'Fiches d\'exercices à paramètres aléatoires avec corrigés, export LaTeX et Markdown.',
    tagline: `Exercices à valeurs aléatoires et corrigés, en LaTeX ou Markdown.`,
    features: [
      'Modèles d\'exercices paramétrés (valeurs tirées aléatoirement, versions A/B)',
      'Corrigés générés automatiquement',
      'Export LaTeX (.tex), Markdown (.md) et PDF',
      'Insertion de figures issues de la grapheuse ou du simulateur',
    ],
    libraries: ['KaTeX (aperçu)', 'jsPDF'],
  },
];

export const CATEGORIES: Record<ModuleCategory, { title: string; blurb: string }> = {
  maths: { title: 'Mathématiques', blurb: 'Tracer, calculer, conjecturer — puis démontrer.' },
  physique: { title: 'Physique-chimie', blurb: 'Simuler, mesurer et rendre visible ce qui ne l\'est pas.' },
  enseignant: { title: 'Espace enseignant', blurb: 'Préparer ses séances et produire ses supports.' },
};

export function findModule(id: string): ModuleDefinition | undefined {
  return MODULES.find((m) => m.id === id);
}
