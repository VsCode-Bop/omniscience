/**
 * Module « Probabilités & statistiques » : simulation d'expériences aléatoires,
 * lois de probabilité, statistiques descriptives à une ou deux variables.
 */
import './probability.css';
import { cssVar, h, svgIcon } from '../../core/dom';
import { canvasToBlob } from '../../core/export/download';
import { CanvasPainter, fitCanvas } from '../../core/graphics/canvas-painter';
import { SvgPainter } from '../../core/graphics/svg-painter';
import { icon } from '../../core/icons';
import type { ModuleContext, ModuleInstance } from '../../core/types';
import { readPalette } from '../grapher/renderer';
import type { ChartPalette, Rect } from './charts';
import { LawsTab, sanitizeLaw, type LawState } from './laws';
import { sanitizeSim, SimulationTab, type SimState } from './sim';
import { sanitizeStats, StatsTab, type StatsState } from './stats-tab';
import type { Hit, Tab, TabHost } from './ui';

export function mount(container: HTMLElement, ctx: ModuleContext): ModuleInstance {
  return new ProbabilityApp(container, ctx);
}

type TabId = 'simulation' | 'lois' | 'stats';

interface ProbaState {
  v: 1;
  tab: TabId;
  sim: SimState;
  law: LawState;
  stats: StatsState;
}

type KatexModule = typeof import('katex').default;
const isPresenting = () => document.documentElement.classList.contains('is-presenting');

function sanitize(raw: unknown): ProbaState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<ProbaState>;
  return {
    v: 1,
    tab: r.tab === 'lois' || r.tab === 'stats' ? r.tab : 'simulation',
    sim: sanitizeSim(r.sim),
    law: sanitizeLaw(r.law),
    stats: sanitizeStats(r.stats),
  };
}

function chartPalette(): ChartPalette {
  return { ...readPalette(), accent: cssVar('--accent'), accentSoft: cssVar('--accent-soft'), danger: cssVar('--danger') };
}

const TABS: [TabId, string, string][] = [
  ['simulation', 'Simulation', 'dice'],
  ['lois', 'Lois', 'graph'],
  ['stats', 'Statistiques', 'grid'],
];

class ProbabilityApp implements ModuleInstance, TabHost {
  private state: ProbaState;
  private pal: ChartPalette = chartPalette();
  private readonly root: HTMLElement;
  private readonly panelBody: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly tooltip: HTMLElement;
  private readonly tabButtons = new Map<TabId, HTMLButtonElement>();
  private readonly tabs = new Map<TabId, Tab & { getState(): unknown }>();
  private hits: Hit[] = [];
  private frame = 0;
  private width = 0;
  private height = 0;
  private katex: KatexModule | null = null;
  private collapsedForPresentation = false;
  private readonly resizeObserver: ResizeObserver;

  constructor(container: HTMLElement, private readonly ctx: ModuleContext) {
    this.state = sanitize(ctx.initialState);

    const tabBar = h('div', { class: 'panel-tabs', role: 'tablist' }, ...TABS.map(([id, label, ic]) => {
      const b = h('button', { class: 'panel-tab', role: 'tab', onclick: () => this.setTab(id) }, svgIcon(icon(ic), 'icon icon-sm'), label);
      this.tabButtons.set(id, b);
      return b;
    }));
    this.panelBody = h('div', { class: 'panel-scroll' });
    const panel = h('aside', { class: 'panel proba-panel', 'aria-label': 'Paramètres' },
      h('div', { class: 'panel-header panel-tabs-header' }, tabBar),
      this.panelBody,
    );
    this.canvas = h('canvas', { class: 'main-canvas', 'aria-label': 'Graphiques' });
    this.tooltip = h('div', { class: 'tooltip', hidden: true });
    this.stage = h('div', { class: 'stage proba-stage' },
      this.canvas,
      h('div', { class: 'float-bar tl' },
        h('button', { class: 'btn btn-icon', title: 'Afficher / masquer le panneau', 'aria-label': 'Afficher ou masquer le panneau', onclick: () => this.togglePanel() }, svgIcon(icon('sidebar'))),
      ),
      this.tooltip,
    );
    this.root = h('div', { class: 'workspace proba' }, panel, this.stage);
    container.appendChild(this.root);

    this.canvas.addEventListener('pointermove', (e) => this.onHover(e));
    this.canvas.addEventListener('pointerleave', () => (this.tooltip.hidden = true));
    this.setTab(this.state.tab, false);
    void this.loadKatex();
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.stage);
    if (isPresenting()) this.refresh();
  }

  // ─── TabHost ──────────────────────────────────────────────────────────────

  invalidate(): void {
    if (!this.frame) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.render();
      });
    }
  }

  notify(): void {
    this.ctx.notifyStateChange();
  }

  toast(message: string, kind?: 'info' | 'success' | 'error'): void {
    this.ctx.toast(message, kind);
  }

  renderTex(el: HTMLElement, tex: string): boolean {
    if (!this.katex) return false;
    try {
      this.katex.render(`\\displaystyle ${tex}`, el, { throwOnError: true, output: 'html' });
      return true;
    } catch {
      return false;
    }
  }

  private async loadKatex(): Promise<void> {
    const [mod] = await Promise.all([import('katex'), import('katex/dist/katex.min.css')]);
    this.katex = mod.default;
    this.tabs.forEach((t) => t.renderTex?.());
  }

  // ─── Onglets ──────────────────────────────────────────────────────────────

  private tab(id: TabId): Tab & { getState(): unknown } {
    let t = this.tabs.get(id);
    if (!t) {
      t = id === 'simulation' ? new SimulationTab(this.state.sim, this) : id === 'lois' ? new LawsTab(this.state.law, this) : new StatsTab(this.state.stats, this);
      this.tabs.set(id, t);
      t.renderTex?.();
    }
    return t;
  }

  private setTab(id: TabId, notify = true): void {
    this.state.tab = id;
    for (const [key, b] of this.tabButtons) {
      b.classList.toggle('is-active', key === id);
      b.setAttribute('aria-selected', String(key === id));
    }
    this.panelBody.replaceChildren(this.tab(id).panel);
    this.panelBody.scrollTop = 0;
    this.tooltip.hidden = true;
    this.invalidate();
    if (notify) this.notify();
  }

  private togglePanel(): void {
    this.root.classList.toggle('panel-collapsed');
    this.collapsedForPresentation = false;
  }

  // ─── Cycle de vie ─────────────────────────────────────────────────────────

  getState(): ProbaState {
    return {
      v: 1,
      tab: this.state.tab,
      sim: (this.tabs.get('simulation')?.getState() as SimState) ?? this.state.sim,
      law: (this.tabs.get('lois')?.getState() as LawState) ?? this.state.law,
      stats: (this.tabs.get('stats')?.getState() as StatsState) ?? this.state.stats,
    };
  }

  readTheme(): void {
    this.pal = chartPalette();
  }

  refresh(): void {
    this.pal = chartPalette();
    const presenting = isPresenting();
    if (presenting && !this.root.classList.contains('panel-collapsed')) {
      this.root.classList.add('panel-collapsed');
      this.collapsedForPresentation = true;
    } else if (!presenting && this.collapsedForPresentation) {
      this.root.classList.remove('panel-collapsed');
      this.collapsedForPresentation = false;
    }
    requestAnimationFrame(() => {
      this.onResize();
      this.invalidate();
    });
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.tabs.forEach((t) => t.destroy?.());
    this.resizeObserver.disconnect();
    this.root.remove();
  }

  async exportPNG(): Promise<Blob> {
    const scale = 2;
    const c = document.createElement('canvas');
    c.width = this.width * scale;
    c.height = this.height * scale;
    const g = c.getContext('2d')!;
    g.scale(scale, scale);
    g.fillStyle = this.pal.bg;
    g.fillRect(0, 0, this.width, this.height);
    this.tab(this.state.tab).draw(new CanvasPainter(g), this.area(true), this.pal, this.scale(), []);
    return canvasToBlob(c);
  }

  exportSVG(): string {
    const p = new SvgPainter();
    this.tab(this.state.tab).draw(p, this.area(true), this.pal, this.scale(), []);
    return p.toSVG(this.width, this.height, this.pal.bg);
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────

  private scale(): number {
    return isPresenting() ? 1.3 : 1;
  }

  /** Zone des graphiques (marge pour la barre flottante à l'écran). */
  private area(forExport = false): Rect {
    const k = this.scale();
    const top = forExport ? 18 * k : 64;
    return { x: 16 * k, y: top, w: this.width - 32 * k, h: this.height - top - 20 * k };
  }

  private onResize(): void {
    this.width = this.stage.clientWidth;
    this.height = this.stage.clientHeight;
    this.render();
  }

  private render(): void {
    if (this.width < 2 || this.height < 2) return;
    const g = fitCanvas(this.canvas, this.width, this.height);
    g.fillStyle = this.pal.bg;
    g.fillRect(0, 0, this.width, this.height);
    this.hits = [];
    this.tab(this.state.tab).draw(new CanvasPainter(g), this.area(), this.pal, this.scale(), this.hits);
  }

  private onHover(e: PointerEvent): void {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const hit = this.hits.find((h) => x >= h.rect.x && x <= h.rect.x + h.rect.w && y >= h.rect.y && y <= h.rect.y + h.rect.h);
    if (!hit) {
      this.tooltip.hidden = true;
      return;
    }
    this.tooltip.innerHTML = hit.html;
    this.tooltip.hidden = false;
    const w = this.tooltip.offsetWidth;
    const hgt = this.tooltip.offsetHeight;
    const left = x + 16 + w > this.width ? x - 16 - w : x + 16;
    const top = y + 16 + hgt > this.height ? y - 12 - hgt : y + 16;
    this.tooltip.style.transform = `translate(${left}px, ${top}px)`;
  }
}
