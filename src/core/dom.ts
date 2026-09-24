/** Micro-utilitaires DOM (pas de framework : chaque module reste léger et lisible). */

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | null | undefined>;

/**
 * Crée un élément : h('button', { class: 'btn', onclick: fn }, 'Texte').
 * Les attributs `on*` deviennent des écouteurs ; `true` pose un attribut booléen.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2), value as EventListener);
      } else if (key === 'value' && 'value' in el) {
        (el as HTMLInputElement).value = String(value);
      } else {
        el.setAttribute(key, value === true ? '' : String(value));
      }
    }
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

/** Insère un fragment SVG de confiance (icônes internes uniquement). */
export function svgIcon(markup: string, className = 'icon'): SVGSVGElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  const svg = tpl.content.firstElementChild as SVGSVGElement;
  svg.classList.add(...className.split(' '));
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timer: number | undefined;
  return (...args: A) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), ms);
  };
}

/** Lit une variable CSS du thème courant. */
export function cssVar(name: string, el: Element = document.documentElement): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/** Met à jour le remplissage d'un curseur stylé (variable CSS --fill). */
export function syncRange(range: HTMLInputElement): void {
  const min = Number(range.min || 0);
  const max = Number(range.max || 100);
  const v = Number(range.value);
  range.style.setProperty('--fill', `${max > min ? ((v - min) / (max - min)) * 100 : 0}%`);
}

/** Curseur stylé : le remplissage suit la valeur. */
export function bindRange(range: HTMLInputElement): HTMLInputElement {
  syncRange(range);
  range.addEventListener('input', () => syncRange(range));
  return range;
}

/**
 * Ferme un popover au clic extérieur ou sur Échap ; retourne la fonction de fermeture.
 * `ignore` : élément déclencheur (son propre clic bascule le popover).
 */
export function dismissable(el: HTMLElement, onClose: () => void, ignore?: Element): () => void {
  const onDown = (e: PointerEvent) => {
    const t = e.target as Node;
    if (!el.contains(t) && !ignore?.contains(t)) close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  const close = () => {
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    onClose();
  };
  setTimeout(() => {
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
  });
  return close;
}
