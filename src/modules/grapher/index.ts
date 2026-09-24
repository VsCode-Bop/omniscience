/**
 * Module « Grapheuse » : point d'entrée (chargé à la demande par le shell).
 */
import './grapher.css';
import { debounce, dismissable, h, svgIcon } from '../../core/dom';
import { canvasToBlob } from '../../core/export/download';
import { CanvasPainter, fitCanvas } from '../../core/graphics/canvas-painter';
import { SvgPainter } from '../../core/graphics/svg-painter';
import { icon } from '../../core/icons';
import { fmt, fmtPoint } from '../../core/math/format';
import { niceStep } from '../../core/math/numeric';
import type { ModuleContext, ModuleInstance } from '../../core/types';
import { findExtrema, findIntersections, findRoots } from './analysis';
import { Program } from './expr';
import { RowView, type PanelHost } from './panel';
import { drawScene, integralValue, POINT_LABELS, readPalette, type Palette, type Scene, type ScenePoint, type SceneRow } from './renderer';
import { DEFAULT_VIEW, defaultSlider, defaultState, EXAMPLES, newId, PALETTE_SIZE, sanitizeState, type GrapherState, type RowState } from './state';
import { Viewport } from './viewport';

export function mount(container: HTMLElement, ctx: ModuleContext): ModuleInstance {
  return new GrapherApp(container, ctx);
}

type Drag =
  | { kind: 'pan' }
  | { kind: 'tangent'; id: string }
  | { kind: 'intA' | 'intB'; id: string };

interface Pos {
  x: number;
  y: number;
}

const isPresenting = () => document.documentElement.classList.contains('is-presenting');

type KatexModule = typeof import('katex').default;

/** Évalue une saisie numérique simple : « 2,5 », « pi/2 », « -3 », « sqrt(2) ». */
function parseNumber(text: string): number {
  const t = text.trim().replace(/^(-?\d+),(\d+)$/, '$1.$2');
  if (!t) return Number.NaN;
  const direct = Number(t);
  if (Number.isFinite(direct)) return direct;
  const p = new Program([{ id: 'n', src: `y = ${t}` }]);
  const r = p.rows[0];
  if (r.kind !== 'function' || !r.fn || r.missing.length) return Number.NaN;
  const a = r.fn(0);
  return a === r.fn(1) ? a : Number.NaN;
}

class GrapherApp implements ModuleInstance, PanelHost {
  private state: GrapherState;
  private program!: Program;
  private readonly vp = new Viewport(...DEFAULT_VIEW);
  private palette: Palette = readPalette();
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly tooltip: HTMLElement;
  private readonly readout: HTMLElement;
  private readonly orthoBtn: HTMLButtonElement;
  private readonly views = new Map<string, RowView>();
  private points: ScenePoint[] = [];
  private readonly pinned = new Set<string>();
  private hover: Scene['hover'] = null;
  private frame = 0;
  private readonly animating = new Map<string, { dir: number; value: number }>();
  private animFrame = 0;
  private animLast = 0;
  private sized = false;
  private dirty = false;
  private collapsedForPresentation = false;
  private readonly pointers = new Map<number, Pos>();
  private drag: Drag | null = null;
  private downPos: Pos | null = null;
  private moved = false;
  private closePopover: (() => void) | null = null;
  private katex: KatexModule | null = null;
  private readonly resizeObserver: ResizeObserver;
  private readonly refreshStudies = debounce(() => this.views.forEach((v) => v.refreshStudy()), 250);

  constructor(container: HTMLElement, private readonly ctx: ModuleContext) {
    this.state = sanitizeState(ctx.initialState) ?? defaultState();
    if (!this.state.rows.length) this.state.rows.push({ id: newId(), src: '', color: 0 });

    // ── Panneau des expressions ──
    this.list = h('div', { class: 'expr-list' });
    const examplesBtn = h('button', { class: 'btn btn-sm', 'aria-haspopup': 'menu' }, svgIcon(icon('book')), 'Exemples', svgIcon(icon('chevronDown'), 'icon icon-sm'));
    examplesBtn.addEventListener('click', () => this.openExamples(examplesBtn));
    const helpBtn = h('button', { class: 'btn btn-ghost btn-icon btn-sm', title: 'Aide-mémoire de saisie', 'aria-label': 'Aide-mémoire de saisie' }, svgIcon(icon('info')));
    helpBtn.addEventListener('click', () => this.openHelp(helpBtn));

    const panel = h('aside', { class: 'panel grapher-panel', 'aria-label': 'Expressions' },
      h('div', { class: 'panel-header' },
        h('h2', null, 'Expressions'),
        h('div', { class: 'panel-header-actions' },
          h('div', { class: 'popover-anchor' }, examplesBtn),
          h('div', { class: 'popover-anchor' }, helpBtn),
        ),
      ),
      h('div', { class: 'panel-scroll' },
        this.list,
        h('button', { class: 'expr-add', onclick: () => this.addRow() }, svgIcon(icon('plus'), 'icon icon-sm'), 'Nouvelle expression'),
      ),
    );

    // ── Scène ──
    this.canvas = h('canvas', { class: 'main-canvas', tabindex: '0', 'aria-label': 'Graphique (flèches : déplacer, + et − : zoomer)' });
    this.tooltip = h('div', { class: 'tooltip', hidden: true });
    this.readout = h('div', { class: 'readout', hidden: true });
    this.orthoBtn = h('button', { class: 'btn btn-icon', title: 'Repère orthonormé', 'aria-label': 'Repère orthonormé', onclick: () => this.setOption('ortho', !this.state.opts.ortho) },
      h('span', { class: 'ortho-glyph', 'aria-hidden': 'true' }, '⊥'),
    );
    const displayBtn = h('button', { class: 'btn btn-icon', title: 'Affichage (quadrillage, axes, graduations)', 'aria-label': 'Options d\'affichage' }, svgIcon(icon('grid')));
    displayBtn.addEventListener('click', () => this.openDisplay(displayBtn));
    const zoom = (f: number) => () => {
      this.vp.zoomAt(this.vp.width / 2, this.vp.height / 2, f);
      this.viewChanged();
    };
    this.stage = h('div', { class: 'stage grapher-stage' },
      this.canvas,
      h('div', { class: 'float-bar tl' },
        h('button', { class: 'btn btn-icon', title: 'Afficher / masquer le panneau', 'aria-label': 'Afficher ou masquer le panneau', onclick: () => this.togglePanel() }, svgIcon(icon('sidebar'))),
      ),
      h('div', { class: 'float-bar tr' },
        h('button', { class: 'btn btn-icon', title: 'Zoom avant', 'aria-label': 'Zoom avant', onclick: zoom(1.4) }, svgIcon(icon('zoomIn'))),
        h('button', { class: 'btn btn-icon', title: 'Zoom arrière', 'aria-label': 'Zoom arrière', onclick: zoom(1 / 1.4) }, svgIcon(icon('zoomOut'))),
        h('button', { class: 'btn btn-icon', title: 'Vue par défaut (0)', 'aria-label': 'Vue par défaut', onclick: () => this.resetView() }, svgIcon(icon('target'))),
        h('span', { class: 'sep' }),
        this.orthoBtn,
        h('div', { class: 'popover-anchor' }, displayBtn),
      ),
      this.readout,
      this.tooltip,
    );

    this.root = h('div', { class: 'workspace grapher' }, panel, this.stage);
    container.appendChild(this.root);

    this.bindCanvas();
    this.compile();
    this.syncRows();
    this.syncOptions();
    void this.loadKatex();

    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.stage);
    if (isPresenting()) this.refresh();
  }

  /** KaTeX (écriture mathématique des lignes) est chargé en parallèle du module. */
  private async loadKatex(): Promise<void> {
    const [mod] = await Promise.all([import('katex'), import('katex/dist/katex.min.css')]);
    this.katex = mod.default;
    this.views.forEach((v) => v.renderDisplay());
  }

  renderTex(el: HTMLElement, tex: string): boolean {
    if (!this.katex) return false;
    try {
      // \displaystyle : fractions en taille normale sur la ligne (les exposants restent petits).
      this.katex.render(`\\displaystyle ${tex}`, el, { throwOnError: true, output: 'html' });
      return true;
    } catch {
      return false;
    }
  }

  private popover(anchor: HTMLElement, build: (close: () => void) => HTMLElement, align: 'left' | 'right' = 'right'): void {
    const wasOpenHere = this.closePopover && anchor.parentElement?.querySelector('.menu');
    this.closePopover?.();
    if (wasOpenHere) return;
    const close = () => this.closePopover?.();
    const menu = build(close);
    menu.classList.add('menu');
    if (align === 'left') menu.classList.add('menu-left');
    anchor.parentElement!.append(menu);
    this.closePopover = dismissable(menu, () => {
      menu.remove();
      this.closePopover = null;
    }, anchor);
  }

  private openExamples(anchor: HTMLElement): void {
    this.popover(anchor, (close) => h('div', { role: 'menu', class: 'examples-menu' },
      h('div', { class: 'menu-label' }, 'Exemples prêts à projeter'),
      ...EXAMPLES.map((ex, i) => h('button', { class: 'menu-item', role: 'menuitem', onclick: () => { close(); this.loadExample(i); } },
        svgIcon(icon('graph')), h('strong', null, ex.title), h('small', null, ex.level),
      )),
    ), 'right');
  }

  private openHelp(anchor: HTMLElement): void {
    this.popover(anchor, () => h('div', { class: 'help-pop' },
      h('div', { class: 'menu-label' }, 'Aide-mémoire de saisie'),
      h('table', null,
        ...[
          ['f(x) = x^2 - 1', 'fonction nommée'],
          ['y = 2x + 1', 'produits implicites : ax, 2x, x(x+1)'],
          ["f'(x), f''(x)", 'dérivées d\'une fonction nommée'],
          ['a = 2', 'curseur, animable'],
          ['r = 1 + cos(θ)', 'courbe polaire (θ ou theta)'],
          ['(cos(t), sin(t))', 'courbe paramétrée'],
          ['A = (2, 3)', 'point'],
          ['x = 3', 'droite verticale'],
          ['x < 0 ? -x : x', 'fonction par morceaux'],
          ['ln, log, e^x, sqrt, abs', 'ln népérien, log décimal'],
        ].map(([code, desc]) => h('tr', null, h('td', null, h('code', null, code)), h('td', null, desc))),
      ),
      h('p', null, 'Molette ou pincement : zoom · glisser : déplacer · clic sur un point : coordonnées.'),
    ), 'right');
  }

  private openDisplay(anchor: HTMLElement): void {
    const row = (key: keyof GrapherState['opts'], label: string) => {
      const input = h('input', { type: 'checkbox', class: 'switch', checked: this.state.opts[key] });
      input.addEventListener('change', () => this.setOption(key, input.checked));
      return h('label', { class: 'option-row' }, h('span', null, label), input);
    };
    this.popover(anchor, () => h('div', { class: 'display-pop' },
      h('div', { class: 'menu-label' }, 'Affichage'),
      row('grid', 'Quadrillage'),
      row('axes', 'Axes gradués'),
      row('ortho', 'Repère orthonormé'),
      row('pi', 'Graduations en π'),
      row('coords', 'Coordonnées des points'),
    ));
  }

  // ─── Cycle de vie ─────────────────────────────────────────────────────────

  getState(): GrapherState {
    return { ...this.state, view: this.vp.bounds().map((v) => Number(v.toPrecision(8))) as GrapherState['view'] };
  }

  readTheme(): void {
    this.palette = readPalette();
  }

  refresh(): void {
    this.palette = readPalette();
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
    cancelAnimationFrame(this.animFrame);
    this.resizeObserver.disconnect();
    this.root.remove();
  }

  async exportPNG(): Promise<Blob> {
    const scale = 2;
    const c = document.createElement('canvas');
    c.width = this.vp.width * scale;
    c.height = this.vp.height * scale;
    const g = c.getContext('2d')!;
    g.scale(scale, scale);
    g.fillStyle = this.palette.bg;
    g.fillRect(0, 0, this.vp.width, this.vp.height);
    drawScene(new CanvasPainter(g), { ...this.scene(), hover: null }, this.palette);
    return canvasToBlob(c);
  }

  exportSVG(): string {
    const p = new SvgPainter();
    drawScene(p, { ...this.scene(), hover: null }, this.palette);
    return p.toSVG(this.vp.width, this.vp.height, this.palette.bg);
  }

  // ─── Compilation et synchronisation du panneau ────────────────────────────

  private compile(): void {
    this.program = new Program(this.state.rows.map((r) => ({ id: r.id, src: r.src })));
    // Les curseurs dont la ligne n'est plus un paramètre cessent d'être animés.
    this.program.rows.forEach((c) => {
      if (c.kind !== 'param') this.animating.delete(c.id);
    });
    this.state.rows.forEach((row, i) => {
      const c = this.program.rows[i];
      if (c.kind === 'param' && !row.slider) row.slider = defaultSlider(c.value ?? 1);
    });
  }

  private syncRows(): void {
    const ids = new Set(this.state.rows.map((r) => r.id));
    for (const [id, view] of this.views) {
      if (!ids.has(id)) {
        view.el.remove();
        this.views.delete(id);
      }
    }
    this.state.rows.forEach((row, i) => {
      let view = this.views.get(row.id);
      if (!view) {
        view = new RowView(row, this);
        this.views.set(row.id, view);
      }
      const at = this.list.children[i] ?? null;
      if (at !== view.el) this.list.insertBefore(view.el, at);
      view.update(row, this.program.rows[i], i);
    });
  }

  private syncOptions(): void {
    this.orthoBtn.classList.toggle('is-active', this.state.opts.ortho);
  }

  private changed(recompile: boolean): void {
    this.dirty = true;
    if (recompile) this.compile();
    this.pinned.clear();
    this.syncRows();
    this.invalidate();
    this.ctx.notifyStateChange();
  }

  private row(id: string): RowState | undefined {
    return this.state.rows.find((r) => r.id === id);
  }

  private compiledOf(id: string) {
    return this.program.rows[this.state.rows.findIndex((r) => r.id === id)];
  }

  // ─── PanelHost ────────────────────────────────────────────────────────────

  setSource(id: string, src: string): void {
    const row = this.row(id);
    if (!row) return;
    row.src = src;
    this.changed(true);
  }

  /** Validation d'une ligne : création automatique des curseurs manquants. */
  commitSource(id: string): void {
    const index = this.state.rows.findIndex((r) => r.id === id);
    const compiled = this.program.rows[index];
    if (!compiled?.missing.length) return;
    const created = compiled.missing.map((name) => ({ id: newId(), src: `${name} = 1`, color: 0, slider: defaultSlider(1) }));
    this.state.rows.splice(index + 1, 0, ...created);
    this.changed(true);
    this.ctx.toast(`Curseur${created.length > 1 ? 's' : ''} créé${created.length > 1 ? 's' : ''} : ${compiled.missing.join(', ')}`);
  }

  patchRow(id: string, patch: Partial<RowState>): void {
    const row = this.row(id);
    if (!row) return;
    for (const [k, v] of Object.entries(patch) as [keyof RowState, unknown][]) {
      if (v === undefined) delete row[k];
      else (row as unknown as Record<string, unknown>)[k] = v;
    }
    this.changed(false);
  }

  setSlider(id: string, value: number): void {
    const row = this.row(id);
    const c = this.compiledOf(id);
    if (!row || !c || c.kind !== 'param' || !c.name) return;
    const step = row.slider?.step ?? 0.1;
    const decimals = Math.max(0, Math.min(8, -Math.floor(Math.log10(step) + 1e-9)));
    const v = Number((Math.round(value / step) * step).toFixed(decimals));
    row.src = `${c.name} = ${v}`;
    c.value = v;
    this.program.setParam(c.name, v);
    this.views.get(id)?.syncSliderValue(v);
    this.dirty = true;
    this.pinned.clear();
    this.invalidate();
    this.refreshStudies();
    this.ctx.notifyStateChange();
  }

  toggleAnimation(id: string): void {
    const c = this.compiledOf(id);
    if (this.animating.has(id)) this.animating.delete(id);
    else if (c?.kind === 'param') this.animating.set(id, { dir: 1, value: c.value ?? 0 });
    this.views.get(id)?.syncSliderValue(c?.value ?? 0);
    if (this.animating.size && !this.animFrame) {
      this.animLast = performance.now();
      this.animFrame = requestAnimationFrame((t) => this.animate(t));
    }
  }

  isAnimating(id: string): boolean {
    return this.animating.has(id);
  }

  addRow(afterId?: string): void {
    const used = new Set(this.state.rows.filter((r) => !/^\s*\w+\s*=\s*-?[\d.]+\s*$/.test(r.src)).map((r) => r.color));
    let color = 0;
    while (used.has(color) && color < PALETTE_SIZE - 1) color++;
    const row: RowState = { id: newId(), src: '', color };
    const index = afterId ? this.state.rows.findIndex((r) => r.id === afterId) + 1 : this.state.rows.length;
    this.state.rows.splice(index, 0, row);
    this.changed(true);
    this.views.get(row.id)?.input.focus();
  }

  deleteRow(id: string): void {
    this.animating.delete(id);
    this.state.rows = this.state.rows.filter((r) => r.id !== id);
    if (!this.state.rows.length) this.state.rows.push({ id: newId(), src: '', color: 0 });
    this.changed(true);
  }

  focusSibling(id: string, delta: 1 | -1): void {
    const i = this.state.rows.findIndex((r) => r.id === id);
    const target = this.state.rows[i + delta];
    if (target) this.views.get(target.id)?.input.focus();
    else if (delta === 1 && this.state.rows[i]?.src.trim()) this.addRow(id);
  }

  renderStudy(id: string, el: HTMLElement): void {
    const c = this.compiledOf(id);
    if (!c || !this.sized) return;
    // KaTeX (et ses polices) n'est chargé qu'à la première étude affichée.
    void import('./study').then(({ renderStudy }) => renderStudy(el, c, this.vp));
  }

  integralValue(id: string): number {
    const row = this.row(id);
    const c = this.compiledOf(id);
    if (!row?.integral || !c?.fn) return Number.NaN;
    return integralValue({ state: row, compiled: c, color: '' });
  }

  parseNumber(text: string): number {
    return parseNumber(text);
  }

  // ─── Options, exemples, vue ───────────────────────────────────────────────

  private setOption(key: keyof GrapherState['opts'], value: boolean): void {
    this.state.opts[key] = value;
    if (key === 'ortho' && value) this.vp.makeOrthonormal();
    this.syncOptions();
    this.dirty = true;
    this.viewChanged();
  }

  private loadExample(index: number): void {
    const example = EXAMPLES[index];
    if (!example) return;
    if (this.dirty && !window.confirm('Remplacer les expressions actuelles par cet exemple ?')) return;
    this.animating.clear();
    this.state = example.make();
    this.views.forEach((v) => v.el.remove());
    this.views.clear();
    this.applyView();
    this.syncOptions();
    this.changed(true);
    this.dirty = false;
    this.ctx.toast(`Exemple chargé : ${example.title}`);
  }

  private applyView(): void {
    this.vp.set(...this.state.view);
    if (this.state.opts.ortho) this.vp.makeOrthonormal();
  }

  private resetView(): void {
    this.vp.set(...DEFAULT_VIEW);
    if (this.state.opts.ortho) this.vp.makeOrthonormal();
    this.viewChanged();
  }

  private togglePanel(): void {
    this.root.classList.toggle('panel-collapsed');
    this.collapsedForPresentation = false;
  }

  private viewChanged(): void {
    this.state.view = this.vp.bounds();
    this.invalidate();
    this.refreshStudies();
    this.ctx.notifyStateChange();
  }

  private onResize(): void {
    const w = this.stage.clientWidth;
    const hgt = this.stage.clientHeight;
    if (w < 2 || hgt < 2) return;
    if (!this.sized) {
      this.vp.width = w;
      this.vp.height = hgt;
      this.applyView();
      this.sized = true;
      this.views.forEach((v) => v.refreshStudy());
    } else {
      this.vp.resize(w, hgt);
    }
    this.render();
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────

  private invalidate(): void {
    if (!this.frame) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.render();
      });
    }
  }

  private sceneRows(): SceneRow[] {
    return this.state.rows.map((row, i) => ({ state: row, compiled: this.program.rows[i], color: this.palette.curves[row.color] }));
  }

  private scene(): Scene {
    return {
      vp: this.vp,
      rows: this.sceneRows(),
      opts: this.state.opts,
      points: this.points,
      pinned: this.pinned,
      scale: isPresenting() ? 1.5 : 1,
      hover: this.hover,
    };
  }

  private render(): void {
    if (!this.sized) return;
    const g = fitCanvas(this.canvas, this.vp.width, this.vp.height);
    g.fillStyle = this.palette.bg;
    g.fillRect(0, 0, this.vp.width, this.vp.height);
    this.points = this.computePoints();
    drawScene(new CanvasPainter(g), this.scene(), this.palette);
  }

  private computePoints(): ScenePoint[] {
    const { xmin, xmax } = this.vp;
    const out: ScenePoint[] = [];
    const add = (x: number, y: number, kind: ScenePoint['kind'], color: string) => {
      if (!Number.isFinite(y) || !this.vp.isVisible(x, y, -2)) return;
      out.push({ x, y, kind, color, key: `${kind}:${x.toPrecision(7)}:${y.toPrecision(7)}` });
    };
    const fns = this.sceneRows().filter((r) => !r.state.hidden && r.compiled.kind === 'function' && r.compiled.fn);
    for (const r of fns) {
      if (!r.state.points) continue;
      const f = r.compiled.fn!;
      const roots = findRoots(f, xmin, xmax, 600);
      for (const x of roots) add(x, 0, 'root', r.color);
      for (const e of findExtrema(f, xmin, xmax, 600, r.compiled.dfn)) add(e.x, e.y, e.kind, r.color);
      if (xmin < 0 && xmax > 0 && !roots.includes(0)) add(0, f(0), 'y-intercept', r.color);
    }
    for (let i = 0; i < fns.length; i++) {
      for (let j = i + 1; j < fns.length; j++) {
        if (!fns[i].state.points && !fns[j].state.points) continue;
        const f = fns[i].compiled.fn!;
        for (const x of findIntersections(f, fns[j].compiled.fn!, xmin, xmax, 600)) add(x, f(x), 'intersection', this.palette.text);
      }
    }
    return out.slice(0, 200);
  }

  // ─── Animation des curseurs ───────────────────────────────────────────────

  private animate(t: number): void {
    const dt = Math.min(0.1, (t - this.animLast) / 1000);
    this.animLast = t;
    for (const [id, a] of this.animating) {
      const row = this.row(id);
      if (!row?.slider) {
        this.animating.delete(id);
        continue;
      }
      const { min, max } = row.slider;
      a.value += (a.dir * (max - min) * dt) / 6;
      if (a.value >= max) {
        a.value = max;
        a.dir = -1;
      } else if (a.value <= min) {
        a.value = min;
        a.dir = 1;
      }
      this.setSlider(id, a.value);
    }
    this.animFrame = this.animating.size ? requestAnimationFrame((n) => this.animate(n)) : 0;
  }

  // ─── Interactions ─────────────────────────────────────────────────────────

  private bindCanvas(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    c.addEventListener('pointermove', (e) => this.onPointerMove(e));
    c.addEventListener('pointerup', (e) => this.onPointerUp(e));
    c.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    c.addEventListener('pointerleave', () => {
      if (!this.pointers.size) this.setHover(null, null);
      this.readout.hidden = true;
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const pos = this.local(e);
      const speed = e.deltaMode === 1 ? 0.05 : 0.0015;
      this.vp.zoomAt(pos.x, pos.y, Math.exp(-e.deltaY * speed));
      this.viewChanged();
    }, { passive: false });
    c.addEventListener('keydown', (e) => {
      const step = 40;
      const actions: Record<string, () => void> = {
        ArrowLeft: () => this.vp.pan(step, 0),
        ArrowRight: () => this.vp.pan(-step, 0),
        ArrowUp: () => this.vp.pan(0, step),
        ArrowDown: () => this.vp.pan(0, -step),
        '+': () => this.vp.zoomAt(this.vp.width / 2, this.vp.height / 2, 1.25),
        '=': () => this.vp.zoomAt(this.vp.width / 2, this.vp.height / 2, 1.25),
        '-': () => this.vp.zoomAt(this.vp.width / 2, this.vp.height / 2, 0.8),
        '0': () => this.resetView(),
      };
      const action = actions[e.key];
      if (action) {
        e.preventDefault();
        action();
        this.viewChanged();
      }
    });
  }

  private local(e: MouseEvent): Pos {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Poignée (tangente, bornes d'intégrale) sous le pointeur. */
  private hitHandle(pos: Pos): Drag | null {
    const tol = (isPresenting() ? 18 : 12) + 4;
    for (const r of this.sceneRows()) {
      const { state: st, compiled: c } = r;
      if (st.hidden || c.kind !== 'function' || !c.fn) continue;
      if (st.tangent !== undefined) {
        const y = c.fn(st.tangent);
        if (Number.isFinite(y) && Math.hypot(this.vp.xToPx(st.tangent) - pos.x, this.vp.yToPx(y) - pos.y) < tol) return { kind: 'tangent', id: st.id };
      }
      if (st.integral) {
        const zero = Math.min(Math.max(this.vp.yToPx(0), 20), this.vp.height - 20);
        for (const [i, kind] of [[0, 'intA'], [1, 'intB']] as const) {
          if (Math.hypot(this.vp.xToPx(st.integral[i]) - pos.x, zero - pos.y) < tol) return { kind, id: st.id };
        }
      }
    }
    return null;
  }

  private onPointerDown(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.focus({ preventScroll: true });
    const pos = this.local(e);
    this.pointers.set(e.pointerId, pos);
    this.downPos = pos;
    this.moved = false;
    if (this.pointers.size === 2) {
      this.drag = null;
      return;
    }
    this.drag = this.hitHandle(pos) ?? { kind: 'pan' };
    this.canvas.style.cursor = this.drag.kind === 'pan' ? 'grabbing' : 'ew-resize';
  }

  private onPointerMove(e: PointerEvent): void {
    const pos = this.local(e);
    const prev = this.pointers.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === 'mouse') this.updateHover(pos);
      return;
    }
    this.pointers.set(e.pointerId, pos);
    if (this.downPos && Math.hypot(pos.x - this.downPos.x, pos.y - this.downPos.y) > 3) this.moved = true;

    if (this.pointers.size === 2) {
      // Pincement : zoom autour du milieu des deux doigts + déplacement.
      const [a, b] = [...this.pointers.values()];
      const other = [...this.pointers.entries()].find(([id]) => id !== e.pointerId)![1];
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      this.vp.pan((pos.x - prev.x) / 2, (pos.y - prev.y) / 2);
      if (before > 10) this.vp.zoomAt(cx, cy, after / before);
      this.viewChanged();
      return;
    }
    const drag = this.drag;
    if (!drag) return;
    if (drag.kind === 'pan') {
      this.vp.pan(pos.x - prev.x, pos.y - prev.y);
      this.setHover(null, null);
      this.viewChanged();
      return;
    }
    const row = this.row(drag.id);
    if (!row) return;
    const step = niceStep(4 / this.vp.scaleX) / 2;
    const x = Number((Math.round(this.vp.pxToX(pos.x) / step) * step).toPrecision(10));
    if (drag.kind === 'tangent') row.tangent = x;
    else if (row.integral) row.integral = drag.kind === 'intA' ? [x, row.integral[1]] : [row.integral[0], x];
    this.dirty = true;
    this.views.get(drag.id)?.update(row, this.compiledOf(drag.id), this.state.rows.indexOf(row));
    this.invalidate();
    this.ctx.notifyStateChange();
  }

  private onPointerUp(e: PointerEvent): void {
    const wasClick = !this.moved && this.drag?.kind === 'pan' && this.pointers.size === 1;
    this.pointers.delete(e.pointerId);
    if (wasClick && this.downPos) this.togglePin(this.downPos);
    if (!this.pointers.size) {
      this.drag = null;
      this.canvas.style.cursor = '';
    }
  }

  private nearestPoint(pos: Pos, radius: number): ScenePoint | null {
    let best: ScenePoint | null = null;
    let bestD = radius;
    for (const p of this.points) {
      const d = Math.hypot(this.vp.xToPx(p.x) - pos.x, this.vp.yToPx(p.y) - pos.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  private togglePin(pos: Pos): void {
    const p = this.nearestPoint(pos, 14);
    if (!p) return;
    if (this.pinned.has(p.key)) this.pinned.delete(p.key);
    else this.pinned.add(p.key);
    this.invalidate();
  }

  private updateHover(pos: Pos): void {
    const step = niceStep(1 / this.vp.scaleX);
    const digits = Math.max(0, -Math.floor(Math.log10(step)));
    const round = (v: number) => fmt(Number(v.toFixed(Math.min(digits, 10))), 8);
    this.readout.textContent = `x = ${round(this.vp.pxToX(pos.x))}   y = ${round(this.vp.pxToY(pos.y))}`;
    this.readout.hidden = false;
    const handle = this.hitHandle(pos);
    this.canvas.style.cursor = handle ? 'ew-resize' : '';
    const point = this.nearestPoint(pos, 12);
    if (point) {
      this.canvas.style.cursor = 'pointer';
      this.setHover(null, pos, `<b>${POINT_LABELS[point.kind]}</b><br>${fmtPoint(point.x, point.y, 6)}`);
      return;
    }
    // Courbe cartésienne la plus proche verticalement.
    const x = this.vp.pxToX(pos.x);
    let best: { y: number; color: string; name: string } | null = null;
    let bestD = 14;
    for (const r of this.sceneRows()) {
      if (r.state.hidden || r.compiled.kind !== 'function' || !r.compiled.fn) continue;
      const y = r.compiled.fn(x);
      if (!Number.isFinite(y)) continue;
      const d = Math.abs(this.vp.yToPx(y) - pos.y);
      if (d < bestD) {
        bestD = d;
        best = { y, color: r.color, name: r.compiled.name ?? '' };
      }
    }
    if (best) {
      const label = best.name ? `${best.name}(${fmt(x, 5)}) = ${fmt(best.y, 6)}` : fmtPoint(x, best.y, 6);
      this.setHover({ x, y: best.y, color: best.color }, pos, label);
    } else {
      this.setHover(null, null);
    }
  }

  private setHover(hover: Scene['hover'], pos: Pos | null, html = ''): void {
    const changed = (hover?.x ?? null) !== (this.hover?.x ?? null) || (hover?.y ?? null) !== (this.hover?.y ?? null);
    this.hover = hover;
    if (!pos || !html) {
      this.tooltip.hidden = true;
    } else {
      this.tooltip.innerHTML = html;
      this.tooltip.hidden = false;
      const w = this.tooltip.offsetWidth;
      const left = pos.x + 16 + w > this.vp.width ? pos.x - 16 - w : pos.x + 16;
      const top = pos.y + 16 + 40 > this.vp.height ? pos.y - 50 : pos.y + 16;
      this.tooltip.style.transform = `translate(${left}px, ${top}px)`;
    }
    if (changed) this.invalidate();
  }
}
