# OmniScience

**Des outils interactifs libres pour enseigner les mathématiques et la physique-chimie.**
Tout s'exécute dans le navigateur : aucun serveur, aucun compte, aucune donnée collectée.
L'application est hébergée sur GitHub Pages, s'installe comme une application (PWA) et fonctionne hors-ligne.

> Démo (après activation de GitHub Pages) : `https://vscode-bop.github.io/omniscience/`

## Ce que contient ce premier prototype

| Module | État | Points forts |
|---|---|---|
| **Simulateur de circuits** | ✅ prototype | Moteur MNA + Newton-Raphson + intégration trapézoïdale ; piles, GBF, sources de courant, résistances, lampes, moteurs, condensateurs, bobines, diodes, DEL, interrupteurs, ampèremètres, voltmètres, masse ; **sens conventionnel (flèches rouges) et électrons (particules) animés, ensemble ou séparément** ; loi des nœuds vérifiée au survol ; multimètre intégré ; oscilloscope 2 voies ; courts-circuits détectés ; DEL et lampes qui grillent ; 9 circuits d'exemple (cycle 4 → terminale). |
| **Grapheuse** | ✅ prototype | Canvas 2D haute densité ; fonctions cartésiennes, polaires, paramétriques, points ; curseurs animables créés automatiquement ; dérivée formelle, tangente déplaçable, intégrale, racines, extremums, intersections ; étude (limites en ±∞ et aux bornes, asymptotes verticales/horizontales/obliques) ; graduations en π ; 10 exemples. |
| **Suites numériques** | ✅ prototype | Suites explicites, récurrentes d'ordre 1 ou 2, définies par cas, jusqu'à trois suites liées (vₙ = uₙ − 6) ; nuage de points et **toile d'araignée** construits terme à terme ; observations (arithmétique, géométrique, arithmético-géométrique, sens de variation, limite conjecturée, points fixes attractifs/répulsifs) ; paramètres animables ; tableau de valeurs et sommes ; **algorithme de seuil et programme Python** ; 10 exemples. |
| **Probabilités & statistiques** | ✅ prototype | Simulation (pièce, dé, deux dés, urne) jusqu'à des millions de tirages : fréquences observées/théoriques, **loi des grands nombres** (entonnoir p ± 1/√n), **fluctuation d'échantillonnage** ; lois binomiale, géométrique, Poisson, hypergéométrique, uniformes, normale, exponentielle : P(X = k), P(a ≤ X ≤ b), seuils, intervalles, fonction de répartition, approximation normale ; statistiques à une variable (quartiles au sens du lycée, boîte à moustaches, histogramme, effectifs cumulés) et à deux variables (moindres carrés, corrélation, estimation). |
| **Arithmétique & matrices** | ✅ prototype | Décomposition en facteurs premiers (divisions successives et arbre, entiers jusqu'à 40 chiffres : Miller-Rabin, rho de Pollard), diviseurs ; **algorithme d'Euclide** pas à pas avec pavage du rectangle par des carrés, PPCM, Bézout ; **crible d'Ératosthène animé** ; matrices en **fractions exactes** : opérations, puissances, déterminant, inverse, rang, systèmes, **étapes du pivot de Gauss**, transformation du plan (2 × 2), copie LaTeX. |
| **Mécanique : projectiles** | ✅ prototype | Lancer dans un champ de pesanteur uniforme (Terre, Lune, Mars, Jupiter), frottements linéaires ou quadratiques (Runge-Kutta 4) ; **chronophotographie**, vecteurs vitesse et accélération animés, composantes, **construction de Δv⃗** ; graphes x(t), y(t), vitesses et **énergies** synchronisés ; vecteur v⃗₀ réglable à la souris ; cible à atteindre ; équations horaires chiffrées ; 9 situations. |
| **Optique géométrique** | ✅ prototype | Banc d'optique à **une ou deux lentilles minces** (objet à distance finie ou à l'infini) : rayons particuliers, faisceaux, **constructions avec prolongements virtuels**, relation de conjugaison et grandissement, objet/lentille/foyer déplaçables, lunette afocale ; **dioptre plan sur rapporteur** (Snell-Descartes, angle limite, réflexion totale, intensité réfléchie de Fresnel) avec **relevé de mesures** et droite sin i₂ = f(sin i₁) ; **dispersion par un prisme** (loi de Cauchy, minimum de déviation). |
| **Calculatrice augmentée** | ✅ prototype | Historique façon NumWorks rendu en KaTeX ; **résultats exacts** (fractions, radicaux, multiples de π, identifiés puis vérifiés à 64 chiffres) avec valeur approchée ; calcul formel : **développer, factoriser, simplifier, dériver, résoudre** (racines exactes, complexes signalées), primitives de polynômes, intégrales ; matrices en fractions exactes, unités SI, variables (`5 → a`), notation française (virgule décimale, ln/log, pgcd, ppcm, binome…) ; aperçu en direct, clavier virtuel, catalogue commenté, copie LaTeX. |
| Générateur de fiches | 🗺️ planifié | Fiche descriptive dans l'application, bibliothèques déjà choisies (voir [docs/BIBLIOTHEQUES.md](docs/BIBLIOTHEQUES.md)). |

Fonctions transverses : thème clair/sombre/automatique, **mode présentation** (touche <kbd>P</kbd> : plein écran épuré, traits agrandis pour le TBI), **exports PNG / SVG / PDF vectoriel** (polices Unicode intégrées : −, Ω, ℓ, indices…), **liens d'état** (toute la configuration est compressée dans l'URL) avec **QR code** à projeter, responsive (téléphone, tablette, TBI), hors-ligne.

## Démarrer

Prérequis : Node.js ≥ 20 (22 recommandé, voir `.nvmrc`).

```bash
npm install
npm run dev        # serveur de développement : http://localhost:5173
npm test           # tests unitaires (Vitest) : moteur de circuits, analyse numérique, compilateur…
npm run build      # vérification des types + build de production dans dist/
npm run preview    # sert dist/ localement
```

## Déployer sur GitHub Pages

1. Dans le dépôt : **Settings → Pages → Build and deployment → Source : « GitHub Actions »**.
   ⚠️ Ne pas choisir « Deploy from a branch » : GitHub publierait le code source non compilé
   (page blanche ; l'application affiche alors un message expliquant la correction).
2. Pousser sur la branche par défaut du dépôt (ou onglet **Actions** → « CI & déploiement GitHub Pages » → **Run workflow**) :
   le workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) lance les tests, construit le site avec
   `BASE_PATH=/<nom-du-dépôt>/` et le publie.

Avec un domaine personnalisé, construire avec `BASE_PATH=/`. Le routage par fragment (`#/circuits`) évite toute configuration de réécriture d'URL, que GitHub Pages ne permet pas.

## Structure du projet

```
omniscience/
├── .github/workflows/deploy.yml   CI (tests + build) et déploiement GitHub Pages
├── docs/
│   ├── ARCHITECTURE.md            principes, contrat des modules, moteurs de calcul
│   └── BIBLIOTHEQUES.md           choix des bibliothèques open source et alternatives écartées
├── public/icons/                  icônes de l'application (SVG + PNG pour la PWA)
├── src/
│   ├── main.ts                    point d'entrée
│   ├── app/                       coquille de l'application
│   │   ├── registry.ts            registre des modules (ajouter un module = une entrée)
│   │   ├── shell.ts               barre supérieure, routage #/module?s=…, exports, partage
│   │   ├── home.ts                accueil et fiches des modules planifiés
│   │   ├── presentation.ts        mode présentation (plein écran, TBI)
│   │   ├── theme.ts · pwa.ts · toast.ts · share-dialog.ts
│   ├── core/                      briques partagées, sans dépendance à un module
│   │   ├── graphics/              Painter : une scène → Canvas (écran) ou SVG (export, PDF)
│   │   ├── math/                  langage des expressions, LU, Brent, Simpson adaptatif, Gamma, formatage « à la française »
│   │   ├── export/                téléchargements, PDF vectoriel (jsPDF + svg2pdf, chargés à la demande)
│   │   ├── url-state.ts           liens d'état compressés (lz-string)
│   │   └── types.ts               contrat ModuleDefinition / ModuleInstance
│   ├── modules/
│   │   ├── circuit/               simulateur de circuits
│   │   │   ├── model/             types, catalogue des composants, validation des liens
│   │   │   ├── solver/            moteur MNA (sans dépendance au DOM, testé)
│   │   │   ├── render/            symboles IEC, animation du courant
│   │   │   ├── ui/                palette, oscilloscope
│   │   │   └── examples.ts · index.ts
│   │   ├── grapher/               grapheuse
│   │   │   ├── expr.ts            compilateur d'expressions (AST mathjs → fonctions JS natives)
│   │   │   ├── sampling.ts        échantillonnage adaptatif, discontinuités
│   │   │   ├── analysis.ts        racines, extremums, limites, asymptotes
│   │   │   └── renderer.ts · panel.ts · study.ts · state.ts · ticks.ts · viewport.ts · index.ts
│   │   ├── calculator/            calculatrice augmentée
│   │   │   ├── engine.ts          préparation de la saisie, mathjs verrouillé, commandes de calcul formel, rendu LaTeX
│   │   │   ├── exact.ts           rationnels BigInt, identification des valeurs exactes, polynômes
│   │   │   └── calculator.css · index.ts
│   │   ├── arithmetic/            arithmétique & matrices
│   │   │   ├── numbers.ts         BigInt : Euclide, Bézout, Miller-Rabin, Pollard, crible
│   │   │   ├── matrix.ts          fractions exactes, Gauss-Jordan avec étapes, systèmes
│   │   │   └── typeset.ts · arith-tab.ts · matrix-tab.ts · index.ts
│   │   ├── mechanics/             mécanique : projectiles
│   │   │   ├── physics.ts         intégration RK4, frottements, énergies
│   │   │   └── render.ts · state.ts · index.ts
│   │   ├── optics/                optique géométrique
│   │   │   ├── optics.ts          conjugaison, tracé paraxial, réfraction vectorielle, prisme, Cauchy
│   │   │   └── lens-view.ts · refraction-view.ts · index.ts
│   │   ├── probability/           probabilités & statistiques
│   │   │   ├── distributions.ts   lois, Φ, Φ⁻¹, ln Γ, calculs de probabilités
│   │   │   ├── stats.ts           indicateurs, histogrammes, régression, générateur aléatoire
│   │   │   └── charts.ts · sim.ts · laws.ts · stats-tab.ts · ui.ts · index.ts
│   │   └── sequences/             suites numériques
│   │       ├── model.ts           notation uₙ, calcul des termes, observations, seuil, Python
│   │       └── render.ts · panel.ts · state.ts · index.ts
│   └── styles/                    jetons de thème (clair/sombre), mise en page
└── tests/                         tests unitaires Vitest
```

## Feuille de route

- **Circuits** : transistors (bipolaire, MOSFET), portes logiques, AOP, inverseur (interrupteur 3 bornes), potentiomètre, ohmmètre, diagramme de Bode, sélection multiple et copier-coller.
- **Grapheuse** : tableau de valeurs et de variations, équations implicites et inéquations, points déplaçables, régression sur données importées.
- **Calculatrice** : éditeur d'équations MathLive, primitives au-delà des polynômes, mode Python (Pyodide à la demande).
- **Nouveau module** : générateur de fiches LaTeX/Markdown.
- **Transverse** : tests de bout en bout Playwright en CI, audit d'accessibilité, traduction anglaise.

## Contribuer

1. Créer `src/modules/<id>/index.ts` exportant `mount(container, ctx): ModuleInstance` (voir `src/core/types.ts`).
2. Déclarer le module dans `src/app/registry.ts` avec `load: () => import('../modules/<id>')`.
3. Pour les exports, dessiner la scène via `Painter` : on obtient gratuitement PNG, SVG et PDF.
4. Garder les calculs purs (sans DOM) dans des fichiers testables et ajouter des tests dans `tests/`.

Détails dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Licence

[MIT](LICENSE) — libre d'utilisation, de modification et de redistribution, y compris dans un cadre scolaire ou commercial.
