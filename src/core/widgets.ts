/**
 * Petits composants de panneau partagés par les outils : champ numérique avec
 * curseur, contrôle segmenté, grille d'indicateurs, section titrée.
 */
import { bindRange, h, syncRange } from './dom';
import { fmt } from './math/format';

/** Lecture d'un nombre saisi « à la française ». */
export function parseNum(text: string): number {
  const t = text.trim().replace(/\s/g, '').replace(',', '.').replace('−', '-');
  return t ? Number(t) : Number.NaN;
}

export const html = (tag: keyof HTMLElementTagNameMap, cls: string, inner: string) => {
  const el = document.createElement(tag);
  el.className = cls;
  el.innerHTML = inner;
  return el;
};

/** Curseur + champ numérique synchronisés. */
export function numberField(
  label: string,
  symbol: string,
  spec: { min: number; max: number; step: number; integer?: boolean },
  value: number,
  onChange: (v: number) => void,
): { el: HTMLElement; set: (v: number) => void } {
  const range = bindRange(h('input', { type: 'range', min: String(spec.min), max: String(spec.max), step: String(spec.step), 'aria-label': label }));
  const input = h('input', { class: 'input input-sm num-input', type: 'text', inputmode: 'decimal', 'aria-label': label });
  const set = (v: number) => {
    range.value = String(v);
    syncRange(range);
    if (document.activeElement !== input) input.value = fmt(v, 8).replace(/\s/g, '');
  };
  range.addEventListener('input', () => {
    const v = Number(range.value);
    input.value = fmt(v, 8);
    onChange(v);
  });
  input.addEventListener('change', () => {
    let v = parseNum(input.value);
    if (!Number.isFinite(v)) {
      set(Number(range.value));
      return;
    }
    if (spec.integer) v = Math.round(v);
    // La saisie peut dépasser les bornes du curseur.
    if (v < Number(range.min)) range.min = String(v);
    if (v > Number(range.max)) range.max = String(v);
    set(v);
    onChange(v);
  });
  set(value);
  const el = h('div', { class: 'num-field' },
    h('div', { class: 'num-head' }, html('span', 'num-symbol', symbol), h('span', { class: 'num-label' }, label), input),
    range,
  );
  return { el, set };
}

/** Contrôle segmenté. */
export function segmented<T extends string>(options: [T, string][], value: T, onChange: (v: T) => void, cls = ''): { el: HTMLElement; set: (v: T) => void } {
  const buttons = new Map<T, HTMLButtonElement>();
  const el = h('div', { class: `seg seg-block ${cls}`, role: 'radiogroup' },
    ...options.map(([v, label]) => {
      const b = h('button', { class: 'seg-btn', role: 'radio', onclick: () => onChange(v) });
      b.innerHTML = label;
      buttons.set(v, b);
      return b;
    }),
  );
  const set = (v: T) => {
    for (const [key, b] of buttons) {
      b.classList.toggle('is-active', key === v);
      b.setAttribute('aria-checked', String(key === v));
    }
  };
  set(value);
  return { el, set };
}

/** Grille d'indicateurs : [étiquette (HTML), valeur]. */
export function statGrid(items: [string, string][], cls = ''): HTMLElement {
  return h('dl', { class: `stat-grid ${cls}` },
    ...items.map(([label, value]) => h('div', { class: 'stat' }, html('dt', '', label), html('dd', '', value))),
  );
}

export function section(title: string, ...children: (Node | null)[]): HTMLElement {
  return h('section', { class: 'panel-section' }, h('div', { class: 'section-title' }, title), ...children);
}

/** Pourcentage « à la française ». */
export function pct(x: number, digits = 3): string {
  return `${fmt(x * 100, digits)} %`;
}
