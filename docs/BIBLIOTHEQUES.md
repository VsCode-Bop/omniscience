# Choix des bibliothèques open source

Critères : exécution 100 % navigateur (compatible GitHub Pages), licence compatible MIT, maintenance active, poids raisonnable, chargement **à la demande** (seul le module ouvert télécharge ses dépendances).

## Utilisées dans les prototypes

| Besoin | Bibliothèque | Licence | Rôle et justification |
|---|---|---|---|
| Build, serveur de dev | **Vite 8** + **TypeScript 7** | MIT / Apache-2.0 | Site statique, découpage en chunks par module (`import()`), rechargement instantané. |
| Interface | *aucun framework* | — | DOM natif + utilitaire `h()` : zéro coût d'exécution, code accessible aux contributeurs enseignants. Un framework (Svelte, Preact) pourra être adopté module par module si besoin. |
| Hors-ligne / installation | **vite-plugin-pwa** (Workbox) | MIT | Manifeste, pré-cache de tous les chunks, mise à jour proposée à l'utilisateur. |
| Expressions, calcul formel de base | **mathjs 15** | Apache-2.0 | Analyse syntaxique robuste (produits implicites, priorités), `derivative`, `simplify`, `rationalize`. Instance restreinte via `create()` pour limiter le poids ; l'évaluation est ensuite transpilée en JS natif. |
| Rendu mathématique | **KaTeX** | MIT | Rendu LaTeX synchrone et rapide (dérivées, limites). Chargé seulement à l'ouverture d'une étude. |
| Export PDF vectoriel | **jsPDF 4** + **svg2pdf.js** | MIT | Convertit l'export SVG en PDF vectoriel imprimable. Chargés au premier export. |
| Liens d'état | **lz-string** | MIT | Compression sûre pour les URL : une configuration tient dans quelques centaines de caractères. |
| QR code du lien | **qrcode-generator** | MIT | Projeter un QR code pour que les élèves ouvrent la même configuration. |
| Tests | **Vitest** | MIT | Tests unitaires des moteurs (physique, analyse numérique). |

## Moteurs écrits pour OmniScience (et pourquoi)

| Besoin | Option envisagée | Décision |
|---|---|---|
| Simulation électrique | **Vis.js** | Écarté : bibliothèque de graphes de réseau (placement par forces), sans sémantique électrique ni symboles normalisés. |
| | CircuitJS1 (Falstad) | Référence pédagogique, mais GPL-2.0 et écrit en Java/GWT : incompatible avec la licence MIT et difficile à intégrer. Les mêmes principes (MNA, modèles compagnons) sont réimplémentés en TypeScript. |
| | ngspice en WebAssembly | Précis mais lourd (plusieurs Mo) et pensé pour des netlists textuelles. Option future pour un mode « électronique avancée » (transistors réels). |
| Grapheuse | **JSXGraph** (LGPL-3.0 / MIT) | Excellent pour la **géométrie dynamique** (à retenir pour un futur module), mais son traceur de courbes est moins adapté à l'étude de fonctions (asymptotes, domaines, analyse). |
| | **Chart.js**, Plotly | Conçus pour des données, pas pour des fonctions continues sur un repère infini (zoom, discontinuités). Plotly est en outre très lourd (≈ 1 Mo). |
| | Moteur Canvas maison | **Retenu** : échantillonnage adaptatif, détection des discontinuités, rendu Canvas/SVG unifié, contrôle total des conventions françaises. |

## Retenues pour les modules planifiés

| Module | Bibliothèques | Licence | Remarques |
|---|---|---|---|
| Calculatrice augmentée | **mathjs** complet (nombres, `Fraction`, `BigNumber` 64 chiffres, matrices, unités, `simplify`, `derivative`, `rationalize`) + KaTeX | Apache-2.0 / MIT | **Retenu** sans Algebrite : factorisation, résolution et identification des valeurs exactes sont écrites en ~500 lignes testées (polynômes à coefficients rationnels BigInt), ce qui évite 300 ko de plus et garde des résultats rédigés à la française. Clavier virtuel maison. |
| | **MathLive** (éditeur d'équations, clavier virtuel pour tablette/TBI) | MIT | Envisagé pour une saisie en 2D ; préféré à MathQuill (MPL-2.0), peu maintenu. |
| | Giac/Xcas en WebAssembly (CAS de niveau supérieur) | **GPL-3.0** | Puissant mais licence incompatible avec une distribution MIT : à n'envisager que comme extension optionnelle distribuée séparément. |
| | Pyodide (Python, comme sur NumWorks) | MPL-2.0 | ≈ 10 Mo : chargement explicite à la demande uniquement. |
| Suites numériques | mathjs + moteur de rendu de la grapheuse | — | Toile d'araignée et nuage de points via `Painter`. |
| Probabilités & statistiques | *aucune* (graphiques via Painter, fonctions spéciales maison) | — | Finalement ni Chart.js ni jStat : les graphiques passent par le Painter commun (exports PNG/SVG/PDF identiques à l'écran, style homogène), et ln Γ (Lanczos), Φ (Hart) et Φ⁻¹ (Acklam + Halley) tiennent en 150 lignes testées, précises à ~1e-14. Module : ≈ 20 ko gzip. |
| Arithmétique & matrices | mathjs (`Fraction`, `BigNumber`) | Apache-2.0 | Calculs exacts. |
| Optique, mécanique | Moteurs maison (lancer de rayons, Runge-Kutta 4) ; planck.js si des collisions sont nécessaires | MIT | |
| Générateur de fiches | KaTeX (aperçu) + jsPDF ; export `.tex` / `.md` en texte brut | MIT | |
| Tests de bout en bout | Playwright | Apache-2.0 | Chromium en CI. |
