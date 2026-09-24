# Architecture d'OmniScience

## Principes

1. **100 % côté client.** Aucun backend : GitHub Pages ne sert que des fichiers statiques. Les calculs (simulation électrique, calcul formel, analyse numérique) s'exécutent en JavaScript dans le navigateur ; WebAssembly est réservé aux besoins lourds futurs (CAS avancé, Python).
2. **Un chunk par module.** La page d'accueil ne charge que la coquille (≈ 20 ko gzip). Chaque module est un `import()` dynamique déclaré dans `src/app/registry.ts`, téléchargé à la première ouverture puis mis en cache par le service worker.
3. **Pas de framework d'interface.** TypeScript + DOM natif via un micro-utilitaire `h()` (`src/core/dom.ts`). Les modules restent lisibles par des enseignants-développeurs, sans chaîne de compilation propriétaire, et sans coût d'exécution d'un framework.
4. **Une scène, plusieurs sorties.** Les modules décrivent leur dessin via l'interface `Painter` (`src/core/graphics`). `CanvasPainter` affiche en temps réel ; `SvgPainter` produit l'export SVG, lui-même converti en PDF vectoriel. L'export est donc toujours fidèle à l'écran.
5. **L'URL est la sauvegarde.** L'état sérialisable d'un module est compressé par lz-string dans le fragment (`#/circuits?s=…`). Le shell met l'URL à jour (en différé) à chaque modification : recharger la page ne perd rien, et partager l'adresse (ou son QR code) partage la configuration. Les états reçus sont **toujours validés** (`sanitizeState`, `sanitizeCircuit`) car ils proviennent de liens non fiables.

## Coquille (`src/app`)

- **Routage par fragment** : seul mode compatible avec GitHub Pages sans règle de réécriture. `shell.ts` démonte l'instance courante (`destroy()`), charge le chunk demandé et appelle `mount(container, ctx)`.
- **Contrat des modules** (`src/core/types.ts`) :

  ```ts
  interface ModuleInstance {
    getState?(): unknown;          // lien de partage
    exportPNG?(): Promise<Blob>;   // export image
    exportSVG?(): string;          // export vectoriel (et PDF)
    refresh?(): void;              // thème ou mode présentation modifiés
    destroy(): void;
  }
  ```

- **Thème** : toutes les couleurs sont des variables CSS (`src/styles/tokens.css`) redéfinies pour le thème sombre. Les modules Canvas lisent ces variables au rendu (`cssVar`) et se redessinent sur `refresh()`.
- **Mode présentation** : classe `is-presenting` sur `<html>` + API Fullscreen. La barre supérieure disparaît, les panneaux se replient, les épaisseurs de trait et les textes des scènes sont multipliés (facteur `scale` des renderers).
- **PWA** : vite-plugin-pwa (Workbox, stratégie *generateSW*) pré-cache tous les chunks, y compris ceux des modules non encore ouverts : l'application complète fonctionne hors-ligne après la première visite. Une nouvelle version est proposée par une notification « Mettre à jour ».

## Simulateur de circuits (`src/modules/circuit`)

### Modèle
Chaque composant relie deux points de la grille (`x1, y1` → `x2, y2`) ; les connexions se font aux extrémités. Un point de connexion situé à l'intérieur d'un fil coupe ce fil (raccordement en T automatique). Conventions : courant de a vers b positif, générateurs avec a = borne −, diodes avec a = anode.

### Moteur (`solver/simulator.ts`, sans DOM, testé)
- **Super-nœuds** : les conducteurs idéaux (fils, ampèremètres, interrupteurs fermés, masses) fusionnent leurs extrémités (union-find). La matrice ne contient donc que de vrais nœuds, et un ampèremètre n'y introduit aucune inconnue.
- **Analyse nodale modifiée** : inconnues = potentiels + courants des sources de tension idéales. Une référence de potentiel par composante connexe (la masse si elle existe, sinon la borne − du premier générateur) ; une conductance `gmin` (10⁻¹² S) évite les nœuds flottants.
- **Régime transitoire** : modèles compagnons des condensateurs et bobines, méthode des trapèzes (conserve l'énergie : les oscillations LC ne sont pas amorties artificiellement), Euler implicite pendant deux pas après chaque changement de topologie pour éviter les oscillations numériques.
- **Non-linéarités** : diodes et DEL suivent le modèle de Shockley (1N4148 ; DEL paramétrées par leur tension de seuil), résolu par Newton-Raphson avec limitation de tension `pnjlim` (SPICE). Au-delà de 10 A, la caractéristique est prolongée linéairement pour garder un système bien conditionné (DEL branchée directement sur une pile → elle grille, sans débordement numérique).
- **Performance** : décomposition LU dense avec pivot partiel ; pour un circuit linéaire, la matrice n'est factorisée qu'une fois par topologie et chaque pas ne coûte qu'une descente-remontée. Environ 100 pas par image, avec un budget de calcul par image (la simulation ralentit plutôt que de figer l'interface).
- **Courant dans les fils** : absent de la MNA (les fils sont fusionnés), il est reconstitué par la loi des nœuds sur un arbre couvrant du graphe des conducteurs idéaux. C'est ce qui permet d'animer les électrons dans chaque fil et d'afficher la vérification Σ I entrants = Σ I sortants au survol d'un nœud.
- **Diagnostics pédagogiques** : court-circuit d'un générateur, générateurs idéaux en dérivation, tension anormale (source de courant en circuit ouvert), composants grillés (DEL au-delà de Imax, lampe au-delà de ≈ 1,5 × U nominale).

### Visualisation
- Sens conventionnel : chevrons rouges ; électrons : particules se déplaçant en sens inverse. Vitesse proportionnelle au logarithme de l'intensité (seuil d'affichage 100 nA, pour ne pas représenter le courant de fuite d'une diode bloquée).
- Symboles IEC 60617 dessinés via `Painter` (les icônes de la palette sont générées par le même code).

## Grapheuse (`src/modules/grapher`)

- **Compilation** (`expr.ts`) : classification de la ligne (fonction, polaire, paramétrique, point, curseur…), produits implicites résolus *avant* l'analyse syntaxique (`ax^2` → a·x²), AST mathjs réécrit puis **transpilé en fonction JavaScript native**. Environ 100 fois plus rapide que l'évaluateur de mathjs, indispensable pour échantillonner des milliers de points à chaque image. Le code généré ne contient que des jetons issus de listes blanches (aucune chaîne utilisateur n'y est recopiée).
- **Conventions françaises** : `ln` népérien, `log` décimal, virgule décimale et `;` dans les coordonnées à l'affichage.
- **Dérivée formelle** : `mathjs.derivative`, présentée pour les quotients sous la forme (u'v − uv')/v² ; repli sur une dérivée numérique (Richardson) sinon.
- **Échantillonnage** (`sampling.ts`) : un échantillon par pixel, subdivision là où la courbe n'est pas localement rectiligne, coupure aux discontinuités et aux bords du domaine localisés par dichotomie.
- **Analyse** (`analysis.ts`) : racines (Brent), extremums (section dorée puis racine de f'), intersections, limites (suites de valeurs + extrapolation d'Aitken pour les convergences en 1/x), asymptotes verticales, horizontales et obliques. Les résultats sont présentés comme des conjectures numériques.
- **Poids** : une instance mathjs restreinte (`create({ parseDependencies, derivativeDependencies, … })`) ; KaTeX n'est chargé qu'à l'ouverture d'une étude.

## Budget de performance (build de production)

| Ressource | Taille gzip |
|---|---|
| Coquille (accueil, routage, partage) | ≈ 20 ko JS + 4 ko CSS |
| Simulateur de circuits | ≈ 22 ko |
| Grapheuse (dont mathjs restreint) | ≈ 116 ko |
| Étude KaTeX (à la demande) | ≈ 79 ko + 8 ko CSS |
| Export PDF (jsPDF + svg2pdf, à la demande) | ≈ 155 ko |

## Tests

`npm test` exécute les tests Vitest (`tests/`) :
- moteur de circuits : loi d'Ohm, loi des nœuds, pont diviseur, résistance interne, court-circuit, charge RC (63 % à τ), établissement du courant RL, période LC = 2π√(LC), diode passante/bloquée, DEL qui grille ;
- grapheuse : compilation, produits implicites, conventions ln/log, fonctions composées, dérivées, erreurs, limites, asymptotes, échantillonnage ;
- noyau : analyse numérique, LU, formatage français, liens d'état.

## Sécurité

- Aucune donnée ne quitte le navigateur ; le seul stockage local est la préférence de thème.
- Les états issus des liens sont validés et bornés (nombre d'éléments, longueurs, types, valeurs numériques).
- Le transpileur de la grapheuse n'émet que des identifiants de listes blanches ou des clés `JSON.stringify` : une expression ne peut pas injecter de code.
