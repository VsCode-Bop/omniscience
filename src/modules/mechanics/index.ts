/**
 * Module « Mécanique : projectiles » : lancer dans un champ de pesanteur uniforme,
 * avec ou sans frottements ; chronophotographie, vecteurs, énergies et graphes.
 */
import './mechanics.css';
import { bindRange, cssVar, dismissable, h, svgIcon, syncRange } from '../../core/dom';
import { canvasToBlob } from '../../core/export/download';
import { CanvasPainter, fitCanvas } from '../../core/graphics/canvas-painter';
import { disc, line, type Painter } from '../../core/graphics/painter';
import { SvgPainter } from '../../core/graphics/svg-painter';
import { icon } from '../../core/icons';
import { fmt } from '../../core/math/format';
import type { ModuleContext, ModuleInstance } from '../../core/types';
import { html, numberField, section, segmented, statGrid } from '../../core/widgets';
import { readPalette } from '../grapher/renderer';
import { Viewport } from '../grapher/viewport';
import { Axes, chartTitle, type ChartPalette, type Rect } from '../probability/charts';
import { energies, PLANETS, simulate, stateAt, type Drag, type LaunchParams, type Planet, type Trajectory } from './physics';
import { drawScene, hits, type Ghost, type MechPalette, type MechScene } from './render';
import { defaultState, EXAMPLES, sanitizeState, type MechState } from './state';

export function mount(container: HTMLElement, ctx: ModuleContext): ModuleInstance {
  return new MechanicsApp(container, ctx);
}

type KatexModule = typeof import('katex').default;
const isPresenting = () => document.documentElement.classList.contains('is-presenting');
const RATES: [number, string][] = [[0.1, '× 0,1'], [0.25, '× 0,25'], [0.5, '× 0,5'], [1, '× 1'], [2, '× 2']];

function palette(): MechPalette & ChartPalette {
  const base = readPalette();
  return {
    ...base,
    accent: cssVar('--accent'),
    accentSoft: cssVar('--accent-soft'),
    danger: cssVar('--danger'),
    success: cssVar('--success'),
    velocity: cssVar('--vec-velocity') || '#2f9e44',
    accel: cssVar('--vec-accel') || '#e5484d',
    delta: cssVar('--vec-delta') || '#f08c00',
    ground: cssVar('--ground') || 'rgba(120,110,100,.12)',
  };
}

class MechanicsApp implements ModuleInstance {
  private state: MechState;
  private pal = palette();
  private tr!: Trajectory;
  private ideal: Trajectory | null = null;
  private ghosts: Ghost[] = [];
  private t = 0;
  private playing = false;
  private rate = 1;
  private frame = 0;
  private anim = 0;
  private last = 0;
  private dragging = false;
  private scrubbing = false;
  private katex: KatexModule | null = null;
  private collapsedForPresentation = false;
  private closePopover: (() => void) | null = null;
  private readonly vp = new Viewport(-1, 30, -2, 15);
  private vScale = 1;
  private aScale = 1;
  private chartAxes: Axes | null = null;

  private readonly root: HTMLElement;
  private readonly sceneEl: HTMLElement;
  private readonly chartEl: HTMLElement;
  private readonly sceneCanvas: HTMLCanvasElement;
  private readonly chartCanvas: HTMLCanvasElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly timeRange: HTMLInputElement;
  private readonly timeLabel: HTMLElement;
  private readonly results: HTMLElement;
  private readonly equations: HTMLElement;
  private readonly controls: HTMLElement;
  private readonly chartSeg: ReturnType<typeof segmented<MechState['chart']>>;
  private readonly fields = new Map<string, { set: (v: number) => void }>();
  private readonly resizeObserver: ResizeObserver;

  constructor(container: HTMLElement, private readonly ctx: ModuleContext) {
    this.state = sanitizeState(ctx.initialState) ?? defaultState();

    // ── Panneau ──
    const examplesBtn = h('button', { class: 'btn btn-sm', 'aria-haspopup': 'menu' }, svgIcon(icon('book')), 'Exemples', svgIcon(icon('chevronDown'), 'icon icon-sm'));
    examplesBtn.addEventListener('click', () => this.openExamples(examplesBtn));
    this.controls = h('div');
    this.results = h('div');
    this.equations = h('div', { class: 'mech-eq' });
    const panel = h('aside', { class: 'panel mech-panel', 'aria-label': 'Paramètres du lancer' },
      h('div', { class: 'panel-header' }, h('h2', null, 'Lancer'), h('div', { class: 'panel-header-actions' }, h('div', { class: 'popover-anchor' }, examplesBtn))),
      h('div', { class: 'panel-scroll' }, this.controls, this.results),
    );

    // ── Scène ──
    this.sceneCanvas = h('canvas', { class: 'main-canvas', tabindex: '0', 'aria-label': 'Trajectoire du projectile (espace : lancer)' });
    this.playBtn = h('button', { class: 'btn btn-primary btn-icon play-btn', title: 'Lancer (Espace)', 'aria-label': 'Lancer', onclick: () => this.togglePlay() });
    this.timeRange = bindRange(h('input', { type: 'range', class: 'mech-time', min: '0', max: '1000', step: '1', 'aria-label': 'Instant t' }));
    this.timeRange.addEventListener('input', () => {
      this.pause();
      this.setTime((Number(this.timeRange.value) / 1000) * this.tr.T);
    });
    this.timeLabel = h('span', { class: 'mech-clock' });
    const rateSel = h('select', { class: 'select dock-select', title: 'Vitesse de lecture', 'aria-label': 'Vitesse de lecture' }, ...RATES.map(([v, l]) => h('option', { value: String(v) }, l)));
    rateSel.value = '1';
    rateSel.addEventListener('change', () => (this.rate = Number(rateSel.value)));
    const step = (dir: number) => () => {
      this.pause();
      const tau = this.state.tau;
      const n = dir > 0 ? Math.floor(this.t / tau + 1e-6) + 1 : Math.ceil(this.t / tau - 1e-6) - 1;
      this.setTime(Math.max(0, Math.min(this.tr.T, n * tau)));
    };
    this.sceneEl = h('div', { class: 'mech-scene' },
      this.sceneCanvas,
      h('div', { class: 'float-bar tl' },
        h('button', { class: 'btn btn-icon', title: 'Afficher / masquer le panneau', 'aria-label': 'Afficher ou masquer le panneau', onclick: () => this.togglePanel() }, svgIcon(icon('sidebar'))),
      ),
      h('div', { class: 'float-bar bc dock mech-dock' },
        h('button', { class: 'btn btn-icon', title: 'Revenir au départ', 'aria-label': 'Revenir au départ', onclick: () => { this.pause(); this.setTime(0); } }, svgIcon(icon('reset'))),
        h('button', { class: 'btn btn-icon', title: 'Position précédente (←)', 'aria-label': 'Position précédente', onclick: step(-1) }, svgIcon(icon('chevronLeft'))),
        this.playBtn,
        h('button', { class: 'btn btn-icon', title: 'Position suivante (→)', 'aria-label': 'Position suivante', onclick: step(1) }, svgIcon(icon('chevronRight'))),
        h('span', { class: 'sep' }),
        this.timeLabel,
        this.timeRange,
        rateSel,
      ),
    );

    // ── Graphique ──
    this.chartCanvas = h('canvas', { class: 'main-canvas', 'aria-label': 'Graphique en fonction du temps' });
    this.chartSeg = segmented<MechState['chart']>([['positions', 'Positions'], ['vitesses', 'Vitesses'], ['energies', 'Énergies']], this.state.chart, (v) => {
      this.state.chart = v;
      this.chartSeg.set(v);
      this.invalidate();
      this.ctx.notifyStateChange();
    });
    this.chartEl = h('div', { class: 'mech-chart' }, this.chartCanvas, h('div', { class: 'float-bar tr mech-chart-bar' }, this.chartSeg.el));

    const stage = h('div', { class: 'stage mech-stage' }, this.sceneEl, this.chartEl);
    this.root = h('div', { class: 'workspace mech' }, panel, stage);
    container.appendChild(this.root);

    this.buildControls();
    this.recompute();
    this.t = this.tr.T;
    this.syncPlay();
    this.bindScene();
    this.bindChart();
    void import('katex').then(async (mod) => {
      await import('katex/dist/katex.min.css');
      this.katex = mod.default;
      this.renderEquations();
    });
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.sceneEl);
    this.resizeObserver.observe(this.chartEl);
    if (isPresenting()) this.refresh();
  }

  // ─── Paramètres ───────────────────────────────────────────────────────────

  private params(): LaunchParams {
    const s = this.state;
    return { v0: s.v0, angle: s.angle, h: s.h, m: s.m, g: s.g, drag: s.drag, k: s.k };
  }

  private field(key: 'v0' | 'angle' | 'h' | 'm' | 'g' | 'k' | 'tau', label: string, symbol: string, spec: { min: number; max: number; step: number }): HTMLElement {
    const f = numberField(label, symbol, spec, this.state[key], (v) => {
      this.state[key] = v;
      if (key === 'g') {
        this.state.planet = 'autre';
        this.buildControls();
      }
      this.changed();
    });
    this.fields.set(key, f);
    return f.el;
  }

  private buildControls(): void {
    const s = this.state;
    this.fields.clear();
    const planet = segmented<Planet>([['terre', 'Terre'], ['lune', 'Lune'], ['mars', 'Mars'], ['jupiter', 'Jupiter']], s.planet, (v) => {
      s.planet = v;
      if (v !== 'autre') s.g = PLANETS[v].g;
      this.buildControls();
      this.changed();
    });
    const drag = segmented<Drag>([['none', 'Aucun'], ['linear', 'Linéaire'], ['quadratic', 'Quadratique']], s.drag, (v) => {
      s.drag = v;
      if (v === 'linear' && s.k < 0.01) s.k = 0.1;
      if (v === 'quadratic' && s.k > 0.05) s.k = 0.005;
      this.buildControls();
      this.changed();
    });
    const sw = (key: keyof MechState['show'], label: string, extra?: HTMLElement) => {
      const input = h('input', { type: 'checkbox', class: 'switch', checked: s.show[key] });
      input.addEventListener('change', () => {
        s.show[key] = input.checked;
        if (key === 'keep' && !input.checked) this.ghosts = [];
        if (key === 'target') this.buildControls();
        this.changed(false);
      });
      return h('div', null, h('label', { class: 'option-row' }, h('span', null, label), input), extra ?? null);
    };
    const tauSel = h('select', { class: 'select select-sm', 'aria-label': 'Intervalle de temps entre deux positions' },
      ...[0.02, 0.04, 0.05, 0.1, 0.2, 0.25, 0.5, 1].map((v) => h('option', { value: String(v) }, `τ = ${fmt(v, 3)} s`)),
    );
    tauSel.value = String(s.tau);
    tauSel.addEventListener('change', () => {
      s.tau = Number(tauSel.value);
      this.changed(false);
    });
    const target = s.show.target
      ? h('div', { class: 'target-grid' },
        ...(['x', 'y', 'r'] as const).map((key) => {
          const input = h('input', { class: 'input input-sm input-mono', type: 'text', inputmode: 'decimal', 'aria-label': `Cible ${key}` });
          input.value = fmt(s.target[key], 6).replace(/\s/g, '');
          input.addEventListener('change', () => {
            const v = Number(input.value.replace(',', '.').replace('−', '-'));
            if (Number.isFinite(v) && (key !== 'r' || v > 0)) s.target[key] = v;
            this.changed(false);
          });
          const l = h('label', { class: 'target-field' });
          l.innerHTML = `<span>${key === 'r' ? 'rayon' : `<i>${key}</i>`} (m)</span>`;
          l.append(input);
          return l;
        }))
      : undefined;
    this.controls.replaceChildren(
      section('Conditions initiales',
        this.field('v0', 'Vitesse initiale (m/s)', '<i>v</i><sub>0</sub>', { min: 0, max: 80, step: 0.1 }),
        this.field('angle', 'Angle de tir (°)', '<i>α</i>', { min: -90, max: 90, step: 1 }),
        this.field('h', 'Hauteur de départ (m)', '<i>h</i>', { min: 0, max: 100, step: 0.5 }),
        this.field('m', 'Masse (kg)', '<i>m</i>', { min: 0.001, max: 20, step: 0.001 }),
      ),
      section('Pesanteur et frottements',
        planet.el,
        this.field('g', 'Intensité de la pesanteur (N/kg)', '<i>g</i>', { min: 0.5, max: 30, step: 0.01 }),
        h('div', { class: 'field drag-field' }, h('span', { class: 'field-label' }, 'Frottements de l\'air'), drag.el),
        s.drag !== 'none' ? this.field('k', s.drag === 'linear' ? 'Coefficient k (kg/s) : f = k·v' : 'Coefficient k (kg/m) : f = k·v²', '<i>k</i>', s.drag === 'linear' ? { min: 0, max: 2, step: 0.005 } : { min: 0, max: 0.05, step: 0.0001 }) : null,
      ),
      section('Représentations',
        sw('chrono', 'Chronophotographie', h('div', { class: 'tau-row' }, tauSel)),
        sw('velocity', 'Vecteur vitesse'),
        sw('accel', 'Vecteur accélération'),
        sw('components', 'Composantes de la vitesse'),
        sw('deltaV', 'Variation du vecteur vitesse Δv⃗'),
        s.drag !== 'none' ? sw('ideal', 'Comparer sans frottements') : null,
        sw('keep', 'Garder les trajectoires précédentes'),
        sw('target', 'Cible à atteindre', target),
      ),
    );
  }

  private changed(recompute = true): void {
    if (recompute) this.recompute();
    else this.fit();
    this.renderResults();
    this.invalidate();
    this.ctx.notifyStateChange();
  }

  private recompute(): void {
    this.tr = simulate(this.params());
    this.ideal = this.state.drag !== 'none' && this.state.show.ideal ? simulate({ ...this.params(), drag: 'none' }) : null;
    if (this.t > this.tr.T) this.t = this.tr.T;
    if (!this.dragging) this.fit();
    this.renderResults();
  }

  // ─── Résultats ────────────────────────────────────────────────────────────

  private renderResults(): void {
    const tr = this.tr;
    const cur = stateAt(tr, this.t);
    const e = energies(tr.params, cur);
    const target = this.state.show.target ? hits(tr, this.state.target) : null;
    this.results.replaceChildren(
      section('Résultats',
        target !== null ? html('p', `mech-target ${target ? 'is-hit' : 'is-miss'}`, target ? 'Cible atteinte !' : 'Cible manquée : ajustez v₀ ou α.') : null,
        statGrid([
          [tr.landed ? 'Durée du vol' : 'Durée simulée', `${fmt(tr.T, 4)} s`],
          ['Portée', tr.landed ? `${fmt(tr.range, 4)} m` : '—'],
          ['Hauteur maximale', `${fmt(tr.apex.y, 4)} m`],
          ['Vitesse à l\'impact', tr.landed ? `${fmt(tr.impactSpeed, 4)} m/s` : '—'],
        ]),
      ),
      section(`À l'instant t = ${fmt(this.t, 3)} s`,
        statGrid([
          ['Position', `(${fmt(cur.x, 4)} ; ${fmt(cur.y, 4)}) m`],
          ['Vitesse', `${fmt(Math.hypot(cur.vx, cur.vy), 4)} m/s`],
          ['Énergie cinétique', `${fmt(e.ec, 4)} J`],
          ['Énergie potentielle', `${fmt(e.epp, 4)} J`],
          ['Énergie mécanique', `${fmt(e.em, 5)} J`],
          ['Accélération', `${fmt(Math.hypot(cur.ax, cur.ay), 4)} m/s²`],
        ]),
      ),
      section('Équations horaires', this.equations),
    );
    this.renderEquations();
  }

  private renderEquations(): void {
    const p = this.params();
    if (p.drag !== 'none' && p.k > 0) {
      this.equations.innerHTML = '<p class="muted">Avec frottements, pas d\'expression simple : le mouvement est obtenu par résolution numérique (méthode de Runge-Kutta d\'ordre 4).</p>';
      return;
    }
    const a = (p.angle * Math.PI) / 180;
    const n = (v: number) => fmt(Number(v.toPrecision(4)), 4).replace('−', '-').replace(/\s/g, '').replace(',', '{,}');
    const signed = (v: number) => (v < 0 ? `-${n(-v)}` : `+${n(v)}`);
    const vx = p.v0 * Math.cos(a);
    const vy = p.v0 * Math.sin(a);
    const lines = [
      `\\vec a\\;\\begin{cases}a_x=0\\\\a_y=-g=-${n(p.g)}\\end{cases}`,
      `x(t)=${Math.abs(vx) < 1e-12 ? '0' : `${n(vx)}\\,t`}`,
      `y(t)=-${n(p.g / 2)}\\,t^2${Math.abs(vy) > 1e-12 ? `${signed(vy)}\\,t` : ''}${p.h ? signed(p.h) : ''}`,
    ];
    if (Math.abs(vx) > 1e-9) {
      const A = -p.g / (2 * vx * vx);
      const B = Math.tan(a);
      lines.push(`y=${n(A)}\\,x^2${Math.abs(B) > 1e-12 ? `${signed(B)}\\,x` : ''}${p.h ? signed(p.h) : ''}`);
    }
    this.equations.replaceChildren(...lines.map((tex) => {
      const el = h('div', { class: 'eq-line' });
      if (this.katex) this.katex.render(tex, el, { throwOnError: false, output: 'html' });
      else el.textContent = tex;
      return el;
    }));
  }

  // ─── Lecture ──────────────────────────────────────────────────────────────

  private togglePlay(): void {
    if (this.playing) {
      this.pause();
      return;
    }
    if (this.t >= this.tr.T - 1e-9) this.t = 0;
    this.playing = true;
    this.last = performance.now();
    this.syncPlay();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.setTime(this.t + dt * this.rate, false);
      if (this.t >= this.tr.T - 1e-9) {
        this.pause();
        this.onLanded();
        return;
      }
      this.anim = requestAnimationFrame(tick);
    };
    this.anim = requestAnimationFrame(tick);
  }

  private pause(): void {
    this.playing = false;
    cancelAnimationFrame(this.anim);
    this.syncPlay();
  }

  private syncPlay(): void {
    this.playBtn.replaceChildren(svgIcon(icon(this.playing ? 'pause' : 'play')));
  }

  /** Fin d'un lancer : il rejoint les trajectoires conservées. */
  private onLanded(): void {
    if (!this.state.show.keep) return;
    const p = this.tr.params;
    const label = `v₀ = ${fmt(p.v0, 3)} m/s · α = ${fmt(p.angle, 3)}°`;
    if (this.ghosts.some((g) => g.label === label)) return;
    this.ghosts.push({ tr: this.tr, label });
    if (this.ghosts.length > 6) this.ghosts.shift();
  }

  private setTime(t: number, results = true): void {
    this.t = Math.max(0, Math.min(this.tr.T, t));
    if (results || !this.playing) this.renderResults();
    else if (Math.floor(t * 10) !== Math.floor((t - 0.016) * 10)) this.renderResults();
    this.invalidate();
  }

  // ─── Cadrage ──────────────────────────────────────────────────────────────

  private fit(): void {
    const W = this.sceneCanvas.clientWidth;
    const H = this.sceneCanvas.clientHeight;
    if (W < 10 || H < 10) return;
    this.vp.width = W;
    this.vp.height = H;
    const trs = [this.tr, ...(this.ideal ? [this.ideal] : []), ...this.ghosts.map((g) => g.tr)];
    let x0 = 0;
    let x1 = 1;
    let y0 = 0;
    let y1 = 1;
    for (const tr of trs) {
      for (let i = 0; i < tr.samples.length; i += 8) {
        const s = tr.samples[i];
        x0 = Math.min(x0, s.x);
        x1 = Math.max(x1, s.x);
        y0 = Math.min(y0, s.y);
        y1 = Math.max(y1, s.y);
      }
      const last = tr.samples[tr.samples.length - 1];
      x1 = Math.max(x1, last.x);
    }
    if (this.state.show.target) {
      const { x, y, r } = this.state.target;
      x0 = Math.min(x0, x - r);
      x1 = Math.max(x1, x + r);
      y1 = Math.max(y1, y + r);
    }
    const k = isPresenting() ? 1.3 : 1;
    // Place pour le vecteur vitesse à l'impact (même échelle que dans la scène).
    const last = this.tr.samples[this.tr.samples.length - 1];
    let vmax0 = 0.1;
    for (let i = 0; i < this.tr.samples.length; i += 4) vmax0 = Math.max(vmax0, Math.hypot(this.tr.samples[i].vx, this.tr.samples[i].vy));
    const arrowPx = (0.2 * Math.min(W, H)) / Math.max(vmax0, this.state.v0, 1);
    const top = 70 * k;
    const bottom = Math.max(118 * k, 40 * k + Math.max(0, -last.vy) * arrowPx);
    const left = 64 * k;
    const right = Math.max(40 * k, 30 * k + Math.max(0, last.vx) * arrowPx);
    const availW = Math.max(40, W - left - right);
    const availH = Math.max(40, H - top - bottom);
    const spanX = (x1 - x0) * 1.04 || 1;
    const spanY = (y1 - y0) * 1.08 || 1;
    const unit = Math.min(availW / spanX, availH / spanY);
    const cx = (x0 + x1) / 2;
    const ymin = y0 - bottom / unit;
    // Le centre du tracé coïncide avec le centre de la zone utile [left ; W − right].
    const xmin = cx - (W + left - right) / 2 / unit;
    this.vp.set(xmin, xmin + W / unit, ymin, ymin + H / unit);
    // Échelles des vecteurs : la plus grande vitesse ≈ 18 % de la scène.
    let vmax = 0.1;
    let amax = 0.1;
    for (let i = 0; i < this.tr.samples.length; i += 4) {
      const s = this.tr.samples[i];
      vmax = Math.max(vmax, Math.hypot(s.vx, s.vy));
      amax = Math.max(amax, Math.hypot(s.ax, s.ay));
    }
    const size = Math.min(W, H);
    this.vScale = (0.2 * size) / Math.max(vmax, this.state.v0, 1);
    this.aScale = (0.13 * size) / amax;
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

  private scene(handle: boolean): MechScene {
    const s = this.state;
    return {
      vp: this.vp,
      tr: this.tr,
      ideal: this.ideal,
      ghosts: this.ghosts.filter((g) => g.tr !== this.tr),
      t: this.t,
      opts: {
        chrono: s.show.chrono, tau: s.tau, velocity: s.show.velocity, accel: s.show.accel,
        components: s.show.components, deltaV: s.show.deltaV, target: s.show.target ? s.target : null,
      },
      scale: isPresenting() ? 1.3 : 1,
      vScale: this.vScale,
      aScale: this.aScale,
      handle,
    };
  }

  private render(): void {
    const W = this.sceneCanvas.clientWidth;
    const H = this.sceneCanvas.clientHeight;
    if (W > 10 && H > 10) {
      const g = fitCanvas(this.sceneCanvas, W, H);
      g.fillStyle = this.pal.bg;
      g.fillRect(0, 0, W, H);
      drawScene(new CanvasPainter(g), this.scene(!this.playing && this.t === 0), this.pal);
    }
    const cw = this.chartCanvas.clientWidth;
    const ch = this.chartCanvas.clientHeight;
    if (cw > 10 && ch > 10) {
      const g = fitCanvas(this.chartCanvas, cw, ch);
      g.fillStyle = this.pal.bg;
      g.fillRect(0, 0, cw, ch);
      this.chartAxes = this.drawChart(new CanvasPainter(g), { x: 8, y: 10, w: cw - 16, h: ch - 18 });
    }
    this.timeLabel.textContent = `t = ${fmt(this.t, 3)} s`;
    this.timeRange.value = String(this.tr.T ? Math.round((this.t / this.tr.T) * 1000) : 0);
    syncRange(this.timeRange);
  }

  private drawChart(p: Painter, r: Rect): Axes {
    const tr = this.tr;
    const k = isPresenting() ? 1.2 : 1;
    const pal = this.pal;
    const kind = this.state.chart;
    const N = 400;
    const ts = Array.from({ length: N + 1 }, (_, i) => (tr.T * i) / N);
    const states = ts.map((t) => stateAt(tr, t));
    type Series = { label: string; color: string; unit: string; f: (i: number) => number };
    const series: Series[] = kind === 'positions'
      ? [
        { label: 'x(t)', color: pal.accent, unit: 'm', f: (i) => states[i].x },
        { label: 'y(t)', color: pal.curves[1], unit: 'm', f: (i) => states[i].y },
      ]
      : kind === 'vitesses'
        ? [
          { label: 'vx(t)', color: pal.curves[2], unit: 'm/s', f: (i) => states[i].vx },
          { label: 'vy(t)', color: pal.curves[3], unit: 'm/s', f: (i) => states[i].vy },
          { label: 'v(t)', color: pal.text, unit: 'm/s', f: (i) => Math.hypot(states[i].vx, states[i].vy) },
        ]
        : [
          { label: 'Ec', color: pal.curves[2], unit: 'J', f: (i) => energies(tr.params, states[i]).ec },
          { label: 'Epp', color: pal.curves[1], unit: 'J', f: (i) => energies(tr.params, states[i]).epp },
          { label: 'Em', color: pal.text, unit: 'J', f: (i) => energies(tr.params, states[i]).em },
        ];
    let lo = 0;
    let hi = 0;
    for (const s of series) for (let i = 0; i <= N; i++) {
      const v = s.f(i);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    const pad = (hi - lo) * 0.1 || 1;
    const body: Rect = { x: r.x, y: r.y + 30 * k, w: r.w, h: r.h - 30 * k };
    const ax = new Axes(body, 0, Math.max(tr.T, 1e-3), lo < 0 ? lo - pad : 0, hi + pad, { xLabel: 't (s)' }, k);
    const cur = stateAt(tr, this.t);
    const title = kind === 'positions' ? 'Coordonnées (m)' : kind === 'vitesses' ? 'Vitesses (m/s)' : 'Énergies (J)';
    chartTitle(p, r, title, pal, k, series.map((s) => ({ color: s.color, label: s.label })));
    ax.draw(p, pal);
    for (const s of series) {
      // Courbe complète en léger, partie déjà parcourue en trait plein.
      p.beginPath();
      for (let i = 0; i <= N; i++) (i ? p.lineTo : p.moveTo).call(p, ax.x(ts[i]), ax.y(s.f(i)));
      p.stroke({ color: s.color, width: 1.4 * k, alpha: 0.3, join: 'round' });
      p.beginPath();
      for (let i = 0; i <= N && ts[i] <= this.t; i++) (i ? p.lineTo : p.moveTo).call(p, ax.x(ts[i]), ax.y(s.f(i)));
      p.stroke({ color: s.color, width: 2.3 * k, join: 'round' });
    }
    const x = ax.x(this.t);
    line(p, x, ax.plot.y, x, ax.plot.y + ax.plot.h, { color: pal.muted, width: 1.2 * k, dash: [4 * k, 4 * k] });
    const values: [string, string, number][] = kind === 'positions'
      ? [[series[0].color, `x = ${fmt(cur.x, 4)} m`, cur.x], [series[1].color, `y = ${fmt(cur.y, 4)} m`, cur.y]]
      : kind === 'vitesses'
        ? [[series[0].color, `vx = ${fmt(cur.vx, 4)}`, cur.vx], [series[1].color, `vy = ${fmt(cur.vy, 4)}`, cur.vy], [series[2].color, `v = ${fmt(Math.hypot(cur.vx, cur.vy), 4)}`, Math.hypot(cur.vx, cur.vy)]]
        : (() => {
          const e = energies(tr.params, cur);
          return [[series[0].color, `Ec = ${fmt(e.ec, 4)}`, e.ec], [series[1].color, `Epp = ${fmt(e.epp, 4)}`, e.epp], [series[2].color, `Em = ${fmt(e.em, 4)}`, e.em]] as [string, string, number][];
        })();
    values.forEach(([color, label, v], i) => {
      disc(p, x, ax.y(v), 4 * k, color, { color: pal.bg, width: 1.5 * k });
      const right = x > ax.plot.x + ax.plot.w - 130 * k;
      p.text(label, x + (right ? -10 : 10) * k, ax.plot.y + 10 * k + i * 17 * k, { color, size: 12.5 * k, weight: 600, align: right ? 'right' : 'left', baseline: 'top', halo: pal.bg });
    });
    return ax;
  }

  private onResize(): void {
    if (!this.dragging) this.fit();
    this.render();
  }

  // ─── Interactions ─────────────────────────────────────────────────────────

  private bindScene(): void {
    const c = this.sceneCanvas;
    const local = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const tip = () => {
      const s0 = this.tr.samples[0];
      return { x: this.vp.xToPx(s0.x) + s0.vx * this.vScale, y: this.vp.yToPx(s0.y) - s0.vy * this.vScale };
    };
    c.addEventListener('pointerdown', (e) => {
      const pos = local(e);
      const t0 = tip();
      if (!this.playing && this.t === 0 && Math.hypot(pos.x - t0.x, pos.y - t0.y) < 18) {
        this.dragging = true;
        c.setPointerCapture(e.pointerId);
        c.style.cursor = 'grabbing';
      }
    });
    c.addEventListener('pointermove', (e) => {
      const pos = local(e);
      if (!this.dragging) {
        const t0 = tip();
        c.style.cursor = !this.playing && this.t === 0 && Math.hypot(pos.x - t0.x, pos.y - t0.y) < 18 ? 'grab' : '';
        return;
      }
      const s0 = this.tr.samples[0];
      const dx = (pos.x - this.vp.xToPx(s0.x)) / this.vScale;
      const dy = -(pos.y - this.vp.yToPx(s0.y)) / this.vScale;
      this.state.v0 = Number(Math.min(200, Math.hypot(dx, dy)).toFixed(1));
      this.state.angle = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
      this.state.angle = Math.max(-90, Math.min(90, this.state.angle));
      this.fields.get('v0')?.set(this.state.v0);
      this.fields.get('angle')?.set(this.state.angle);
      this.recompute();
      this.t = 0;
      this.invalidate();
    });
    const end = () => {
      if (!this.dragging) return;
      this.dragging = false;
      c.style.cursor = '';
      this.fit();
      this.invalidate();
      this.ctx.notifyStateChange();
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('keydown', (e) => {
      if (e.key === ' ') this.togglePlay();
      else if (e.key === 'ArrowRight') this.setTime(this.t + this.state.tau);
      else if (e.key === 'ArrowLeft') this.setTime(this.t - this.state.tau);
      else return;
      e.preventDefault();
    });
  }

  private bindChart(): void {
    const c = this.chartCanvas;
    const scrub = (e: PointerEvent) => {
      if (!this.chartAxes) return;
      const r = c.getBoundingClientRect();
      this.pause();
      this.setTime(this.chartAxes.invX(e.clientX - r.left));
    };
    c.addEventListener('pointerdown', (e) => {
      this.scrubbing = true;
      c.setPointerCapture(e.pointerId);
      scrub(e);
    });
    c.addEventListener('pointermove', (e) => {
      if (this.scrubbing) scrub(e);
    });
    const end = () => (this.scrubbing = false);
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  private openExamples(anchor: HTMLElement): void {
    const wasOpen = this.closePopover && anchor.parentElement?.querySelector('.menu');
    this.closePopover?.();
    if (wasOpen) return;
    const menu = h('div', { role: 'menu', class: 'menu examples-menu' },
      h('div', { class: 'menu-label' }, 'Situations prêtes à projeter'),
      ...EXAMPLES.map((ex) => h('button', { class: 'menu-item', role: 'menuitem', onclick: () => {
        this.closePopover?.();
        this.pause();
        this.state = ex.make();
        this.ghosts = [];
        this.buildControls();
        this.chartSeg.set(this.state.chart);
        this.recompute();
        this.t = 0;
        this.invalidate();
        this.ctx.notifyStateChange();
        this.ctx.toast(ex.hint);
        this.togglePlay();
      } }, svgIcon(icon('projectile')), h('strong', null, ex.title), h('small', null, ex.level))),
    );
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

  // ─── Cycle de vie ─────────────────────────────────────────────────────────

  getState(): MechState {
    return this.state;
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
    requestAnimationFrame(() => this.onResize());
  }

  destroy(): void {
    this.pause();
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.root.remove();
  }

  /** Scène et graphique réunis dans un même dessin (exports). */
  private drawExport(p: Painter): { w: number; h: number } {
    const W = this.sceneCanvas.clientWidth;
    const H = this.sceneCanvas.clientHeight;
    const CH = Math.max(220, this.chartCanvas.clientHeight);
    drawScene(p, this.scene(false), this.pal);
    this.drawChart(p, { x: 8, y: H + 10, w: W - 16, h: CH - 18 });
    return { w: W, h: H + CH };
  }

  async exportPNG(): Promise<Blob> {
    const W = this.sceneCanvas.clientWidth;
    const H = this.sceneCanvas.clientHeight + Math.max(220, this.chartCanvas.clientHeight);
    const scale = 2;
    const c = document.createElement('canvas');
    c.width = W * scale;
    c.height = H * scale;
    const g = c.getContext('2d')!;
    g.scale(scale, scale);
    g.fillStyle = this.pal.bg;
    g.fillRect(0, 0, W, H);
    this.drawExport(new CanvasPainter(g));
    return canvasToBlob(c);
  }

  exportSVG(): string {
    const p = new SvgPainter();
    const { w, h: hgt } = this.drawExport(p);
    return p.toSVG(w, hgt, this.pal.bg);
  }
}
