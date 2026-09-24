/** Palette des composants : icônes générées par le même code de dessin que la scène. */
import { h, svgIcon } from '../../../core/dom';
import { SvgPainter } from '../../../core/graphics/svg-painter';
import { icon } from '../../../core/icons';
import { CATALOG, GROUPS, PALETTE_ORDER, type Group } from '../model/catalog';
import type { ElementType } from '../model/types';
import { drawSymbol } from '../render/symbols';

const SHORT_NAMES: Record<ElementType, string> = {
  wire: 'Fil', switch: 'Interrupteur', ground: 'Masse',
  battery: 'Pile', acsource: 'GBF', isource: 'Source de courant',
  resistor: 'Résistance', lamp: 'Lampe', motor: 'Moteur', capacitor: 'Condensateur', inductor: 'Bobine',
  diode: 'Diode', led: 'DEL', ammeter: 'Ampèremètre', voltmeter: 'Voltmètre',
};

export function shortName(type: ElementType): string {
  return SHORT_NAMES[type];
}

/** Symbole du composant en SVG (couleur = currentColor). */
export function symbolSVG(type: ElementType): string {
  const p = new SvgPainter();
  const ground = type === 'ground';
  drawSymbol(p, { id: 'icon', type, x1: ground ? 1.5 : 0, y1: 0, x2: 3, y2: 0, props: type === 'switch' ? { closed: false } : {} }, {
    stroke: 'currentColor', fill: 'none', bg: 'transparent', text: 'currentColor', width: 2.4,
    glow: 0, glowColor: 'currentColor', burnt: false, angle: -Math.PI / 4,
  });
  return p.toSVG(64, 36, null, ground ? [-2, -6, 64, 36] : [-2, -18, 64, 36]);
}

export type Tool = 'select' | ElementType;

export function buildPalette(onPick: (tool: Tool) => void): { el: HTMLElement; setActive: (tool: Tool) => void } {
  const buttons = new Map<Tool, HTMLButtonElement>();
  const make = (tool: Tool, label: string, iconEl: Element, key?: string, title?: string) => {
    const btn = h('button', { class: 'palette-btn', title: title ?? label, 'aria-pressed': 'false', onclick: () => onPick(tool) },
      h('span', { class: 'palette-icon' }, iconEl),
      h('span', { class: 'palette-label' }, label),
      key ? h('kbd', null, key.toUpperCase()) : null,
    );
    buttons.set(tool, btn);
    return btn;
  };
  const groups = new Map<Group, HTMLElement[]>();
  for (const type of PALETTE_ORDER) {
    const spec = CATALOG[type];
    const tpl = document.createElement('template');
    tpl.innerHTML = symbolSVG(type);
    const list = groups.get(spec.group) ?? [];
    list.push(make(type, SHORT_NAMES[type], tpl.content.firstElementChild!, spec.shortcut, `${spec.name} — ${spec.description}`));
    groups.set(spec.group, list);
  }
  const el = h('nav', { class: 'palette', 'aria-label': 'Composants' },
    make('select', 'Sélection', svgIcon(icon('pointer')), 'esc', 'Sélectionner, déplacer, basculer les interrupteurs (Échap)'),
    ...[...groups.entries()].map(([group, btns]) =>
      h('div', { class: 'palette-group' }, h('div', { class: 'palette-title' }, GROUPS[group]), ...btns),
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
