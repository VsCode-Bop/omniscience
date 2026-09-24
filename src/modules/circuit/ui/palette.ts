/**
 * Bibliothèque de composants : tuiles regroupées par famille, recherche instantanée.
 * Les symboles des tuiles sont générés par le même code de dessin que la scène.
 */
import { h, svgIcon } from '../../../core/dom';
import { SvgPainter } from '../../../core/graphics/svg-painter';
import { icon } from '../../../core/icons';
import { CATALOG, GROUPS, PALETTE_ORDER, type Group } from '../model/catalog';
import type { ElementType } from '../model/types';
import { drawSymbol } from '../render/symbols';

const SHORT_NAMES: Record<ElementType, string> = {
  wire: 'Fil', switch: 'Interrupteur', ground: 'Masse',
  battery: 'Pile', acsource: 'GBF', isource: 'Source I',
  resistor: 'Résistance', lamp: 'Lampe', motor: 'Moteur', capacitor: 'Condensateur', inductor: 'Bobine',
  diode: 'Diode', led: 'DEL', ammeter: 'Ampèremètre', voltmeter: 'Voltmètre',
};

/** Mots-clés de recherche supplémentaires (synonymes usuels en classe). */
const KEYWORDS: Partial<Record<ElementType, string>> = {
  battery: 'générateur continu accumulateur',
  acsource: 'générateur alternatif sinusoïdal signal',
  isource: 'source de courant intensité',
  resistor: 'conducteur ohmique',
  lamp: 'ampoule',
  led: 'diode électroluminescente',
  inductor: 'inductance',
  ground: 'terre référence',
  switch: 'interrupteur',
  wire: 'connexion',
};

export function shortName(type: ElementType): string {
  return SHORT_NAMES[type];
}

/** Symbole du composant en SVG (couleur = currentColor). */
export function symbolSVG(type: ElementType, width = 64, height = 36): string {
  const p = new SvgPainter();
  const ground = type === 'ground';
  drawSymbol(p, { id: 'icon', type, x1: ground ? 1.5 : 0, y1: 0, x2: 3, y2: 0, props: type === 'switch' ? { closed: false } : {} }, {
    stroke: 'currentColor', fill: 'none', bg: 'transparent', text: 'currentColor', width: 2.2,
    glow: 0, glowColor: 'currentColor', burnt: false, angle: -Math.PI / 4,
  });
  return p.toSVG(width, height, null, ground ? [-2, -6, 64, 36] : [-2, -18, 64, 36]);
}

export type Tool = 'select' | ElementType;

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function buildPalette(onPick: (tool: Tool) => void): { el: HTMLElement; setActive: (tool: Tool) => void } {
  const buttons = new Map<Tool, HTMLButtonElement>();
  const groups = new Map<Group, HTMLButtonElement[]>();

  for (const type of PALETTE_ORDER) {
    const spec = CATALOG[type];
    const tpl = document.createElement('template');
    tpl.innerHTML = symbolSVG(type);
    const btn = h('button', {
      class: 'lib-tile',
      title: `${spec.name}${spec.shortcut ? ` (${spec.shortcut.toUpperCase()})` : ''} — ${spec.description}`,
      'aria-pressed': 'false',
      'data-search': normalize(`${spec.name} ${SHORT_NAMES[type]} ${KEYWORDS[type] ?? ''}`),
      onclick: () => onPick(type),
    },
      h('span', { class: 'lib-symbol' }, tpl.content.firstElementChild!),
      h('span', { class: 'lib-name' }, SHORT_NAMES[type]),
      spec.shortcut ? h('kbd', null, spec.shortcut.toUpperCase()) : null,
    );
    buttons.set(type, btn);
    const list = groups.get(spec.group) ?? [];
    list.push(btn);
    groups.set(spec.group, list);
  }

  const selectBtn = h('button', { class: 'lib-select', 'aria-pressed': 'false', title: 'Sélectionner, déplacer, basculer les interrupteurs (Échap)', onclick: () => onPick('select') },
    svgIcon(icon('pointer')), h('span', null, 'Sélection'), h('kbd', null, 'Échap'),
  );
  buttons.set('select', selectBtn);

  const groupEls = [...groups.entries()].map(([group, tiles]) =>
    h('section', { class: 'lib-group' }, h('h3', null, GROUPS[group]), h('div', { class: 'lib-grid' }, ...tiles)),
  );
  const empty = h('p', { class: 'lib-empty', hidden: true }, 'Aucun composant ne correspond.');
  const search = h('input', { class: 'input lib-search-input', type: 'search', placeholder: 'Rechercher…', 'aria-label': 'Rechercher un composant' });
  search.addEventListener('input', () => {
    const q = normalize(search.value.trim());
    let any = false;
    for (const section of groupEls) {
      let visible = 0;
      for (const tile of section.querySelectorAll<HTMLElement>('.lib-tile')) {
        const match = !q || (tile.dataset.search ?? '').includes(q);
        tile.hidden = !match;
        if (match) visible++;
      }
      section.hidden = visible === 0;
      any ||= visible > 0;
    }
    empty.hidden = any;
  });

  const el = h('aside', { class: 'panel lib', 'aria-label': 'Composants' },
    h('div', { class: 'panel-header' }, h('h2', null, 'Composants')),
    h('div', { class: 'panel-scroll' },
      h('div', { class: 'lib-top' },
        h('div', { class: 'lib-search' }, svgIcon(icon('search'), 'icon icon-sm'), search),
        selectBtn,
      ),
      ...groupEls,
      empty,
      h('p', { class: 'lib-tip' }, 'Choisissez un composant puis glissez sur la grille, d\'une borne à l\'autre.'),
    ),
  );

  const setActive = (tool: Tool) => {
    for (const [t, b] of buttons) {
      b.classList.toggle('is-active', t === tool);
      b.setAttribute('aria-pressed', String(t === tool));
    }
  };
  return { el, setActive };
}
