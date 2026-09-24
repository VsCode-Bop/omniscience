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
    status: 'planned',
    icon: 'calculator',
    summary: 'Calculatrice de type NumWorks avec calcul formel, éditeur d\'équations visuel et historique.',
    tagline: `Calcul exact et formel, saisie naturelle des expressions, historique.`,
    features: [
      'Calcul exact (fractions, radicaux) et approché',
      'Calcul formel : développer, factoriser, résoudre, dériver, intégrer',
      'Éditeur visuel d\'expressions (saisie 2D, clavier virtuel pour tablette/TBI)',
      'Historique réutilisable et export LaTeX',
    ],
    libraries: ['mathjs', 'Algebrite (CAS léger)', 'Giac/Xcas en WebAssembly (CAS avancé, extension optionnelle : licence GPL)', 'MathLive (éditeur visuel)', 'KaTeX'],
  },
  {
    id: 'suites',
    title: 'Suites numériques',
    category: 'maths',
    status: 'planned',
    icon: 'sequence',
    summary: 'Suites explicites uₙ = f(n) et récurrentes uₙ₊₁ = f(uₙ) : termes, sommes, représentation en toile d\'araignée.',
    tagline: `Termes, sommes et toile d'araignée pour conjecturer la convergence.`,
    features: [
      'Tableau des termes et sommes partielles',
      'Nuage de points (n ; uₙ) et diagramme en toile d\'araignée (cobweb)',
      'Détection de monotonie, de convergence et des points fixes',
      'Reconnaissance de suites arithmétiques / géométriques',
    ],
    libraries: ['mathjs', 'Painter Canvas/SVG partagé avec la grapheuse'],
  },
  {
    id: 'probabilites',
    title: 'Probabilités & statistiques',
    category: 'maths',
    status: 'planned',
    icon: 'dice',
    summary: 'Simulations de dés et de pièces, fluctuation d\'échantillonnage, lois normale, binomiale et de Poisson.',
    tagline: `Simulations de hasard et lois de probabilité en un coup d'œil.`,
    features: [
      'Lancers simulés (1 à 10⁶) avec fréquences en temps réel',
      'Lois binomiale, de Poisson, normale : diagrammes, P(X ≤ k), intervalles',
      'Statistiques descriptives et diagrammes en boîte',
    ],
    libraries: ['Chart.js', 'jStat (fonctions de répartition)'],
  },
  {
    id: 'arithmetique',
    title: 'Arithmétique & matrices',
    category: 'maths',
    status: 'planned',
    icon: 'matrix',
    summary: 'Décomposition en facteurs premiers, PGCD/PPCM détaillés, calcul matriciel exact.',
    tagline: `Facteurs premiers, algorithme d'Euclide et matrices en valeurs exactes.`,
    features: [
      'Décomposition en facteurs premiers et arbre de divisions',
      'Algorithme d\'Euclide pas à pas, PGCD, PPCM, Bézout',
      'Matrices : produit, inverse, déterminant, puissances, en fractions exactes',
    ],
    libraries: ['mathjs (Fraction, BigNumber)'],
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
    status: 'planned',
    icon: 'optics',
    summary: 'Tracé de rayons à travers lentilles minces et miroirs, construction d\'images, réfraction de Snell-Descartes.',
    tagline: `Rayons lumineux, lentilles et construction des images.`,
    features: [
      'Lentilles convergentes/divergentes, miroirs plans et sphériques',
      'Construction graphique de l\'image, relation de conjugaison, grandissement',
      'Réfraction et réflexion totale (Snell-Descartes), dispersion par un prisme',
    ],
    libraries: ['Moteur de lancer de rayons maison', 'Painter Canvas/SVG partagé'],
  },
  {
    id: 'mecanique',
    title: 'Mécanique : projectiles',
    category: 'physique',
    status: 'planned',
    icon: 'projectile',
    summary: 'Lancer de projectiles, vecteurs vitesse et accélération, chronophotographie et énergies.',
    tagline: `Trajectoires, vecteurs vitesse et énergies d'un projectile.`,
    features: [
      'Trajectoire parabolique avec ou sans frottements',
      'Vecteurs vitesse/accélération animés, chronophotographie',
      'Énergies cinétique, potentielle et mécanique',
    ],
    libraries: ['Intégrateur Runge-Kutta maison', 'planck.js (collisions, optionnel)'],
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
