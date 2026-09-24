/**
 * Module « Optique géométrique » : banc d'optique (lentilles minces), dioptre plan
 * et prisme.
 */
import './optics.css';
import { cssVar, dismissable, h, svgIcon } from '../../core/dom';
import { canvasToBlob } from '../../core/export/download';
import { CanvasPainter, fitCanvas } from '../../core/graphics/canvas-painter';
import type { Painter } from '../../core/graphics/painter';
import { SvgPainter } from '../../core/graphics/svg-painter';
import { icon } from '../../core/icons';
import type { ModuleContext, ModuleInstance } from '../../core/types';
import { readPalette } from '../grapher/renderer';
import { Viewport } from '../grapher/viewport';
import type { ChartPalette } from '../probability/charts';
import { defaultLens, LensView, sanitizeLens, type LensState, type OpticsPalette } from './lens-view';
import { defaultRefr, RefractionView, sanitizeRefr, type RefrState } from './refraction-view';

export function mount(container: HTMLElement, ctx: ModuleContext): ModuleInstance {
  return new OpticsApp(container, ctx);
}

type TabId = 'lens' | 'refr';

interface State {
  v: 1;
  tab: TabId;
  lens: LensState;
  refr: RefrState;
}

const isPresenting = () => document.documentElement.classList.contains('is-presenting');

function palette(): OpticsPalette & ChartPalette {
  const base = readPalette();
  return {
    ...base,
    accent: cssVar('--accent'),
    accentSoft: cssVar('--accent-soft'),
    danger: cssVar('--danger'),
    rays: ['#e5484d', '#2f9e44', '#3e63dd'],
    bundle: '#f08c00',
    glass: '#7cc4fa',
  };
}

interface Example {
  title: string;
  level: string;
  hint: string;
  apply: (s: State) => void;
}

const lensEx = (lenses: LensState['lenses'], object: Partial<LensState['object']>, rays: Partial<LensState['rays']> = {}) => (s: State) => {
  const d = defaultLens();
  s.tab = 'lens';
  s.lens = { lenses, object: { ...d.object, ...object }, rays: { ...d.rays, ...rays } };
};

const EXAMPLES: Example[] = [
  { title: 'Image réelle et renversée', level: 'Première', hint: 'Objet au-delà de 2F : image réelle, renversée, plus petite (appareil photo).', apply: lensEx([{ x: 0, f: 10 }], { kind: 'finite', x: -30, h: 3 }) },
  { title: 'Image agrandie (projecteur)', level: 'Première', hint: 'Objet entre F et 2F : image réelle, renversée et agrandie.', apply: lensEx([{ x: 0, f: 10 }], { kind: 'finite', x: -14, h: 2 }) },
  { title: 'Loupe', level: 'Première', hint: 'Objet entre F et O : l\'image est virtuelle, droite et agrandie. On la voit à travers la lentille.', apply: lensEx([{ x: 0, f: 10 }], { kind: 'finite', x: -6, h: 2 }) },
  { title: 'Objet dans le plan focal', level: 'Première', hint: 'Les rayons issus de B ressortent parallèles : l\'image est rejetée à l\'infini.', apply: lensEx([{ x: 0, f: 10 }], { kind: 'finite', x: -10, h: 2 }, { bundle: true, particular: false }) },
  { title: 'Lentille divergente', level: 'Supérieur', hint: 'Une lentille divergente donne d\'un objet réel une image virtuelle, droite et plus petite.', apply: lensEx([{ x: 0, f: -12 }], { kind: 'finite', x: -24, h: 3 }) },
  { title: 'Lunette astronomique afocale', level: 'Terminale', hint: 'F′₁ = F₂ : un faisceau parallèle ressort parallèle, incliné d\'un angle G fois plus grand.', apply: lensEx([{ x: 0, f: 40 }, { x: 50, f: 10 }], { kind: 'infinity', theta: 2.5 }, { bundle: true, particular: false }) },
  { title: 'Association de deux lentilles', level: 'Terminale', hint: 'L\'image donnée par la première lentille sert d\'objet à la seconde.', apply: lensEx([{ x: 0, f: 10 }, { x: 35, f: 12 }], { kind: 'finite', x: -20, h: 2 }) },
  { title: 'Réfraction air → eau', level: 'Seconde', hint: 'En entrant dans l\'eau, plus réfringente, le rayon se rapproche de la normale.', apply: (s) => { s.tab = 'refr'; s.refr = { ...defaultRefr(), n1: 1, n2: 1.33, i1: 50 }; } },
  { title: 'Réflexion totale (verre → air)', level: 'Première', hint: 'Au-delà de l\'angle limite, toute la lumière est réfléchie : principe de la fibre optique.', apply: (s) => { s.tab = 'refr'; s.refr = { ...defaultRefr(), n1: 1.5, n2: 1, i1: 38 }; } },
  { title: 'Dispersion par un prisme', level: 'Seconde', hint: 'L\'indice du verre dépend de la longueur d\'onde : la lumière blanche est décomposée.', apply: (s) => { s.tab = 'refr'; s.refr = { ...defaultRefr(), mode: 'prism', glass: 'flint', i: 50 }; } },
];

class OpticsApp implements ModuleInstance {
  private state: State;
  private pal = palette();
  private lens: LensView;
  private refr: RefractionView;
  private readonly vp = new Viewport(-40, 40, -8, 8);
  private readonly root: HTMLElement;
  private readonly panelBody: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly tabButtons = new Map<TabId, HTMLButtonElement>();
  private frame = 0;
  private dragging = false;
  private collapsedForPresentation = false;
  private closePopover: (() => void) | null = null;
  private readonly resizeObserver: ResizeObserver;

  constructor(container: HTMLElement, private readonly ctx: ModuleContext) {
    const raw = (ctx.initialState && typeof ctx.initialState === 'object' ? ctx.initialState : {}) as Partial<State>;
    this.state = { v: 1, tab: raw.tab === 'refr' ? 'refr' : 'lens', lens: sanitizeLens(raw.lens), refr: sanitizeRefr(raw.refr) };
    const host = {
      changed: (recompute = true) => this.changed(recompute),
      toast: (m: string, k?: 'info' | 'success' | 'error') => this.ctx.toast(m, k),
    };
    this.lens = new LensView(this.state.lens, host);
    this.refr = new RefractionView(this.state.refr, host);

    const tabBar = h('div', { class: 'panel-tabs', role: 'tablist' },
      ...([['lens', 'Lentilles', 'optics'], ['refr', 'Réfraction', 'sun']] as const).map(([id, label, ic]) => {
        const b = h('button', { class: 'panel-tab', role: 'tab', onclick: () => this.setTab(id) }, svgIcon(icon(ic), 'icon icon-sm'), label);
        this.tabButtons.set(id, b);
        return b;
      }),
    );
    const examplesBtn = h('button', { class: 'btn btn-ghost btn-icon btn-sm', title: 'Exemples', 'aria-label': 'Exemples', 'aria-haspopup': 'menu' }, svgIcon(icon('book')));
    examplesBtn.addEventListener('click', () => this.openExamples(examplesBtn));
    this.panelBody = h('div', { class: 'panel-scroll' });
    const panel = h('aside', { class: 'panel optics-panel', 'aria-label': 'Paramètres' },
      h('div', { class: 'panel-header panel-tabs-header' }, tabBar, h('div', { class: 'popover-anchor' }, examplesBtn)),
      this.panelBody,
    );
    this.canvas = h('canvas', { class: 'main-canvas', 'aria-label': 'Schéma optique' });
    this.stage = h('div', { class: 'stage optics-stage' },
      this.canvas,
      h('div', { class: 'float-bar tl' },
        h('button', { class: 'btn btn-icon', title: 'Afficher / masquer le panneau', 'aria-label': 'Afficher ou masquer le panneau', onclick: () => this.togglePanel() }, svgIcon(icon('sidebar'))),
        h('button', { class: 'btn btn-icon', title: 'Cadrer', 'aria-label': 'Cadrer', onclick: () => { this.fit(); this.invalidate(); } }, svgIcon(icon('fit'))),
      ),
    );
    this.root = h('div', { class: 'workspace optics' }, panel, this.stage);
    container.appendChild(this.root);
    this.setTab(this.state.tab, false);
    this.bindCanvas();
    this.resizeObserver = new ResizeObserver(() => {
      this.fit();
      this.render();
    });
    this.resizeObserver.observe(this.stage);
    if (isPresenting()) this.refresh();
  }

  private changed(recompute: boolean): void {
    if (this.state.tab === 'lens') {
      this.lens.renderResults();
      if (!this.dragging && recompute) this.fit();
    } else {
      if (!recompute) this.refr.build();
      this.refr.renderResults();
    }
    this.invalidate();
    this.ctx.notifyStateChange();
  }

  private setTab(id: TabId, notify = true): void {
    this.state.tab = id;
    for (const [key, b] of this.tabButtons) {
      b.classList.toggle('is-active', key === id);
      b.setAttribute('aria-selected', String(key === id));
    }
    this.panelBody.replaceChildren(id === 'lens' ? this.lens.panel : this.refr.panel);
    this.fit();
    this.invalidate();
    if (notify) this.ctx.notifyStateChange();
  }

  private openExamples(anchor: HTMLElement): void {
    const wasOpen = this.closePopover && anchor.parentElement?.querySelector('.menu');
    this.closePopover?.();
    if (wasOpen) return;
    const menu = h('div', { role: 'menu', class: 'menu examples-menu' },
      h('div', { class: 'menu-label' }, 'Situations prêtes à projeter'),
      ...EXAMPLES.map((ex) => h('button', { class: 'menu-item', role: 'menuitem', onclick: () => {
        this.closePopover?.();
        ex.apply(this.state);
        const host = { changed: (r = true) => this.changed(r), toast: (m: string, k?: 'info' | 'success' | 'error') => this.ctx.toast(m, k) };
        this.lens = new LensView(this.state.lens, host);
        this.refr = new RefractionView(this.state.refr, host);
        this.setTab(this.state.tab);
        this.ctx.toast(ex.hint);
      } }, svgIcon(icon(ex.title.includes('Réfraction') || ex.title.includes('Réflexion') || ex.title.includes('prisme') ? 'sun' : 'optics')), h('strong', null, ex.title), h('small', null, ex.level))),
    );
    menu.classList.add('menu-left');
    anchor.parentElement!.append(menu);
    this.closePopover = dismissable(menu, () => {
      menu.remove();
      this.closePopover = null;
    }, anchor);
  }

  private togglePanel(): void {
    this.root.classList.toggle('panel-collapsed');
    this.collapsedForPresentation = false;
  }

  // ─── Cadrage et rendu ─────────────────────────────────────────────────────

  private scale(): number {
    return isPresenting() ? 1.3 : 1;
  }

  private fit(): void {
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight;
    if (W < 10 || H < 10) return;
    this.vp.width = W;
    this.vp.height = H;
    const [x0, x1, hMax] = this.lens.extent();
    const span = x1 - x0 || 20;
    const k = this.scale();
    const left = 40 * k;
    const right = 60 * k;
    const unitX = (W - left - right) / (span * 1.12);
    const cx = (x0 + x1) / 2;
    const xmin = cx - (W + left - right) / 2 / unitX;
    const halfY = hMax * 1.7;
    const unitY = Math.min(unitX * 4, (H - 150 * k) / (2 * halfY));
    const ymid = -(20 * k) / unitY;
    this.vp.set(xmin, xmin + W / unitX, ymid - H / 2 / unitY, ymid + H / 2 / unitY);
  }

  private invalidate(): void {
    if (!this.frame) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.render();
      });
    }
  }

  private draw(p: Painter, w: number, hgt: number): void {
    const k = this.scale();
    if (this.state.tab === 'lens') this.lens.draw(p, this.vp, this.pal, k);
    else if (this.state.refr.mode === 'dioptre') this.refr.drawDioptre(p, w, hgt, this.pal, k);
    else this.refr.drawPrism(p, w, hgt, this.pal, k);
  }

  private render(): void {
    const w = this.stage.clientWidth;
    const hgt = this.stage.clientHeight;
    if (w < 10 || hgt < 10) return;
    const g = fitCanvas(this.canvas, w, hgt);
    g.fillStyle = this.pal.bg;
    g.fillRect(0, 0, w, hgt);
    this.draw(new CanvasPainter(g), w, hgt);
  }

  private bindCanvas(): void {
    const c = this.canvas;
    let drag: ReturnType<LensView['hit']> = null;
    const local = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    c.addEventListener('pointerdown', (e) => {
      const pos = local(e);
      if (this.state.tab === 'lens') drag = this.lens.hit(this.vp, pos.x, pos.y);
      else if (this.refr.hitSource(this.stage.clientWidth, this.stage.clientHeight, this.scale(), pos.x, pos.y)) this.refr.dragging = true;
      if (drag || this.refr.dragging) {
        this.dragging = true;
        c.setPointerCapture(e.pointerId);
        c.style.cursor = 'grabbing';
      }
    });
    c.addEventListener('pointermove', (e) => {
      const pos = local(e);
      if (!this.dragging) {
        const over = this.state.tab === 'lens' ? this.lens.hit(this.vp, pos.x, pos.y) : this.refr.hitSource(this.stage.clientWidth, this.stage.clientHeight, this.scale(), pos.x, pos.y);
        c.style.cursor = over ? (this.state.tab === 'lens' && over && typeof over === 'object' && over.kind !== 'object' ? 'ew-resize' : 'grab') : '';
        return;
      }
      if (this.state.tab === 'lens' && drag) {
        this.lens.dragTo(this.vp, drag, pos.x, pos.y);
        this.lens.renderResults();
      } else if (this.refr.dragging) {
        this.refr.dragSource(this.stage.clientWidth, this.stage.clientHeight, this.scale(), pos.x, pos.y);
        this.refr.renderResults();
      }
      this.invalidate();
    });
    const end = () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.refr.dragging = false;
      if (this.state.tab === 'lens') {
        this.lens.build();
        this.fit();
      }
      drag = null;
      c.style.cursor = '';
      this.invalidate();
      this.ctx.notifyStateChange();
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  // ─── Cycle de vie ─────────────────────────────────────────────────────────

  getState(): State {
    return { v: 1, tab: this.state.tab, lens: this.lens.s, refr: this.refr.s };
  }

  readTheme(): void {
    this.pal = palette();
  }

  refresh(): void {
    this.pal = palette();
    const presenting = isPresenting();
    if (presenting && !this.root.classList.contains('panel-collapsed')) {
      this.root.classList.add('panel-collapsed');
      this.collapsedForPresentation = true;
    } else if (!presenting && this.collapsedForPresentation) {
      this.root.classList.remove('panel-collapsed');
      this.collapsedForPresentation = false;
    }
    requestAnimationFrame(() => {
      this.fit();
      this.render();
    });
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.root.remove();
  }

  async exportPNG(): Promise<Blob> {
    const w = this.stage.clientWidth;
    const hgt = this.stage.clientHeight;
    const scale = 2;
    const c = document.createElement('canvas');
    c.width = w * scale;
    c.height = hgt * scale;
    const g = c.getContext('2d')!;
    g.scale(scale, scale);
    g.fillStyle = this.pal.bg;
    g.fillRect(0, 0, w, hgt);
    this.draw(new CanvasPainter(g), w, hgt);
    return canvasToBlob(c);
  }

  exportSVG(): string {
    const w = this.stage.clientWidth;
    const hgt = this.stage.clientHeight;
    const p = new SvgPainter();
    this.draw(p, w, hgt);
    return p.toSVG(w, hgt, this.pal.bg);
  }
}
