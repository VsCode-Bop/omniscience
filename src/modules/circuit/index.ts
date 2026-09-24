/**
 * Module « Simulateur de circuits » : éditeur sur grille + simulation temps réel.
 */
import './circuit.css';
import { clear, h, svgIcon } from '../../core/dom';
import { canvasToBlob } from '../../core/export/download';
import { CanvasPainter, fitCanvas } from '../../core/graphics/canvas-painter';
import { SvgPainter } from '../../core/graphics/svg-painter';
import { icon } from '../../core/icons';
import { fmtSI, parseSI } from '../../core/math/format';
import type { ModuleContext, ModuleInstance } from '../../core/types';
import { EXAMPLES } from './examples';
import { CATALOG, defaultProps, labelElements, LED_COLORS, type PropSpec } from './model/catalog';
import { sanitizeCircuit } from './model/state';
import type { CircuitState, CurrentDisplay, ElementData, ElementType, PropValue, ScopeChannel } from './model/types';
import { CURRENT_THRESHOLD, currentVisible, drawCircuit, readCircuitPalette, shownCurrent, type CircuitPalette, type SceneInput } from './render/scene';
import { distanceToElement, GRID } from './render/symbols';
import { Simulator, type ElementState } from './solver/simulator';
import { buildPalette, shortName, type Tool } from './ui/palette';
import { Scope } from './ui/scope';

export function mount(container: HTMLElement, ctx: ModuleContext): ModuleInstance {
  return new CircuitApp(container, ctx);
}

const SPEEDS: [number, string][] = [
  [1e-5, '10 µs / s'],
  [1e-4, '100 µs / s'],
  [1e-3, '1 ms / s'],
  [1e-2, '10 ms / s'],
  [0.1, '100 ms / s'],
  [1, '1 s / s (temps réel)'],
];
const CURRENT_MODES: [CurrentDisplay, string][] = [
  ['both', 'Courant : les deux'],
  ['conventional', 'Sens conventionnel'],
  ['electrons', 'Électrons'],
  ['none', 'Courant masqué'],
];
const STEPS_PER_FRAME = 100;
const isPresenting = () => document.documentElement.classList.contains('is-presenting');

/** Tension « lisible » : convention générateur pour les sources (V+ − V−). */
function displayVoltage(el: ElementData, st: ElementState): number {
  return el.type === 'battery' || el.type === 'acsource' || el.type === 'isource' ? -st.v : st.v;
}

/** Vitesse d'animation (unités de dessin / s) : croissante avec |I|, échelle logarithmique. */
function animationSpeed(i: number): number {
  const a = Math.abs(i);
  if (a < CURRENT_THRESHOLD) return 0;
  return Math.sign(i) * Math.min(260, 48 * Math.log10(1 + a / 1e-4));
}

type Drag =
  | { kind: 'pan' }
  | { kind: 'node'; x: number; y: number; ends: [ElementData, 1 | 2][]; moved: boolean; before: string }
  | { kind: 'element'; el: ElementData; gx: number; gy: number; orig: [number, number, number, number]; moved: boolean; before: string }
  | { kind: 'place'; x: number; y: number };

interface Pos {
  x: number;
  y: number;
}

class CircuitApp implements ModuleInstance {
  private state: CircuitState;
  private readonly sim: Simulator;
  private labels = new Map<string, string>();
  private pal: CircuitPalette = readCircuitPalette();
  private readonly cam = { x: -100, y: -60, zoom: 1.3 };
  private tool: Tool = 'select';
  private selectedId: string | null = null;
  private hoverId: string | null = null;
  private hoverPoint: Pos | null = null;
  private preview: ElementData | null = null;
  private running = true;
  private readonly phases = new Map<string, number>();
  private readonly angles = new Map<string, number>();
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private readonly pointers = new Map<number, Pos>();
  private drag: Drag | null = null;
  private frame = 0;
  private lastFrame = 0;
  private lastPanelUpdate = 0;
  private sized = false;
  private slowed = false;
  private hint = '';
  private collapsedForPresentation = false;
  private liveUpdaters: (() => void)[] = [];

  private readonly root: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly banner: HTMLElement;
  private readonly tooltip: HTMLElement;
  private readonly side: HTMLElement;
  private readonly scope: Scope;
  private readonly playBtn: HTMLButtonElement;
  private readonly currentSelect: HTMLSelectElement;
  private readonly palette: ReturnType<typeof buildPalette>;
  private readonly resizeObserver: ResizeObserver;
  private readonly onKey = (e: KeyboardEvent) => this.handleKey(e);

  constructor(container: HTMLElement, private readonly ctx: ModuleContext) {
    const shared = sanitizeCircuit(ctx.initialState);
    this.state = shared ?? EXAMPLES[0].make();
    if (!shared) this.hint = EXAMPLES[0].hint;

    this.sim = new Simulator(this.state.elements);
    this.sim.onStep = () => this.recordScope();

    // ── Palette ──
    this.palette = buildPalette((tool) => this.setTool(tool));

    // ── Scène ──
    this.canvas = h('canvas', { class: 'main-canvas', tabindex: '0', 'aria-label': 'Schéma du circuit' });
    this.banner = h('div', { class: 'circuit-banner', hidden: true, role: 'status' });
    this.tooltip = h('div', { class: 'tooltip', hidden: true });
    this.playBtn = h('button', { class: 'btn btn-icon', onclick: () => this.togglePlay() });
    this.currentSelect = h('select', { class: 'select', 'aria-label': 'Affichage du courant' },
      ...CURRENT_MODES.map(([v, label]) => h('option', { value: v }, label)),
    );
    this.currentSelect.addEventListener('change', () => {
      this.state.opts.current = this.currentSelect.value as CurrentDisplay;
      this.changed(false);
    });
    this.scope = new Scope((i) => this.setScope(i, null));
    this.applySpeed();
    const view = h('div', { class: 'circuit-view' },
      this.canvas,
      h('div', { class: 'stage-toolbar top-left' },
        this.playBtn,
        h('button', { class: 'btn btn-icon', title: 'Réinitialiser (t = 0, condensateurs déchargés)', 'aria-label': 'Réinitialiser la simulation', onclick: () => this.resetSim() }, svgIcon(icon('reset'))),
        h('span', { class: 'sep' }),
        this.currentSelect,
      ),
      h('div', { class: 'stage-toolbar top-right' },
        h('button', { class: 'btn btn-icon', title: 'Annuler (Ctrl+Z)', 'aria-label': 'Annuler', onclick: () => this.undo() }, svgIcon(icon('undo'))),
        h('button', { class: 'btn btn-icon', title: 'Rétablir (Ctrl+Y)', 'aria-label': 'Rétablir', onclick: () => this.redo() }, svgIcon(icon('redo'))),
        h('span', { class: 'sep' }),
        h('button', { class: 'btn btn-icon', title: 'Zoom avant', 'aria-label': 'Zoom avant', onclick: () => this.zoomBy(1.25) }, svgIcon(icon('zoomIn'))),
        h('button', { class: 'btn btn-icon', title: 'Zoom arrière', 'aria-label': 'Zoom arrière', onclick: () => this.zoomBy(0.8) }, svgIcon(icon('zoomOut'))),
        h('button', { class: 'btn btn-icon', title: 'Cadrer le circuit', 'aria-label': 'Cadrer le circuit', onclick: () => this.fit() }, svgIcon(icon('maximize'))),
      ),
      this.banner,
      this.tooltip,
    );
    this.stage = h('div', { class: 'stage circuit-stage' }, view, this.scope.el);

    this.side = h('aside', { class: 'panel circuit-side', 'aria-label': 'Propriétés' });
    this.root = h('div', { class: 'workspace circuit' }, this.palette.el, this.stage, this.side);
    container.appendChild(this.root);

    this.palette.setActive(this.tool);
    this.relabel();
    this.syncToolbar();
    this.renderSide();
    this.updateScopeLegend();
    this.bindCanvas();
    window.addEventListener('keydown', this.onKey);
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(view);
    this.sim.step();
    this.frame = requestAnimationFrame((t) => this.loop(t));
    if (isPresenting()) this.refresh();
    // Point d'accès pour les tests de bout en bout (serveur de développement uniquement).
    if (import.meta.env.DEV) (window as unknown as { __omniCircuit?: unknown }).__omniCircuit = this;
  }

  // ─── Cycle de vie ─────────────────────────────────────────────────────────

  getState(): CircuitState {
    return this.state;
  }

  refresh(): void {
    this.pal = readCircuitPalette();
    const presenting = isPresenting();
    if (presenting && !this.root.classList.contains('panels-hidden')) {
      this.root.classList.add('panels-hidden');
      this.collapsedForPresentation = true;
    } else if (!presenting && this.collapsedForPresentation) {
      this.root.classList.remove('panels-hidden');
      this.collapsedForPresentation = false;
    }
    requestAnimationFrame(() => this.fit());
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }

  async exportPNG(): Promise<Blob> {
    const [x0, y0, w, hgt] = this.bounds(50, 130);
    const scale = 2;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * scale);
    c.height = Math.ceil(hgt * scale);
    const g = c.getContext('2d')!;
    g.fillStyle = this.pal.bg;
    g.fillRect(0, 0, c.width, c.height);
    g.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);
    drawCircuit(new CanvasPainter(g), this.sceneInput(null, 1), this.pal);
    return canvasToBlob(c);
  }

  exportSVG(): string {
    const [x0, y0, w, hgt] = this.bounds(50, 130);
    const p = new SvgPainter();
    drawCircuit(p, this.sceneInput(null, 1), this.pal);
    return p.toSVG(w, hgt, this.pal.bg, [x0, y0, w, hgt]);
  }

  // ─── Boucle d'animation ───────────────────────────────────────────────────

  private loop(t: number): void {
    const dtReal = this.lastFrame ? Math.min(0.1, (t - this.lastFrame) / 1000) : 0;
    this.lastFrame = t;
    if (this.running) {
      if (this.sim.hasDynamics) {
        this.slowed = this.sim.advance(this.state.opts.speed * dtReal, 12).slowed;
      } else {
        this.sim.step();
        this.slowed = false;
      }
      for (const el of this.state.elements) {
        const st = this.sim.states.get(el.id);
        if (!st) continue;
        const v = animationSpeed(st.i);
        if (v) this.phases.set(el.id, ((this.phases.get(el.id) ?? 0) + v * dtReal) % 7040);
        if (el.type === 'motor') this.angles.set(el.id, (this.angles.get(el.id) ?? 0) + Math.max(-40, Math.min(40, st.i * 60)) * dtReal);
      }
    }
    this.render();
    this.scope.render(this.sim.time, this.state.scope);
    if (t - this.lastPanelUpdate > 150) {
      this.lastPanelUpdate = t;
      this.liveUpdaters.forEach((u) => u());
      this.updateBanner();
    }
    this.frame = requestAnimationFrame((n) => this.loop(n));
  }

  private applySpeed(): void {
    this.sim.dt = Math.min(1e-3, this.state.opts.speed / 60 / STEPS_PER_FRAME);
    this.scope.window = this.state.opts.speed * 4;
    this.scope.clear();
  }

  private recordScope(): void {
    const [c0, c1] = this.state.scope;
    const value = (c: ScopeChannel | null | undefined) => {
      if (!c) return Number.NaN;
      const el = this.state.elements.find((e) => e.id === c.id);
      const st = this.sim.states.get(c.id);
      if (!el || !st) return Number.NaN;
      return c.q === 'v' ? displayVoltage(el, st) : st.i;
    };
    this.scope.record(this.sim.time, value(c0), value(c1));
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────

  private sceneInput(view: SceneInput['view'], scale: number): SceneInput {
    const flagged = new Set<string>();
    const blink = Math.floor(performance.now() / 450) % 2 === 0;
    for (const issue of this.sim.issues) {
      if ((issue.kind === 'short' || issue.kind === 'source-loop') && (blink || !view)) issue.ids.forEach((id) => flagged.add(id));
    }
    return {
      elements: this.state.elements,
      states: this.sim.states,
      opts: this.state.opts,
      labels: this.labels,
      selectedId: view ? this.selectedId : null,
      hoverId: view ? this.hoverId : null,
      flagged,
      phases: this.phases,
      angles: this.angles,
      pointVoltage: (x, y) => this.sim.pointVoltage(x, y),
      view,
      preview: view ? this.preview : null,
      hoverPoint: view ? this.hoverPoint : null,
      scale,
    };
  }

  private render(): void {
    if (!this.sized) return;
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    const g = fitCanvas(this.canvas, W, H);
    const dpr = this.canvas.width / W;
    g.fillStyle = this.pal.bg;
    g.fillRect(0, 0, W, H);
    const { x, y, zoom } = this.cam;
    g.setTransform(dpr * zoom, 0, 0, dpr * zoom, -x * zoom * dpr, -y * zoom * dpr);
    const view = { x0: x, y0: y, x1: x + W / zoom, y1: y + H / zoom };
    drawCircuit(new CanvasPainter(g), this.sceneInput(view, isPresenting() ? 1.2 : 1), this.pal);
  }

  /** Rectangle englobant le circuit (unités de dessin) : [x, y, largeur, hauteur]. */
  private bounds(margin: number, labelRoom = 0): [number, number, number, number] {
    const els = this.state.elements;
    if (!els.length) return [0, 0, 400, 300];
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const el of els) {
      for (const [x, y] of [[el.x1, el.y1], [el.x2, el.y2]]) {
        x0 = Math.min(x0, x * GRID);
        y0 = Math.min(y0, y * GRID);
        x1 = Math.max(x1, x * GRID);
        y1 = Math.max(y1, y * GRID);
      }
    }
    // Place supplémentaire à droite pour les étiquettes des composants verticaux.
    return [x0 - margin, y0 - margin, x1 - x0 + 2 * margin + labelRoom, y1 - y0 + 2 * margin];
  }

  private fit(): void {
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    if (W < 10 || H < 10) return;
    const [x0, y0, w, hgt] = this.bounds(80, 130);
    const zoom = Math.max(0.4, Math.min(isPresenting() ? 2.2 : 1.7, W / w, H / hgt));
    this.cam.zoom = zoom;
    this.cam.x = x0 + w / 2 - W / zoom / 2;
    this.cam.y = y0 + hgt / 2 - H / zoom / 2;
  }

  private onResize(): void {
    if (this.canvas.clientWidth < 10 || this.canvas.clientHeight < 10) return;
    if (!this.sized) {
      this.sized = true;
      this.fit();
    }
    this.render();
  }

  private zoomBy(f: number, sx = this.canvas.clientWidth / 2, sy = this.canvas.clientHeight / 2): void {
    const wx = this.cam.x + sx / this.cam.zoom;
    const wy = this.cam.y + sy / this.cam.zoom;
    this.cam.zoom = Math.max(0.3, Math.min(5, this.cam.zoom * f));
    this.cam.x = wx - sx / this.cam.zoom;
    this.cam.y = wy - sy / this.cam.zoom;
  }

  // ─── Modifications du circuit ─────────────────────────────────────────────

  private snapshot(): string {
    return JSON.stringify(this.state.elements);
  }

  private pushHistory(before = this.snapshot()): void {
    this.undoStack.push(before);
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
  }

  private undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.snapshot());
    this.state.elements = JSON.parse(prev) as ElementData[];
    this.elementsChanged();
  }

  private redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.snapshot());
    this.state.elements = JSON.parse(next) as ElementData[];
    this.elementsChanged();
  }

  private relabel(): void {
    this.labels = labelElements(this.state.elements);
  }

  /** À appeler après toute modification de la liste des composants. */
  private elementsChanged(): void {
    this.splitWires();
    const ids = new Set(this.state.elements.map((e) => e.id));
    if (this.selectedId && !ids.has(this.selectedId)) this.selectedId = null;
    this.state.scope = this.state.scope.map((c) => (c && ids.has(c.id) ? c : null));
    this.sim.setElements(this.state.elements);
    this.relabel();
    if (!this.running || !this.sim.hasDynamics) this.sim.step();
    this.renderSide();
    this.updateScopeLegend();
    this.changed(false);
  }

  private changed(renderSide: boolean): void {
    if (renderSide) this.renderSide();
    this.syncToolbar();
    this.ctx.notifyStateChange();
  }

  private nextId(): string {
    let n = this.state.elements.length + 1;
    const ids = new Set(this.state.elements.map((e) => e.id));
    while (ids.has(`e${n}`)) n++;
    return `e${n}`;
  }

  /**
   * Raccordements en T : un point de connexion situé à l'intérieur d'un fil coupe
   * ce fil en deux, ce qui relie électriquement la dérivation.
   */
  private splitWires(): void {
    for (let pass = 0; pass < 50; pass++) {
      const points = new Set<string>();
      for (const e of this.state.elements) {
        points.add(`${e.x1},${e.y1}`);
        if (e.type !== 'ground') points.add(`${e.x2},${e.y2}`);
      }
      let split = false;
      for (const w of this.state.elements) {
        if (w.type !== 'wire') continue;
        const dx = w.x2 - w.x1;
        const dy = w.y2 - w.y1;
        const n = Math.max(Math.abs(dx), Math.abs(dy));
        for (let k = 1; k < n && !split; k++) {
          const px = w.x1 + (dx * k) / n;
          const py = w.y1 + (dy * k) / n;
          if (!Number.isInteger(px) || !Number.isInteger(py) || !points.has(`${px},${py}`)) continue;
          const rest: ElementData = { id: this.nextId(), type: 'wire', x1: px, y1: py, x2: w.x2, y2: w.y2, props: {} };
          w.x2 = px;
          w.y2 = py;
          this.state.elements.push(rest);
          split = true;
        }
        if (split) break;
      }
      if (!split) return;
    }
  }

  private addElement(type: ElementType, x1: number, y1: number, x2: number, y2: number): ElementData {
    this.pushHistory();
    const el: ElementData = { id: this.nextId(), type, x1, y1, x2, y2, props: defaultProps(type) };
    this.state.elements.push(el);
    this.elementsChanged();
    return el;
  }

  private deleteSelected(): void {
    if (!this.selectedId) return;
    this.pushHistory();
    this.state.elements = this.state.elements.filter((e) => e.id !== this.selectedId);
    this.selectedId = null;
    this.elementsChanged();
  }

  private rotateSelected(): void {
    const el = this.selected();
    if (!el || el.type === 'ground') return;
    this.pushHistory();
    const mx = (el.x1 + el.x2) / 2;
    const my = (el.y1 + el.y2) / 2;
    const hx = (el.x2 - el.x1) / 2;
    const hy = (el.y2 - el.y1) / 2;
    el.x1 = Math.round(mx + hy);
    el.y1 = Math.round(my - hx);
    el.x2 = Math.round(mx - hy);
    el.y2 = Math.round(my + hx);
    this.elementsChanged();
  }

  private flipSelected(): void {
    const el = this.selected();
    if (!el || el.type === 'ground') return;
    this.pushHistory();
    [el.x1, el.y1, el.x2, el.y2] = [el.x2, el.y2, el.x1, el.y1];
    this.elementsChanged();
  }

  private setProp(el: ElementData, key: string, value: PropValue): void {
    if (el.props[key] === value) return;
    this.pushHistory();
    el.props[key] = value;
    if (el.type === 'capacitor' && key === 'v0') this.sim.reset();
    this.elementsChanged();
  }

  private selected(): ElementData | undefined {
    return this.state.elements.find((e) => e.id === this.selectedId);
  }

  private select(id: string | null): void {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.renderSide();
  }

  // ─── Simulation ───────────────────────────────────────────────────────────

  private togglePlay(): void {
    this.running = !this.running;
    this.syncToolbar();
  }

  private resetSim(): void {
    this.sim.reset();
    this.scope.clear();
    this.phases.clear();
    this.sim.step();
    this.renderSide();
  }

  private setScope(index: number, channel: ScopeChannel | null): void {
    this.state.scope[index] = channel;
    this.scope.clear();
    this.updateScopeLegend();
    this.changed(true);
  }

  private updateScopeLegend(): void {
    this.scope.setLegend(this.state.scope.map((c) => (c ? { channel: c, label: this.labels.get(c.id) ?? '?' } : null)));
  }

  private setTool(tool: Tool): void {
    this.tool = tool;
    this.palette.setActive(tool);
    this.preview = null;
    this.canvas.style.cursor = tool === 'select' ? '' : 'crosshair';
    if (tool !== 'select') {
      this.select(null);
      this.hint = `${CATALOG[tool].name} : glissez sur la grille d'un point à un autre (ou cliquez pour un composant horizontal).`;
      this.updateBanner();
    } else if (this.hint.includes('glissez sur la grille')) {
      this.hint = '';
      this.updateBanner();
    }
  }

  private syncToolbar(): void {
    clear(this.playBtn);
    this.playBtn.append(svgIcon(icon(this.running ? 'pause' : 'play')));
    this.playBtn.title = this.running ? 'Pause (Espace)' : 'Lecture (Espace)';
    this.playBtn.setAttribute('aria-label', this.playBtn.title);
    this.currentSelect.value = this.state.opts.current;
  }

  private updateBanner(): void {
    const issues = this.sim.issues.filter((i) => i.kind !== 'convergence' || this.sim.issues.length === 1);
    const main = issues[0];
    this.banner.className = 'circuit-banner';
    if (main) {
      this.banner.classList.add(main.kind === 'burnt' || main.kind === 'convergence' ? 'is-warning' : 'is-danger');
      this.banner.textContent = `⚠ ${main.message}`;
      this.banner.hidden = false;
    } else if (this.slowed) {
      this.banner.classList.add('is-info');
      this.banner.textContent = 'Simulation ralentie : réduisez la vitesse pour une animation fluide.';
      this.banner.hidden = false;
    } else if (this.hint) {
      this.banner.classList.add('is-info');
      this.banner.replaceChildren(h('span', null, this.hint),
        h('button', { class: 'banner-close', 'aria-label': 'Masquer', onclick: () => { this.hint = ''; this.updateBanner(); } }, '×'));
      this.banner.hidden = false;
    } else {
      this.banner.hidden = true;
    }
  }

  // ─── Panneau latéral : circuit ou composant sélectionné ───────────────────

  private renderSide(): void {
    this.liveUpdaters = [];
    const el = this.selected();
    clear(this.side);
    if (el) this.renderElementPanel(el);
    else this.renderCircuitPanel();
  }

  private live(fn: () => string): HTMLElement {
    const span = h('span', { class: 'live' });
    const update = () => (span.textContent = fn());
    update();
    this.liveUpdaters.push(update);
    return span;
  }

  private renderCircuitPanel(): void {
    const opts = this.state.opts;
    const check = (label: string, key: 'values' | 'measures' | 'potentials') => {
      const input = h('input', { type: 'checkbox', checked: opts[key] });
      input.addEventListener('change', () => {
        opts[key] = input.checked;
        this.changed(false);
      });
      return h('label', { class: 'check' }, input, label);
    };
    const speed = h('select', { class: 'select', 'aria-label': 'Vitesse de simulation' },
      ...SPEEDS.map(([v, label]) => h('option', { value: String(v) }, label)),
    );
    speed.value = String(SPEEDS.reduce((best, [v]) => (Math.abs(Math.log(v / opts.speed)) < Math.abs(Math.log(best / opts.speed)) ? v : best), SPEEDS[0][0]));
    speed.addEventListener('change', () => {
      opts.speed = Number(speed.value);
      this.applySpeed();
      this.changed(false);
    });
    const examples = h('select', { class: 'select', 'aria-label': 'Charger un exemple' },
      h('option', { value: '' }, 'Exemples…'),
      ...EXAMPLES.map((ex, i) => h('option', { value: String(i) }, `${ex.title} — ${ex.level}`)),
    );
    examples.addEventListener('change', () => this.loadExample(Number(examples.value)));

    this.side.append(
      h('section', { class: 'panel-section' },
        h('div', { class: 'panel-title' }, 'Simulation'),
        h('div', { class: 'kv' }, h('span', null, 'Temps simulé'), this.live(() => fmtSI(this.sim.time, 's'))),
        h('label', { class: 'field' }, h('span', null, 'Vitesse (temps simulé par seconde)'), speed),
      ),
      h('section', { class: 'panel-section' },
        h('div', { class: 'panel-title' }, 'Affichage'),
        h('div', { class: 'legend-current' },
          h('span', null, h('i', { class: 'legend-arrow' }), 'Sens conventionnel (+ → −)'),
          h('span', null, h('i', { class: 'legend-electron' }), 'Électrons (− → +)'),
        ),
        check('Noms et valeurs des composants', 'values'),
        check('Tension et intensité de chaque dipôle', 'measures'),
        check('Couleur selon le potentiel', 'potentials'),
      ),
      h('section', { class: 'panel-section' },
        h('div', { class: 'panel-title' }, 'Circuits'),
        examples,
        h('button', { class: 'btn btn-danger btn-block', onclick: () => this.clearAll() }, svgIcon(icon('trash')), 'Tout effacer'),
      ),
      h('details', { class: 'panel-section help', open: this.state.elements.length < 3 },
        h('summary', null, 'Mode d\'emploi'),
        h('ul', null,
          h('li', null, 'Choisissez un composant dans la palette puis ', h('b', null, 'glissez'), ' sur la grille entre ses deux bornes.'),
          h('li', null, 'Un fil qui arrive au milieu d\'un autre fil s\'y raccorde automatiquement.'),
          h('li', null, 'Glissez un nœud pour le déplacer avec tous ses fils ; cliquez sur un interrupteur pour le basculer.'),
          h('li', null, 'Survolez un nœud : potentiel et loi des nœuds. Survolez un dipôle : U et I.'),
          h('li', null, 'Clavier : lettre de la palette = outil, ', h('kbd', null, 'Maj+R'), ' pivoter, ', h('kbd', null, 'Maj+F'), ' inverser, ', h('kbd', null, 'Suppr'), ' effacer, ', h('kbd', null, 'Espace'), ' pause, ', h('kbd', null, 'Ctrl+Z'), ' annuler.'),
        ),
        h('p', { class: 'muted' }, 'La vitesse d\'animation des électrons est proportionnelle au logarithme de l\'intensité ; dans un vrai fil, les électrons avancent de quelques millimètres par seconde seulement.'),
      ),
    );
  }

  private renderElementPanel(el: ElementData): void {
    const spec = CATALOG[el.type];
    const st = () => this.sim.states.get(el.id);
    const name = this.labels.get(el.id);

    const header = h('section', { class: 'panel-section' },
      h('div', { class: 'panel-title' }, name ? `${name} · ${shortName(el.type)}` : shortName(el.type),
        h('button', { class: 'btn btn-small btn-ghost', onclick: () => this.select(null) }, 'Circuit ›'),
      ),
      h('h3', null, spec.name),
      h('p', { class: 'muted small' }, spec.description),
    );

    const fields = spec.props.map((p) => this.propField(el, p));

    const meters = h('section', { class: 'panel-section multimeter' },
      h('div', { class: 'panel-title' }, 'Multimètre'),
      h('div', { class: 'meter-grid' },
        h('span', null, 'U'), this.live(() => {
          const s = st();
          return !s || Number.isNaN(s.v) ? '—' : fmtSI(displayVoltage(el, s), 'V', 4);
        }),
        h('span', null, 'I'), this.live(() => (st() ? fmtSI(shownCurrent(st()!.i), 'A', 4) : '—')),
        h('span', null, 'P'), this.live(() => {
          const s = st();
          if (!s || el.type === 'voltmeter' || el.type === 'ammeter' || el.type === 'wire') return '—';
          const p = displayVoltage(el, s) * s.i;
          return `${fmtSI(Math.abs(p), 'W', 3)}${el.type === 'battery' || el.type === 'acsource' || el.type === 'isource' ? (p > 0 ? ' fournie' : p < 0 ? ' reçue' : '') : ''}`;
        }),
      ),
      h('p', { class: 'muted small' }, this.live(() => this.stateText(el, st()))),
    );

    const actions = h('section', { class: 'panel-section' },
      h('div', { class: 'panel-title' }, 'Actions'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', onclick: () => this.rotateSelected(), disabled: el.type === 'ground' }, svgIcon(icon('rotate')), 'Pivoter'),
        h('button', { class: 'btn', onclick: () => this.flipSelected(), disabled: el.type === 'ground' }, svgIcon(icon('flip')), 'Inverser'),
        h('button', { class: 'btn btn-danger', onclick: () => this.deleteSelected() }, svgIcon(icon('trash')), 'Supprimer'),
      ),
      st()?.burnt
        ? h('button', { class: 'btn btn-primary btn-block', onclick: () => { this.sim.repair(el.id); this.sim.step(); this.renderSide(); } }, 'Remplacer le composant grillé')
        : null,
    );

    const scopeButtons = el.type === 'ground' ? null : h('section', { class: 'panel-section' },
      h('div', { class: 'panel-title' }, 'Oscilloscope'),
      h('div', { class: 'btn-row' },
        ...[0, 1].flatMap((i) => (['v', 'i'] as const).map((q) =>
          h('button', {
            class: `btn btn-small${this.state.scope[i]?.id === el.id && this.state.scope[i]?.q === q ? ' is-active' : ''}`,
            onclick: () => this.setScope(i, { id: el.id, q }),
          }, `${q === 'v' ? 'U' : 'I'} → voie ${i + 1}`),
        )),
      ),
    );

    this.side.append(header, ...(fields.length ? [h('section', { class: 'panel-section fields' }, ...fields)] : []), meters, actions, ...(scopeButtons ? [scopeButtons] : []));
    // Le composant grille ou est remplacé : on reconstruit le panneau (bouton « Remplacer »).
    const burnt = !!st()?.burnt;
    this.liveUpdaters.push(() => {
      if (!!st()?.burnt !== burnt) this.renderSide();
    });
  }

  private stateText(el: ElementData, st: ElementState | undefined): string {
    if (!st) return '';
    if (st.burnt) return 'Composant grillé : le circuit est ouvert à cet endroit.';
    switch (el.type) {
      case 'lamp':
        return st.glow < 0.05 ? 'Éteinte' : `Éclairement : ${Math.round(Math.min(st.glow, 2.2) * 100)} % de la puissance nominale${st.glow > 1.3 ? ' — surtension !' : ''}`;
      case 'led':
        return st.i > 1e-4 ? `Allumée (${LED_COLORS[String(el.props.color)]?.label.toLowerCase() ?? ''})` : st.v < 0 ? 'Bloquée (branchée en sens inverse)' : 'Éteinte (tension inférieure au seuil)';
      case 'diode':
        return st.i > 1e-5 ? 'Passante' : 'Bloquée';
      case 'switch':
        return el.props.closed ? 'Fermé : le courant passe.' : 'Ouvert : le circuit est coupé.';
      case 'motor':
        return Math.abs(st.i) < 1e-3 ? 'À l\'arrêt' : `Tourne dans le sens ${st.i > 0 ? 'horaire' : 'antihoraire'}`;
      case 'capacitor':
        return `Charge q = C·U = ${fmtSI(Number(el.props.C) * st.v, 'C')}`;
      case 'ammeter':
        return currentVisible(el, st) ? 'Branché en série : il mesure l\'intensité qui le traverse.' : 'Aucun courant ne traverse l\'ampèremètre.';
      case 'voltmeter':
        return Number.isNaN(st.v) ? 'Une borne n\'est reliée à rien.' : 'Branché en dérivation : il mesure la tension entre ses bornes.';
      default:
        return '';
    }
  }

  private propField(el: ElementData, p: PropSpec): HTMLElement {
    if (p.kind === 'boolean') {
      const input = h('input', { type: 'checkbox', checked: el.props[p.key] === true });
      input.addEventListener('change', () => this.setProp(el, p.key, input.checked));
      return h('label', { class: 'check' }, input, p.label);
    }
    if (p.kind === 'select') {
      const select = h('select', { class: 'select' }, ...(p.options ?? []).map((o) => h('option', { value: o.value }, o.label)));
      select.value = String(el.props[p.key]);
      select.addEventListener('change', () => this.setProp(el, p.key, select.value));
      return h('label', { class: 'field' }, h('span', null, p.label), select);
    }
    const input = h('input', { class: 'input', type: 'text', inputmode: 'decimal', value: fmtSI(Number(el.props[p.key]), p.unit ?? '', 6) });
    const commit = () => {
      const v = parseSI(input.value);
      const ok = Number.isFinite(v) && v >= (p.min ?? -Infinity) && v <= (p.max ?? Infinity);
      input.classList.toggle('is-invalid', !ok);
      if (ok) this.setProp(el, p.key, v);
    };
    input.addEventListener('change', commit);
    input.addEventListener('keydown', (e) => e.key === 'Enter' && commit());
    return h('div', { class: 'field' },
      h('span', null, p.label),
      input,
      p.presets
        ? h('div', { class: 'presets' }, ...p.presets.map((v) =>
          h('button', { class: `chip${Number(el.props[p.key]) === v ? ' is-active' : ''}`, onclick: () => this.setProp(el, p.key, v) }, fmtSI(v, p.unit ?? '')),
        ))
        : null,
    );
  }

  private loadExample(index: number): void {
    const ex = EXAMPLES[index];
    if (!ex) return;
    if (this.state.elements.length > 0 && this.undoStack.length > 0 && !window.confirm('Remplacer le circuit actuel par cet exemple ?')) {
      this.renderSide();
      return;
    }
    this.pushHistory();
    this.state = ex.make();
    this.selectedId = null;
    this.hint = ex.hint;
    this.sim.setElements(this.state.elements);
    this.sim.reset();
    this.phases.clear();
    this.applySpeed();
    this.elementsChanged();
    this.fit();
    this.ctx.toast(`Exemple chargé : ${ex.title}`);
  }

  private clearAll(): void {
    if (!this.state.elements.length || !window.confirm('Effacer tout le circuit ?')) return;
    this.pushHistory();
    this.state.elements = [];
    this.sim.reset();
    this.hint = '';
    this.elementsChanged();
  }

  // ─── Interactions ─────────────────────────────────────────────────────────

  private handleKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (ctrl && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      this.redo();
      return;
    }
    if (ctrl || e.altKey) return;
    if (e.key === 'Escape') {
      this.setTool('select');
      this.select(null);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.selectedId) {
        e.preventDefault();
        this.deleteSelected();
      }
    } else if (e.key === ' ') {
      e.preventDefault();
      this.togglePlay();
    } else if (e.key === 'R' && e.shiftKey) {
      // Maj+R : « r » seul choisit l'outil résistance.
      this.rotateSelected();
    } else if (e.key === 'F' && e.shiftKey) {
      this.flipSelected();
    } else {
      const type = (Object.keys(CATALOG) as ElementType[]).find((t) => CATALOG[t].shortcut === e.key.toLowerCase());
      if (type) this.setTool(type);
    }
  }

  private bindCanvas(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    c.addEventListener('pointermove', (e) => this.onPointerMove(e));
    c.addEventListener('pointerup', (e) => this.onPointerUp(e));
    c.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    c.addEventListener('pointerleave', () => {
      if (!this.pointers.size) this.setHover(null, null, null);
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = this.local(e);
      this.zoomBy(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), p.x, p.y);
    }, { passive: false });
  }

  private local(e: MouseEvent): Pos {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private toWorld(p: Pos): Pos {
    return { x: this.cam.x + p.x / this.cam.zoom, y: this.cam.y + p.y / this.cam.zoom };
  }

  private toGrid(p: Pos): Pos {
    const w = this.toWorld(p);
    return { x: Math.round(w.x / GRID), y: Math.round(w.y / GRID) };
  }

  /** Extrémités de composants situées au point de grille le plus proche du pointeur. */
  private endsNear(p: Pos): { x: number; y: number; ends: [ElementData, 1 | 2][] } | null {
    const g = this.toGrid(p);
    const w = this.toWorld(p);
    if (Math.hypot(w.x - g.x * GRID, w.y - g.y * GRID) > Math.max(7, 11 / this.cam.zoom)) return null;
    const ends: [ElementData, 1 | 2][] = [];
    for (const el of this.state.elements) {
      if (el.x1 === g.x && el.y1 === g.y) ends.push([el, 1]);
      if (el.type !== 'ground' && el.x2 === g.x && el.y2 === g.y) ends.push([el, 2]);
    }
    return ends.length ? { ...g, ends } : null;
  }

  private elementAt(p: Pos): ElementData | null {
    const w = this.toWorld(p);
    const tol = Math.max(6, 10 / this.cam.zoom);
    let best: ElementData | null = null;
    let bestD = tol;
    for (const el of this.state.elements) {
      // Les composants sont prioritaires sur les fils qui les touchent.
      const d = distanceToElement(el, w.x, w.y) + (el.type === 'wire' ? 2 : 0);
      if (d < bestD) {
        bestD = d;
        best = el;
      }
    }
    return best;
  }

  private onPointerDown(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.focus({ preventScroll: true });
    const pos = this.local(e);
    this.pointers.set(e.pointerId, pos);
    if (this.pointers.size === 2) {
      this.drag = { kind: 'pan' };
      this.preview = null;
      return;
    }
    if (e.button === 1 || e.button === 2) {
      this.drag = { kind: 'pan' };
      return;
    }
    if (this.tool !== 'select') {
      const g = this.toGrid(pos);
      this.drag = { kind: 'place', x: g.x, y: g.y };
      this.preview = { id: 'preview', type: this.tool, x1: g.x, y1: g.y, x2: g.x, y2: g.y, props: defaultProps(this.tool) };
      return;
    }
    const node = this.endsNear(pos);
    if (node) {
      this.drag = { kind: 'node', x: node.x, y: node.y, ends: node.ends, moved: false, before: this.snapshot() };
      return;
    }
    const el = this.elementAt(pos);
    if (el) {
      this.select(el.id);
      const g = this.toGrid(pos);
      this.drag = { kind: 'element', el, gx: g.x, gy: g.y, orig: [el.x1, el.y1, el.x2, el.y2], moved: false, before: this.snapshot() };
      return;
    }
    this.drag = { kind: 'pan' };
  }

  private onPointerMove(e: PointerEvent): void {
    const pos = this.local(e);
    const prev = this.pointers.get(e.pointerId);
    if (!prev) {
      if (e.pointerType !== 'touch') this.updateHover(pos);
      return;
    }
    this.pointers.set(e.pointerId, pos);
    const drag = this.drag;
    if (this.pointers.size === 2) {
      const other = [...this.pointers.entries()].find(([id]) => id !== e.pointerId)![1];
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(pos.x - other.x, pos.y - other.y);
      this.cam.x -= (pos.x - prev.x) / 2 / this.cam.zoom;
      this.cam.y -= (pos.y - prev.y) / 2 / this.cam.zoom;
      if (before > 10) this.zoomBy(after / before, (pos.x + other.x) / 2, (pos.y + other.y) / 2);
      return;
    }
    if (!drag) return;
    const g = this.toGrid(pos);
    switch (drag.kind) {
      case 'pan':
        this.cam.x -= (pos.x - prev.x) / this.cam.zoom;
        this.cam.y -= (pos.y - prev.y) / this.cam.zoom;
        this.setHover(null, null, null);
        break;
      case 'place':
        if (this.preview) {
          this.preview.x2 = g.x;
          this.preview.y2 = g.y;
        }
        break;
      case 'node':
        if (g.x !== drag.x || g.y !== drag.y) {
          for (const [el, end] of drag.ends) {
            if (end === 1) {
              el.x1 = g.x;
              el.y1 = g.y;
            } else {
              el.x2 = g.x;
              el.y2 = g.y;
            }
          }
          drag.x = g.x;
          drag.y = g.y;
          drag.moved = true;
          this.sim.setElements(this.state.elements);
        }
        break;
      case 'element': {
        const dx = g.x - drag.gx;
        const dy = g.y - drag.gy;
        const [x1, y1, x2, y2] = drag.orig;
        if (dx || dy || drag.moved) {
          drag.el.x1 = x1 + dx;
          drag.el.y1 = y1 + dy;
          drag.el.x2 = x2 + dx;
          drag.el.y2 = y2 + dy;
          if (dx || dy) drag.moved = true;
          this.sim.setElements(this.state.elements);
        }
        break;
      }
    }
  }

  private onPointerUp(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    const drag = this.drag;
    if (this.pointers.size > 0) return;
    this.drag = null;
    if (!drag) return;
    switch (drag.kind) {
      case 'place': {
        const p = this.preview;
        this.preview = null;
        if (!p) return;
        const type = p.type;
        const single = p.x1 === p.x2 && p.y1 === p.y2;
        if (single && type === 'wire') return;
        const el = type === 'ground' || !single
          ? this.addElement(type, p.x1, p.y1, type === 'ground' ? p.x1 : p.x2, type === 'ground' ? p.y1 : p.y2)
          : this.addElement(type, p.x1, p.y1, p.x1 + 4, p.y1);
        if (type !== 'wire') {
          this.setTool('select');
          this.select(el.id);
        }
        break;
      }
      case 'node':
        if (drag.moved) {
          this.pushHistory(drag.before);
          // Un composant réduit à un point est supprimé.
          this.state.elements = this.state.elements.filter((el) => el.type === 'ground' || el.x1 !== el.x2 || el.y1 !== el.y2);
          this.elementsChanged();
        } else {
          const el = drag.ends.find(([x]) => x.type !== 'wire')?.[0] ?? drag.ends[0][0];
          this.select(el.id);
        }
        break;
      case 'element':
        if (drag.moved) {
          this.pushHistory(drag.before);
          this.elementsChanged();
        } else if (drag.el.type === 'switch') {
          this.setProp(drag.el, 'closed', drag.el.props.closed !== true);
        }
        break;
      case 'pan':
        break;
    }
  }

  private updateHover(pos: Pos): void {
    if (this.tool !== 'select') {
      const g = this.toGrid(pos);
      this.setHover(null, g, null);
      return;
    }
    const node = this.endsNear(pos);
    if (node) {
      this.canvas.style.cursor = 'move';
      this.setHover(null, node, this.nodeTooltip(node.x, node.y), pos);
      return;
    }
    const el = this.elementAt(pos);
    this.canvas.style.cursor = el ? (el.type === 'switch' ? 'pointer' : 'grab') : '';
    this.setHover(el?.id ?? null, null, el ? this.elementTooltip(el) : null, pos);
  }

  private setHover(id: string | null, point: Pos | null, html: string | null, pos?: Pos): void {
    this.hoverId = id;
    this.hoverPoint = point;
    if (!html || !pos) {
      this.tooltip.hidden = true;
      return;
    }
    this.tooltip.innerHTML = html;
    this.tooltip.hidden = false;
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    const w = this.tooltip.offsetWidth;
    const hh = this.tooltip.offsetHeight;
    const left = pos.x + 18 + w > W ? pos.x - 18 - w : pos.x + 18;
    const top = pos.y + 18 + hh > H ? pos.y - 18 - hh : pos.y + 18;
    this.tooltip.style.transform = `translate(${Math.max(4, left)}px, ${Math.max(4, top)}px)`;
  }

  private elementTooltip(el: ElementData): string {
    const st = this.sim.states.get(el.id);
    const name = this.labels.get(el.id) ?? shortName(el.type);
    if (!st) return name;
    if (el.type === 'wire') return `<b>Fil</b><br>I = ${fmtSI(Math.abs(shownCurrent(st.i)), 'A')}`;
    const u = Number.isNaN(st.v) ? '—' : fmtSI(displayVoltage(el, st), 'V');
    return `<b>${name}</b> · ${shortName(el.type)}<br>U = ${u}<br>I = ${fmtSI(shownCurrent(st.i), 'A')}`;
  }

  /** Potentiel du nœud et vérification de la loi des nœuds. */
  private nodeTooltip(x: number, y: number): string {
    const v = this.sim.pointVoltage(x, y);
    const currents = this.sim.currentsAt(x, y).filter((c) => Math.abs(c.i) > 1e-12);
    const name = (id: string) => {
      const el = this.state.elements.find((e) => e.id === id);
      return this.labels.get(id) ?? (el ? shortName(el.type).toLowerCase() : '?');
    };
    const lines = [`<b>Nœud</b> · potentiel ${v === undefined ? '—' : fmtSI(v, 'V')}`];
    if (currents.length >= 2) {
      const inc = currents.filter((c) => c.i > 0);
      const out = currents.filter((c) => c.i < 0);
      const sum = (list: { i: number }[]) => list.reduce((s, c) => s + Math.abs(c.i), 0);
      lines.push(`Entrants : ${inc.map((c) => `${fmtSI(c.i, 'A')} (${name(c.id)})`).join(' + ') || '—'}`);
      lines.push(`Sortants : ${out.map((c) => `${fmtSI(-c.i, 'A')} (${name(c.id)})`).join(' + ') || '—'}`);
      const ok = Math.abs(sum(inc) - sum(out)) <= 1e-9 + 1e-6 * sum(inc);
      lines.push(ok ? `Σ entrants = Σ sortants = ${fmtSI(sum(inc), 'A')} ✓ <i>loi des nœuds</i>` : 'Σ entrants ≠ Σ sortants');
    }
    return lines.join('<br>');
  }
}
