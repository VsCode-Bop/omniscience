import { h, svgIcon } from '../core/dom';
import { icon } from '../core/icons';
import type { ModuleDefinition } from '../core/types';
import { mountHero } from './hero';
import { ILLUSTRATIONS } from './illustrations';
import { CATEGORIES, MODULES } from './registry';

function art(id: string): HTMLElement {
  const holder = h('div', { class: 'module-art' });
  holder.innerHTML = ILLUSTRATIONS[id] ?? '';
  return holder;
}

function moduleCard(m: ModuleDefinition): HTMLElement {
  const ready = m.status === 'prototype';
  return h('a', { class: `module-card cat-${m.category}${ready ? '' : ' is-soon'}`, href: `#/${m.id}` },
    art(m.id),
    h('div', { class: 'module-info' },
      h('div', { class: 'module-head' },
        h('h3', null, m.title),
        h('span', { class: `pill ${ready ? 'pill-live' : 'pill-soon'}` }, ready ? 'Disponible' : 'En préparation'),
      ),
      h('p', null, m.tagline),
      h('span', { class: 'module-cta' }, ready ? 'Ouvrir' : 'Voir le programme', svgIcon(icon('arrowRight'), 'icon icon-sm')),
    ),
  );
}

/** Page d'accueil. Retourne une fonction de nettoyage (animations). */
export function renderHome(container: HTMLElement): () => void {
  const visual = h('div', { class: 'hero-visual' });
  const available = MODULES.filter((m) => m.status === 'prototype').length;

  const principles: [string, string, string][] = [
    ['01', 'Pensé pour le TBI', 'Mode présentation plein écran (touche P) : interface effacée, traits épais, textes agrandis, lisibles du fond de la salle.'],
    ['02', 'Partagé en un lien', 'Toute configuration tient dans une adresse ou un QR code. Les élèves ouvrent exactement ce que vous projetez.'],
    ['03', 'Hors-ligne, sans compte', 'Installable comme une application, utilisable sans réseau. Aucune donnée ne quitte le navigateur.'],
    ['04', 'Prêt pour vos supports', 'Exports vectoriels SVG et PDF, images PNG haute définition pour les fiches, évaluations et diaporamas.'],
  ];

  container.append(
    h('div', { class: 'home' },
      h('section', { class: 'hero' },
        h('div', { class: 'hero-copy' },
          h('div', { class: 'eyebrow' }, h('span', { class: 'eyebrow-dot' }), 'Logiciel libre · sans compte · hors-ligne'),
          h('h1', { class: 'serif' }, 'Le laboratoire numérique de vos cours de sciences.'),
          h('p', { class: 'lead' },
            'Des outils précis et élégants pour expliquer, projeter et faire manipuler : simulateur de circuits, grapheuse, et bientôt calcul formel, probabilités, optique. Tout s\'exécute dans le navigateur.',
          ),
          h('div', { class: 'hero-actions' },
            h('a', { class: 'btn btn-primary btn-lg', href: '#/circuits' }, 'Ouvrir le simulateur', svgIcon(icon('arrowRight'))),
            h('a', { class: 'btn btn-lg', href: '#/grapheuse' }, svgIcon(icon('graph')), 'Grapheuse'),
          ),
          h('dl', { class: 'hero-stats' },
            h('div', null, h('dt', null, String(available)), h('dd', null, 'outils disponibles')),
            h('div', null, h('dt', null, String(MODULES.length - available)), h('dd', null, 'en préparation')),
            h('div', null, h('dt', null, '0'), h('dd', null, 'compte, serveur ou publicité')),
          ),
        ),
        visual,
      ),
      ...(Object.keys(CATEGORIES) as (keyof typeof CATEGORIES)[]).map((cat) =>
        h('section', { class: `discipline cat-${cat}` },
          h('header', { class: 'section-head' },
            h('h2', { class: 'serif' }, CATEGORIES[cat].title),
            h('p', null, CATEGORIES[cat].blurb),
          ),
          h('div', { class: 'module-grid' }, ...MODULES.filter((m) => m.category === cat).map(moduleCard)),
        ),
      ),
      h('section', { class: 'principles' },
        h('header', { class: 'section-head' }, h('h2', { class: 'serif' }, 'Conçu pour la salle de classe')),
        h('div', { class: 'principles-grid' },
          ...principles.map(([n, title, text]) => h('div', { class: 'principle' }, h('span', { class: 'principle-num' }, n), h('h3', null, title), h('p', null, text))),
        ),
      ),
      h('footer', { class: 'home-footer' },
        h('span', null, 'OmniScience — logiciel libre sous licence MIT.'),
        h('a', { href: 'https://github.com/VsCode-Bop/omniscience', target: '_blank', rel: 'noopener' }, svgIcon(icon('github'), 'icon icon-sm'), 'Contribuer sur GitHub'),
      ),
    ),
  );
  return mountHero(visual);
}

export function renderPlanned(container: HTMLElement, m: ModuleDefinition): void {
  container.append(
    h('div', { class: `page planned cat-${m.category}` },
      h('a', { class: 'back-link', href: '#/' }, svgIcon(icon('chevronLeft'), 'icon icon-sm'), 'Tous les outils'),
      h('div', { class: 'planned-hero' },
        h('div', null,
          h('span', { class: 'pill pill-soon' }, 'En préparation'),
          h('h1', { class: 'serif' }, m.title),
          h('p', { class: 'lead' }, m.summary),
        ),
        art(m.id),
      ),
      h('div', { class: 'planned-grid' },
        h('section', { class: 'panel-card' },
          h('h2', null, 'Ce que fera ce module'),
          h('ul', { class: 'feature-list' }, ...m.features.map((f) => h('li', null, svgIcon(icon('check'), 'icon icon-sm'), h('span', null, f)))),
        ),
        h('section', { class: 'panel-card' },
          h('h2', null, 'Briques techniques retenues'),
          h('div', { class: 'lib-chips' }, ...(m.libraries ?? []).map((l) => h('span', { class: 'lib-chip' }, l))),
          h('p', { class: 'muted small' },
            'Chaque module suit le même contrat (src/modules/<id> → mount()), ce qui permet de contribuer à un outil sans connaître les autres.',
          ),
          h('a', { class: 'btn', href: 'https://github.com/VsCode-Bop/omniscience', target: '_blank', rel: 'noopener' }, svgIcon(icon('github')), 'Suivre ou contribuer'),
        ),
      ),
    ),
  );
}
