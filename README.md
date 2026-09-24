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
| Calculatrice augmentée, suites, probabilités, arithmétique & matrices, optique, mécanique, générateur de fiches | 🗺️ planifiés | Fiches descriptives dans l'application, bibliothèques déjà choisies (voir [docs/BIBLIOTHEQUES.md](docs/BIBLIOTHEQUES.md)). |

Fonctions transverses : thème clair/sombre/automatique, **mode présentation** (touche <kbd>P</kbd> : plein écran épuré, traits agrandis pour le TBI), **exports PNG / SVG / PDF vectoriel**, **liens d'état** (toute la configuration est compressée dans l'URL) avec **QR code** à projeter, responsive (téléphone, tablette, TBI), hors-ligne.

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
2. Pousser sur `main` : le workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) lance les tests, construit le site avec `BASE_PATH=/<nom-du-dépôt>/` et le publie.

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
│   │   ├── math/                  LU, Brent, Simpson adaptatif, Gamma, formatage « à la française »
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
│   │   └── grapher/               grapheuse
│   │       ├── expr.ts            compilateur d'expressions (AST mathjs → fonctions JS natives)
│   │       ├── sampling.ts        échantillonnage adaptatif, discontinuités
│   │       ├── analysis.ts        racines, extremums, limites, asymptotes
│   │       ├── renderer.ts · panel.ts · study.ts · state.ts · ticks.ts · viewport.ts · index.ts
│   └── styles/                    jetons de thème (clair/sombre), mise en page
└── tests/                         tests unitaires Vitest
```

## Feuille de route

- **Circuits** : transistors (bipolaire, MOSFET), portes logiques, AOP, inverseur (interrupteur 3 bornes), potentiomètre, ohmmètre, diagramme de Bode, sélection multiple et copier-coller.
- **Grapheuse** : tableau de valeurs et de variations, équations implicites et inéquations, points déplaçables, régression sur données importées.
- **Nouveaux modules** : calculatrice CAS (mathjs + Algebrite, éditeur MathLive), suites (termes, sommes, toile d'araignée), probabilités (Chart.js), arithmétique et matrices exactes, optique (tracé de rayons), mécanique (projectiles), générateur de fiches LaTeX/Markdown.
- **Transverse** : tests de bout en bout Playwright en CI, audit d'accessibilité, traduction anglaise.

## Contribuer

1. Créer `src/modules/<id>/index.ts` exportant `mount(container, ctx): ModuleInstance` (voir `src/core/types.ts`).
2. Déclarer le module dans `src/app/registry.ts` avec `load: () => import('../modules/<id>')`.
3. Pour les exports, dessiner la scène via `Painter` : on obtient gratuitement PNG, SVG et PDF.
4. Garder les calculs purs (sans DOM) dans des fichiers testables et ajouter des tests dans `tests/`.

Détails dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Licence

[MIT](LICENSE) — libre d'utilisation, de modification et de redistribution, y compris dans un cadre scolaire ou commercial.
