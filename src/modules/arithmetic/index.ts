/**
 * Module « Arithmétique & matrices » : décomposition en facteurs premiers, PGCD,
 * crible d'Ératosthène, calcul matriciel exact et transformations du plan.
 */
import './arithmetic.css';
import { cssVar, h, svgIcon } from '../../core/dom';
import { canvasToBlob } from '../../core/export/download';
import { CanvasPainter, fitCanvas } from '../../core/graphics/canvas-painter';
import type { Painter } from '../../core/graphics/painter';
import { SvgPainter } from '../../core/graphics/svg-painter';
import { icon } from '../../core/icons';
import type { ModuleContext, ModuleInstance } from '../../core/types';
import { segmented } from '../../core/widgets';
import { readPalette, type Palette } from '../grapher/renderer';
import { ArithTab, sanitizeArith, type ArithPalette, type ArithState } from './arith-tab';
import { MatrixTab, sanitizeMat, type MatState } from './matrix-tab';

export function mount(container: HTMLElement, ctx: ModuleContext): ModuleInstance {
  return new ArithmeticApp(container, ctx);
}

type TabId = 'arith' | 'matrices';

interface State {
  v: 1;
  tab: TabId;
  arith: ArithState;
  mat: MatState;
}

const isPresenting = () => document.documentElement.classList.contains('is-presenting');

function palette(): ArithPalette & Palette {
  return { ...readPalette(), accent: cssVar('--accent'), line: cssVar('--line-2'), surface: cssVar('--surface') };
}

class ArithmeticApp implements ModuleInstance {
  private readonly state: State;
  private pal = palette();
  private readonly root: HTMLElement;
  private readonly panelBody: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly scroller: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly viewBar: HTMLElement;
  private readonly viewSeg: ReturnType<typeof segmented<MatState['view']>>;
  private readonly tabButtons = new Map<TabId, HTMLButtonElement>();
  private readonly arith: ArithTab;
  private readonly mat: MatrixTab;
  private frame = 0;
  private collapsedForPresentation = false;
  private readonly resizeObserver: ResizeObserver;

  constructor(container: HTMLElement, private readonly ctx: ModuleContext) {
    const raw = (ctx.initialState && typeof ctx.initialState === 'object' ? ctx.initialState : {}) as Partial<State>;
    this.state = { v: 1, tab: raw.tab === 'matrices' ? 'matrices' : 'arith', arith: sanitizeArith(raw.arith), mat: sanitizeMat(raw.mat) };
    const host = {
      invalidate: () => this.invalidate(),
      notify: () => this.ctx.notifyStateChange(),
      toast: (m: string, k?: 'info' | 'success' | 'error') => this.ctx.toast(m, k),
    };
    this.arith = new ArithTab(this.state.arith, host);
    this.mat = new MatrixTab(this.state.mat, host);

    const tabBar = h('div', { class: 'panel-tabs', role: 'tablist' },
      ...([['arith', 'Arithmétique', 'calculator'], ['matrices', 'Matrices', 'matrix']] as const).map(([id, label, ic]) => {
        const b = h('button', { class: 'panel-tab', role: 'tab', onclick: () => this.setTab(id) }, svgIcon(icon(ic), 'icon icon-sm'), label);
        this.tabButtons.set(id, b);
        return b;
      }),
    );
    this.panelBody = h('div', { class: 'panel-scroll' });
    const panel = h('aside', { class: 'panel arith-panel', 'aria-label': 'Paramètres' },
      h('div', { class: 'panel-header panel-tabs-header' }, tabBar),
      this.panelBody,
    );
    this.canvas = h('canvas', { class: 'arith-canvas', 'aria-label': 'Résultats' });
    this.scroller = h('div', { class: 'arith-scroll' }, this.canvas);
    this.viewSeg = segmented<MatState['view']>([['calc', 'Calcul'], ['transform', 'Transformation du plan']], this.state.mat.view, (v) => {
      this.state.mat.view = v;
      this.viewSeg.set(v);
      this.invalidate();
      this.ctx.notifyStateChange();
    });
    this.viewBar = h('div', { class: 'float-bar tc arith-viewbar' }, this.viewSeg.el);
    this.stage = h('div', { class: 'stage arith-stage' },
      this.scroller,
      h('div', { class: 'float-bar tl' },
        h('button', { class: 'btn btn-icon', title: 'Afficher / masquer le panneau', 'aria-label': 'Afficher ou masquer le panneau', onclick: () => this.togglePanel() }, svgIcon(icon('sidebar'))),
      ),
      this.viewBar,
    );
    this.root = h('div', { class: 'workspace arith' }, panel, this.stage);
    container.appendChild(this.root);
    this.setTab(this.state.tab, false);
    this.resizeObserver = new ResizeObserver(() => this.invalidate());
    this.resizeObserver.observe(this.stage);
    if (isPresenting()) this.refresh();
  }

  private setTab(id: TabId, notify = true): void {
    this.state.tab = id;
    for (const [key, b] of this.tabButtons) {
      b.classList.toggle('is-active', key === id);
      b.setAttribute('aria-selected', String(key === id));
    }
    this.panelBody.replaceChildren(id === 'arith' ? this.arith.panel : this.mat.panel);
    this.scroller.scrollTop = 0;
    this.invalidate();
    if (notify) this.ctx.notifyStateChange();
  }

  private togglePanel(): void {
    this.root.classList.toggle('panel-collapsed');
    this.collapsedForPresentation = false;
  }

  getState(): State {
    return { v: 1, tab: this.state.tab, arith: this.arith.getState(), mat: this.mat.getState() };
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
    this.invalidate();
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.arith.destroy();
    this.resizeObserver.disconnect();
    this.root.remove();
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────

  private scale(): number {
    return isPresenting() ? 1.3 : 1;
  }

  private transformView(): boolean {
    return this.state.tab === 'matrices' && this.state.mat.view === 'transform' && this.mat.isSquare2();
  }

  /** Hauteur du contenu à dessiner pour une largeur donnée. */
  private contentHeight(w: number, viewH: number, forExport: boolean): number {
    if (this.state.tab === 'matrices' && !this.transformView()) {
      const top = forExport ? 24 : 72;
      return Math.max(forExport ? 0 : viewH, this.mat.drawCalc(null, w, this.pal, this.scale(), top) + top + 20);
    }
    return viewH;
  }

  private drawAll(p: Painter, w: number, hgt: number, forExport: boolean): void {
    const k = this.scale();
    if (this.state.tab === 'arith') this.arith.draw(p, w, hgt, this.pal, k);
    else if (this.transformView()) this.mat.drawTransform(p, w, hgt, this.pal, k);
    else this.mat.drawCalc(p, w, this.pal, k, forExport ? 24 : 72);
  }

  private invalidate(): void {
    if (!this.frame) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.render();
      });
    }
  }

  private render(): void {
    const w = this.scroller.clientWidth;
    const viewH = this.scroller.clientHeight;
    if (w < 2 || viewH < 2) return;
    this.viewBar.hidden = !(this.state.tab === 'matrices' && this.mat.isSquare2());
    const hgt = this.contentHeight(w, viewH, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${hgt}px`;
    const g = fitCanvas(this.canvas, w, hgt);
    g.fillStyle = this.pal.bg;
    g.fillRect(0, 0, w, hgt);
    this.drawAll(new CanvasPainter(g), w, hgt, false);
  }

  async exportPNG(): Promise<Blob> {
    const w = this.scroller.clientWidth;
    const hgt = this.contentHeight(w, this.scroller.clientHeight, true);
    const scale = 2;
    const c = document.createElement('canvas');
    c.width = w * scale;
    c.height = hgt * scale;
    const g = c.getContext('2d')!;
    g.scale(scale, scale);
    g.fillStyle = this.pal.bg;
    g.fillRect(0, 0, w, hgt);
    this.drawAll(new CanvasPainter(g), w, hgt, true);
    return canvasToBlob(c);
  }

  exportSVG(): string {
    const w = this.scroller.clientWidth;
    const hgt = this.contentHeight(w, this.scroller.clientHeight, true);
    const p = new SvgPainter();
    this.drawAll(p, w, hgt, true);
    return p.toSVG(w, hgt, this.pal.bg);
  }
}
