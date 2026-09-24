import { h, svgIcon } from '../core/dom';
import { icon } from '../core/icons';
import type { ModuleDefinition } from '../core/types';
import { CATEGORIES, MODULES } from './registry';

function moduleCard(m: ModuleDefinition): HTMLElement {
  const ready = m.status === 'prototype';
  return h('a', { class: `card module-card ${ready ? 'is-ready' : 'is-planned'}`, href: `#/${m.id}` },
    h('div', { class: 'card-icon' }, svgIcon(icon(m.icon))),
    h('div', { class: 'card-body' },
      h('div', { class: 'card-title' },
        h('h3', null, m.title),
        h('span', { class: `badge ${ready ? 'badge-ready' : 'badge-planned'}` }, ready ? 'Prototype' : 'À venir'),
      ),
      h('p', null, m.summary),
    ),
  );
}

export function renderHome(container: HTMLElement): void {
  const highlights: [string, string, string][] = [
    ['wifiOff', 'Hors-ligne', 'Application installable (PWA) : fonctionne sans réseau, en classe comme à la maison.'],
    ['share', 'Liens d\'état', 'Toute configuration tient dans un lien ou un QR code. Aucun compte, aucune donnée collectée.'],
    ['presentation', 'Mode présentation', 'Touche P : plein écran épuré, traits et textes agrandis pour le TBI.'],
    ['download', 'Exports', 'PNG, SVG vectoriel et PDF pour vos cours, fiches et évaluations.'],
  ];

  const sections = (Object.keys(CATEGORIES) as (keyof typeof CATEGORIES)[]).map((cat) =>
    h('section', { class: 'home-section' },
      h('header', null, h('h2', null, CATEGORIES[cat].title), h('p', { class: 'muted' }, CATEGORIES[cat].blurb)),
      h('div', { class: 'card-grid' }, ...MODULES.filter((m) => m.category === cat).map(moduleCard)),
    ),
  );

  container.append(
    h('div', { class: 'home' },
      h('section', { class: 'hero' },
        h('h1', null, 'Les sciences, ', h('span', { class: 'accent' }, 'rendues visibles'), '.'),
        h('p', { class: 'lead' },
          'OmniScience réunit des outils interactifs libres pour enseigner les mathématiques et la physique-chimie : ',
          'simulateur de circuits, grapheuse, calcul formel… Tout s\'exécute dans le navigateur.',
        ),
        h('div', { class: 'hero-actions' },
          h('a', { class: 'btn btn-primary btn-large', href: '#/circuits' }, svgIcon(icon('circuit')), 'Simulateur de circuits'),
          h('a', { class: 'btn btn-large', href: '#/grapheuse' }, svgIcon(icon('graph')), 'Grapheuse'),
        ),
      ),
      h('ul', { class: 'highlights' },
        ...highlights.map(([ic, title, text]) =>
          h('li', null, svgIcon(icon(ic)), h('div', null, h('strong', null, title), h('span', null, text))),
        ),
      ),
      ...sections,
      h('footer', { class: 'home-footer muted' },
        'Logiciel libre (licence MIT) — ',
        h('a', { href: 'https://github.com/VsCode-Bop/omniscience', target: '_blank', rel: 'noopener' }, 'contribuer sur GitHub'),
        '.',
      ),
    ),
  );
}

export function renderPlanned(container: HTMLElement, m: ModuleDefinition): void {
  container.append(
    h('div', { class: 'planned' },
      h('div', { class: 'planned-head' },
        h('div', { class: 'card-icon card-icon-large' }, svgIcon(icon(m.icon))),
        h('div', null,
          h('span', { class: 'badge badge-planned' }, 'Module à venir'),
          h('h1', null, m.title),
          h('p', { class: 'lead' }, m.summary),
        ),
      ),
      h('div', { class: 'planned-grid' },
        h('section', { class: 'card' },
          h('h2', null, 'Fonctionnalités prévues'),
          h('ul', { class: 'checklist' }, ...m.features.map((f) => h('li', null, f))),
        ),
        h('section', { class: 'card' },
          h('h2', null, 'Bibliothèques retenues'),
          h('ul', { class: 'checklist' }, ...(m.libraries ?? []).map((f) => h('li', null, f))),
          h('p', { class: 'muted' },
            'Ce module suit le même contrat que les prototypes (src/modules/<id>/index.ts → mount()). ',
            h('a', { href: 'https://github.com/VsCode-Bop/omniscience', target: '_blank', rel: 'noopener' }, 'Les contributions sont bienvenues'),
            '.',
          ),
        ),
      ),
      h('a', { class: 'btn', href: '#/' }, svgIcon(icon('home')), 'Retour à l\'accueil'),
    ),
  );
}
