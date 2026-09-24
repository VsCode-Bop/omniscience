/**
 * Module « Suites numériques » : suites explicites et récurrentes, nuage de points,
 * toile d'araignée, tableau de valeurs, observations et algorithme de seuil.
 */
import './sequences.css';
import { bindRange, dismissable, h, svgIcon, syncRange } from '../../core/dom';
import { canvasToBlob } from '../../core/export/download';
import { CanvasPainter, fitCanvas } from '../../core/graphics/canvas-painter';
import { DEFAULT_FONT, type Painter } from '../../core/graphics/painter';
import { SvgPainter } from '../../core/graphics/svg-painter';
import { icon } from '../../core/icons';
import { fmt } from '../../core/math/format';
import type { ModuleContext, ModuleInstance } from '../../core/types';
import { readPalette, type Palette } from '../grapher/renderer';
import { Viewport } from '../grapher/viewport';
import {
  conjectureLimit,
  detectMonotony,
  detectNature,
  fixedPoints,
  SEQ_NAMES,
  SequenceProgram,
  sum,
  termText,
  thresholdPython,
  type SeqDef,
  type SeqName,
  type ThresholdOp,
} from './model';
import { SeqCard, termHTML, type CardHost, type Observations } from './panel';
import { drawSequences, type Cobweb, type SeqScene, type Series } from './render';
import { defaultParam, defaultState, EXAMPLES, MAX_N, sanitizeState, type SequencesState } from './state';

export function mount(container: HTMLElement, ctx: ModuleContext): ModuleInstance {
  return new SequencesApp(container, ctx);
}

type KatexModule = typeof import('katex').default;
interface Pos {
  x: number;
  y: number;
}

const isPresenting = () => document.documentElement.classList.contains('is-presenting');
const OPS: [ThresholdOp, string][] = [['>', '>'], ['>=', '≥'], ['<', '<'], ['<=', '≤']];
/** Rang maximal exploré par l'algorithme de seuil (recalculé à chaque modification). */
const THRESHOLD_LIMIT = 20000;

/** Lecture d'un nombre saisi « à la française » : 2,5 ; −3 ; 1e6. */
function parseNumber(text: string): number {
  const t = text.trim().replace(/\s/g, '').replace(',', '.').replace('−', '-');
  return t ? Number(t) : Number.NaN;
}

class SequencesApp implements ModuleInstance, CardHost {
  private state: SequencesState;
  private program!: SequenceProgram;
  private values = new Map<SeqName, number[]>();
  private observations = new Map<SeqName, Observations>();
  private readonly vp = new Viewport(-1, 21, -1, 10);
  private palette: Palette = readPalette();
  private katex: KatexModule | null = null;

  private readonly root: HTMLElement;
  private readonly cardsEl: HTMLElement;
  private readonly cards = new Map<SeqName, SeqCard>();
  private readonly addBtn: HTMLButtonElement;
  private readonly paramsSection: HTMLElement;
  private readonly paramsEl: HTMLElement;
  private readonly thresholdEl: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly tooltip: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly modeButtons = new Map<SequencesState['view'], HTMLButtonElement>();
  private readonly playBtn: HTMLButtonElement;
  private readonly nInput: HTMLInputElement;
  private readonly nRange: HTMLInputElement;
  private readonly progress: HTMLElement;
  private readonly tableBody: HTMLElement;
  private readonly tableHead: HTMLElement;
  private readonly sumsSwitch: HTMLInputElement;
  private readonly tableBtn: HTMLButtonElement;

  /** Nombre de termes affichés (animation « pas à pas ») ; Infinity : tous. */
  private shown = Infinity;
  private playing = 0;
  private hover: SeqScene['hover'] = null;
  private frame = 0;
  private tableFrame = 0;
  private sized = false;
  private dirty = false;
  private collapsedForPresentation = false;
  private closePopover: (() => void) | null = null;
  private readonly pointers = new Map<number, Pos>();
  private readonly animating = new Map<string, { dir: number }>();
  private animFrame = 0;
  private animLast = 0;
  private readonly resizeObserver: ResizeObserver;

  constructor(container: HTMLElement, private readonly ctx: ModuleContext) {
    this.state = sanitizeState(ctx.initialState) ?? defaultState();

    // ── Panneau de gauche : définitions, paramètres, seuil ──
    this.cardsEl = h('div', { class: 'seq-cards' });
    this.addBtn = h('button', { class: 'seq-add', onclick: () => this.addSequence() }, svgIcon(icon('plus'), 'icon icon-sm'), 'Ajouter une suite');
    this.paramsEl = h('div', { class: 'seq-params' });
    this.paramsSection = h('section', { class: 'panel-section', hidden: true }, h('div', { class: 'section-title' }, 'Paramètres'), this.paramsEl);
    this.thresholdEl = h('div', { class: 'seuil' });
    const examplesBtn = h('button', { class: 'btn btn-sm', 'aria-haspopup': 'menu' }, svgIcon(icon('book')), 'Exemples', svgIcon(icon('chevronDown'), 'icon icon-sm'));
    examplesBtn.addEventListener('click', () => this.openExamples(examplesBtn));
    const helpBtn = h('button', { class: 'btn btn-ghost btn-icon btn-sm', title: 'Aide-mémoire de saisie', 'aria-label': 'Aide-mémoire de saisie' }, svgIcon(icon('info')));
    helpBtn.addEventListener('click', () => this.openHelp(helpBtn));
    const panel = h('aside', { class: 'panel seq-panel', 'aria-label': 'Définition des suites' },
      h('div', { class: 'panel-header' },
        h('h2', null, 'Suites'),
        h('div', { class: 'panel-header-actions' },
          h('div', { class: 'popover-anchor' }, examplesBtn),
          h('div', { class: 'popover-anchor' }, helpBtn),
        ),
      ),
      h('div', { class: 'panel-scroll' },
        h('div', { class: 'seq-cards-wrap' }, this.cardsEl, this.addBtn),
        this.paramsSection,
        h('section', { class: 'panel-section' }, h('div', { class: 'section-title' }, 'Algorithme de seuil'), this.thresholdEl),
      ),
    );

    // ── Scène ──
    this.canvas = h('canvas', { class: 'main-canvas', tabindex: '0', 'aria-label': 'Représentation graphique des suites (flèches : pas à pas)' });
    this.tooltip = h('div', { class: 'tooltip', hidden: true });
    this.notice = h('div', { class: 'seq-notice', hidden: true });
    const modeSeg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Représentation' },
      ...([['points', 'Nuage de points', 'grid'], ['cobweb', 'Toile d\'araignée', 'sequence']] as const).map(([mode, label, ic]) => {
        const b = h('button', { class: 'seg-btn', role: 'radio', onclick: () => this.setView(mode) }, svgIcon(icon(ic), 'icon icon-sm'), label);
        this.modeButtons.set(mode, b);
        return b;
      }),
    );
    const displayBtn = h('button', { class: 'btn btn-icon', title: 'Affichage', 'aria-label': 'Options d\'affichage' }, svgIcon(icon('sliders')));
    displayBtn.addEventListener('click', () => this.openDisplay(displayBtn));
    this.tableBtn = h('button', { class: 'btn btn-icon', title: 'Tableau de valeurs', 'aria-label': 'Afficher ou masquer le tableau de valeurs', onclick: () => this.toggleTable() }, svgIcon(icon('panel')));
    const zoom = (f: number) => () => {
      this.vp.zoomAt(this.vp.width / 2, this.vp.height / 2, f);
      this.viewChanged();
    };

    this.playBtn = h('button', { class: 'btn btn-primary btn-icon play-btn', title: 'Construire pas à pas (Espace)', 'aria-label': 'Animer la construction', onclick: () => this.togglePlay() });
    this.nInput = h('input', { class: 'input input-sm dock-n', type: 'number', min: '1', max: String(MAX_N), step: '1', 'aria-label': 'Indice du dernier terme' });
    this.nRange = bindRange(h('input', { type: 'range', class: 'dock-range', min: '1', max: '200', step: '1', 'aria-label': 'Nombre de termes' }));
    const setN = (v: number) => {
      if (!Number.isFinite(v)) return;
      this.state.N = Math.max(1, Math.min(MAX_N, Math.round(v)));
      this.shown = Infinity;
      this.stop();
      this.changed(true);
    };
    this.nInput.addEventListener('change', () => setN(Number(this.nInput.value)));
    this.nRange.addEventListener('input', () => setN(Number(this.nRange.value)));
    this.progress = h('span', { class: 'dock-progress' });

    this.stage = h('div', { class: 'stage seq-stage' },
      this.canvas,
      h('div', { class: 'float-bar tl' },
        h('button', { class: 'btn btn-icon', title: 'Afficher / masquer le panneau', 'aria-label': 'Afficher ou masquer le panneau', onclick: () => this.togglePanel() }, svgIcon(icon('sidebar'))),
      ),
      h('div', { class: 'float-bar tc' }, modeSeg),
      h('div', { class: 'float-bar tr' },
        h('button', { class: 'btn btn-icon', title: 'Zoom avant', 'aria-label': 'Zoom avant', onclick: zoom(1.4) }, svgIcon(icon('zoomIn'))),
        h('button', { class: 'btn btn-icon', title: 'Zoom arrière', 'aria-label': 'Zoom arrière', onclick: zoom(1 / 1.4) }, svgIcon(icon('zoomOut'))),
        h('button', { class: 'btn btn-icon', title: 'Cadrer automatiquement', 'aria-label': 'Cadrer automatiquement', onclick: () => this.autoFit() }, svgIcon(icon('fit'))),
        h('span', { class: 'sep' }),
        h('div', { class: 'popover-anchor' }, displayBtn),
        this.tableBtn,
      ),
      h('div', { class: 'float-bar bc dock seq-dock' },
        h('button', { class: 'btn btn-icon', title: 'Premier terme', 'aria-label': 'Revenir au premier terme', onclick: () => this.stepTo(1) }, svgIcon(icon('reset'))),
        h('button', { class: 'btn btn-icon', title: 'Terme précédent (←)', 'aria-label': 'Terme précédent', onclick: () => this.stepBy(-1) }, svgIcon(icon('chevronLeft'))),
        this.playBtn,
        h('button', { class: 'btn btn-icon', title: 'Terme suivant (→)', 'aria-label': 'Terme suivant', onclick: () => this.stepBy(1) }, svgIcon(icon('chevronRight'))),
        h('span', { class: 'sep' }),
        this.progress,
        h('span', { class: 'sep' }),
        h('label', { class: 'dock-n-label' }, h('i', null, 'n'), ' ≤ ', this.nInput),
        this.nRange,
      ),
      this.notice,
      this.tooltip,
    );

    // ── Tableau de valeurs ──
    this.tableHead = h('tr');
    this.tableBody = h('tbody');
    this.sumsSwitch = h('input', { type: 'checkbox', class: 'switch', 'aria-label': 'Afficher les sommes' });
    this.sumsSwitch.addEventListener('change', () => {
      this.state.opts.sums = this.sumsSwitch.checked;
      this.changed(false);
    });
    const tablePanel = h('aside', { class: 'panel seq-table-panel', 'aria-label': 'Tableau de valeurs' },
      h('div', { class: 'panel-header' },
        h('h2', null, 'Valeurs'),
        h('label', { class: 'seq-sums' }, 'Sommes', this.sumsSwitch),
      ),
      h('div', { class: 'panel-scroll seq-table-scroll' }, h('table', { class: 'seq-table' }, h('thead', null, this.tableHead), this.tableBody)),
    );

    this.root = h('div', { class: 'workspace sequences' }, panel, this.stage, tablePanel);
    container.appendChild(this.root);

    this.bindCanvas();
    this.compile();
    this.syncAll();
    void this.loadKatex();
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.stage);
    if (isPresenting()) this.refresh();
  }

  // ─── KaTeX et popovers ────────────────────────────────────────────────────

  private async loadKatex(): Promise<void> {
    const [mod] = await Promise.all([import('katex'), import('katex/dist/katex.min.css')]);
    this.katex = mod.default;
    this.cards.forEach((c) => c.renderDisplay());
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

  color(index: number): string {
    return this.palette.curves[index % this.palette.curves.length];
  }

  private popover(anchor: HTMLElement, build: (close: () => void) => HTMLElement): void {
    const wasOpenHere = this.closePopover && anchor.parentElement?.querySelector('.menu');
    this.closePopover?.();
    if (wasOpenHere) return;
    const close = () => this.closePopover?.();
    const menu = build(close);
    menu.classList.add('menu');
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
        svgIcon(icon('sequence')), h('strong', null, ex.title), h('small', null, ex.level),
      )),
    ));
  }

  private openHelp(anchor: HTMLElement): void {
    this.popover(anchor, () => h('div', { class: 'help-pop' },
      h('div', { class: 'menu-label' }, 'Aide-mémoire de saisie'),
      h('table', null,
        ...[
          ['3 + 2n', 'terme général (suite explicite)'],
          ['0,5u + 3', 'récurrence : u désigne uₙ'],
          ['u(n) + u(n-1)', 'ordre 2 : uₙ₋₁ (deux termes initiaux)'],
          ['uₙ, u_n, un', 'autres écritures de uₙ'],
          ['u(n) - 6', 'une suite peut utiliser une autre suite'],
          ['a·u(1 − u)', 'paramètre a → curseur'],
          ['u mod 2 == 0 ? u/2 : 3u+1', 'définition par cas'],
          ['sqrt, ln, exp, abs, floor', 'fonctions usuelles'],
        ].map(([code, desc]) => h('tr', null, h('td', null, h('code', null, code)), h('td', null, desc))),
      ),
      h('p', null, 'Virgule ou point décimal. Flèches ← → : construire la suite terme à terme.'),
    ));
  }

  private openDisplay(anchor: HTMLElement): void {
    const row = (key: 'grid' | 'join' | 'limit', label: string) => {
      const input = h('input', { type: 'checkbox', class: 'switch', checked: this.state.opts[key] });
      input.addEventListener('change', () => {
        this.state.opts[key] = input.checked;
        this.changed(false);
      });
      return h('label', { class: 'option-row' }, h('span', null, label), input);
    };
    this.popover(anchor, () => h('div', { class: 'display-pop' },
      h('div', { class: 'menu-label' }, 'Affichage'),
      row('grid', 'Quadrillage'),
      row('join', 'Relier les points'),
      row('limit', 'Limite conjecturée'),
    ));
  }

  // ─── Cycle de vie ─────────────────────────────────────────────────────────

  getState(): SequencesState {
    return this.state;
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
    this.cards.forEach((c, name) => c.update(this.def(name)!, this.compiledOf(name), this.observations.get(name) ?? null));
    requestAnimationFrame(() => {
      this.onResize();
      if (!this.state.window) this.autoFit(false);
      this.invalidate();
    });
  }

  destroy(): void {
    this.stop();
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.tableFrame);
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
    const p = new CanvasPainter(g);
    drawSequences(p, { ...this.scene(), hover: null }, this.palette);
    this.drawLegend(p);
    return canvasToBlob(c);
  }

  exportSVG(): string {
    const p = new SvgPainter();
    drawSequences(p, { ...this.scene(), hover: null }, this.palette);
    this.drawLegend(p);
    return p.toSVG(this.vp.width, this.vp.height, this.palette.bg);
  }

  /** Légende des définitions (exports : la figure reste compréhensible hors de l'application). */
  private drawLegend(p: Painter): void {
    const lines = this.visibleSeqs().map((d) => {
      const c = this.compiledOf(d.name);
      const inits = d.kind === 'recursive' ? d.init.slice(0, c?.order ?? 1).map((v, i) => `${termText(d.name, d.n0 + i)} = ${v}`).join(' ; ') : '';
      const def = `${termText(d.name, d.kind === 'recursive' ? 'n+1' : 'n')} = ${d.expr}`;
      return { color: this.color(d.color), text: inits ? `${def}  (${inits})` : def };
    });
    lines.forEach((l, i) => {
      const y = 22 + i * 22;
      p.beginPath();
      p.arc(22, y, 5, 0, Math.PI * 2);
      p.fill(l.color);
      p.text(l.text, 34, y, { color: this.palette.text, size: 14, family: DEFAULT_FONT, baseline: 'middle', halo: this.palette.bg });
    });
  }

  // ─── Compilation et calcul ────────────────────────────────────────────────

  private def(name: SeqName): SeqDef | undefined {
    return this.state.seqs.find((s) => s.name === name);
  }

  private compiledOf(name: SeqName) {
    return this.program.seqs.find((s) => s.def.name === name) ?? null;
  }

  private visibleSeqs(): SeqDef[] {
    return this.state.seqs.filter((s) => !s.hidden && !this.compiledOf(s.name)?.error && s.expr.trim());
  }

  private compile(): void {
    const values: Record<string, number> = {};
    for (const [k, p] of Object.entries(this.state.params)) values[k] = p.value;
    this.program = new SequenceProgram(this.state.seqs, values);
    for (const name of this.program.params) if (!this.state.params[name]) this.state.params[name] = defaultParam(1);
    for (const name of Object.keys(this.state.params)) if (!this.program.params.includes(name)) this.animating.delete(name);
    this.recompute();
  }

  /** Recalcule les termes et les observations (paramètres modifiés, N modifié…). */
  private recompute(): void {
    this.values = this.program.compute(this.state.N);
    this.observations.clear();
    for (const seq of this.program.seqs) {
      const { name, n0 } = seq.def;
      const vals = this.values.get(name) ?? [];
      if (seq.error || !vals.length) continue;
      const g = this.program.mapOf(name);
      let fixed: Observations['fixed'] = [];
      if (g) {
        const finite = vals.filter(Number.isFinite);
        const lo = Math.min(...finite, 0);
        const hi = Math.max(...finite, 1);
        const r = hi - lo || 1;
        fixed = fixedPoints(g, lo - r, hi + r);
      }
      this.observations.set(name, {
        nature: detectNature(vals, g),
        monotony: detectMonotony(vals, n0),
        limit: conjectureLimit(vals, n0),
        fixed,
        sum: sum(vals),
        last: n0 + vals.length - 1,
      });
    }
  }

  private changed(recompile: boolean): void {
    this.dirty = true;
    if (recompile) this.compile();
    this.syncAll();
    this.ctx.notifyStateChange();
  }

  private syncAll(): void {
    this.syncCards();
    this.syncParams();
    this.syncThreshold();
    this.syncControls();
    this.scheduleTable();
    if (!this.state.window) this.autoFit(false);
    this.invalidate();
  }

  // ─── CardHost ─────────────────────────────────────────────────────────────

  patch(name: SeqName, patch: Partial<SeqDef>, recompile = true): void {
    const d = this.def(name);
    if (!d) return;
    Object.assign(d, patch);
    this.shown = Infinity;
    this.changed(recompile);
  }

  remove(name: SeqName): void {
    if (this.state.seqs.length <= 1) return;
    this.state.seqs = this.state.seqs.filter((s) => s.name !== name);
    this.cards.get(name)?.el.remove();
    this.cards.delete(name);
    if (this.state.cobweb === name) this.state.cobweb = this.state.seqs[0].name;
    if (this.state.threshold.name === name) this.state.threshold.name = this.state.seqs[0].name;
    this.changed(true);
  }

  canRemove(): boolean {
    return this.state.seqs.length > 1;
  }

  private addSequence(): void {
    const name = SEQ_NAMES.find((n) => !this.def(n));
    if (!name) return;
    const first = this.state.seqs[0];
    const used = new Set(this.state.seqs.map((s) => s.color));
    let color = 0;
    while (used.has(color)) color++;
    this.state.seqs.push({ name, kind: 'explicit', expr: first ? `${first.name}(n) - 1` : 'n^2', n0: first?.n0 ?? 0, init: [], color });
    this.changed(true);
  }

  private syncCards(): void {
    this.state.seqs.forEach((d, i) => {
      let card = this.cards.get(d.name);
      if (!card) {
        card = new SeqCard(d, this);
        this.cards.set(d.name, card);
      }
      const at = this.cardsEl.children[i] ?? null;
      if (at !== card.el) this.cardsEl.insertBefore(card.el, at);
      card.update(d, this.compiledOf(d.name), this.observations.get(d.name) ?? null);
    });
    this.addBtn.hidden = this.state.seqs.length >= SEQ_NAMES.length;
  }

  // ─── Paramètres (curseurs) ────────────────────────────────────────────────

  private syncParams(): void {
    const names = this.program.params;
    this.paramsSection.hidden = !names.length;
    const existing = new Map([...this.paramsEl.children].map((el) => [(el as HTMLElement).dataset.name!, el as HTMLElement]));
    const rows = names.map((name) => {
      const row = existing.get(name) ?? this.paramRow(name);
      this.updateParamRow(row, name);
      return row;
    });
    if (rows.length !== this.paramsEl.children.length || rows.some((r, i) => this.paramsEl.children[i] !== r)) this.paramsEl.replaceChildren(...rows);
  }

  private paramRow(name: string): HTMLElement {
    const value = h('input', { class: 'param-value', type: 'text', 'aria-label': `Valeur de ${name}` });
    const range = bindRange(h('input', { type: 'range', class: 'param-range', 'aria-label': `Curseur ${name}` }));
    const min = h('input', { class: 'param-bound', type: 'text', 'aria-label': `Minimum de ${name}` });
    const max = h('input', { class: 'param-bound', type: 'text', 'aria-label': `Maximum de ${name}` });
    const play = h('button', { class: 'btn btn-ghost btn-icon btn-sm param-play', title: 'Animer', 'aria-label': `Animer ${name}` });
    range.addEventListener('input', () => this.setParam(name, Number(range.value)));
    value.addEventListener('change', () => {
      const v = parseNumber(value.value);
      if (!Number.isFinite(v)) return;
      const p = this.state.params[name];
      if (v < p.min) p.min = v;
      if (v > p.max) p.max = v;
      this.setParam(name, v);
    });
    const bound = (input: HTMLInputElement, key: 'min' | 'max') => input.addEventListener('change', () => {
      const v = parseNumber(input.value);
      const p = this.state.params[name];
      if (!Number.isFinite(v) || (key === 'min' ? v >= p.max : v <= p.min)) {
        this.updateParamRow(input.closest('.param-row')!, name);
        return;
      }
      p[key] = v;
      p.value = Math.min(Math.max(p.value, p.min), p.max);
      this.setParam(name, p.value);
    });
    bound(min, 'min');
    bound(max, 'max');
    play.addEventListener('click', () => this.toggleAnimation(name));
    return h('div', { class: 'param-row', 'data-name': name },
      h('div', { class: 'param-top' }, h('label', { class: 'param-name' }, h('i', null, name), ' ='), value, play),
      h('div', { class: 'param-slider' }, min, range, max),
    );
  }

  private updateParamRow(row: HTMLElement, name: string): void {
    const p = this.state.params[name];
    const [value, min, max] = ['.param-value', '.param-bound:first-child', '.param-bound:last-child'].map((s) => row.querySelector<HTMLInputElement>(s)!);
    const range = row.querySelector<HTMLInputElement>('.param-range')!;
    if (document.activeElement !== value) value.value = fmt(p.value, 6);
    if (document.activeElement !== min) min.value = fmt(p.min, 6);
    if (document.activeElement !== max) max.value = fmt(p.max, 6);
    range.min = String(p.min);
    range.max = String(p.max);
    range.step = String(p.step);
    range.value = String(p.value);
    syncRange(range);
    const play = row.querySelector<HTMLButtonElement>('.param-play')!;
    const on = this.animating.has(name);
    play.replaceChildren(svgIcon(icon(on ? 'pause' : 'play'), 'icon icon-sm'));
    play.classList.toggle('is-active', on);
  }

  private setParam(name: string, value: number): void {
    const p = this.state.params[name];
    if (!p) return;
    const decimals = Math.max(0, Math.min(8, -Math.floor(Math.log10(p.step) + 1e-9)));
    p.value = Number((Math.round(value / p.step) * p.step).toFixed(decimals));
    this.program.setParam(name, p.value);
    this.recompute();
    this.dirty = true;
    this.syncCards();
    this.syncParams();
    this.syncThreshold();
    this.scheduleTable();
    if (!this.state.window) this.autoFit(false);
    this.invalidate();
    this.ctx.notifyStateChange();
  }

  private toggleAnimation(name: string): void {
    if (this.animating.has(name)) this.animating.delete(name);
    else this.animating.set(name, { dir: 1 });
    this.syncParams();
    if (this.animating.size && !this.animFrame) {
      this.animLast = performance.now();
      this.animFrame = requestAnimationFrame((t) => this.animateParams(t));
    }
  }

  private animateParams(t: number): void {
    const dt = Math.min(0.1, (t - this.animLast) / 1000);
    this.animLast = t;
    for (const [name, a] of this.animating) {
      const p = this.state.params[name];
      if (!p) {
        this.animating.delete(name);
        continue;
      }
      let v = p.value + (a.dir * (p.max - p.min) * dt) / 8;
      if (v >= p.max) {
        v = p.max;
        a.dir = -1;
      } else if (v <= p.min) {
        v = p.min;
        a.dir = 1;
      }
      this.setParam(name, v);
    }
    this.animFrame = this.animating.size ? requestAnimationFrame((n) => this.animateParams(n)) : 0;
  }

  // ─── Algorithme de seuil ──────────────────────────────────────────────────

  private syncThreshold(): void {
    const t = this.state.threshold;
    if (!this.def(t.name)) t.name = this.state.seqs[0].name;
    let form = this.thresholdEl.querySelector<HTMLElement>('.seuil-form');
    if (!form || form.dataset.names !== this.state.seqs.map((s) => s.name).join()) {
      const nameSel = h('select', { class: 'select select-sm', 'aria-label': 'Suite' }, ...this.state.seqs.map((s) => h('option', { value: s.name }, `${s.name}ₙ`)));
      const opSel = h('select', { class: 'select select-sm', 'aria-label': 'Condition' }, ...OPS.map(([op, label]) => h('option', { value: op }, label)));
      const valueIn = h('input', { class: 'input input-sm seuil-value', type: 'text', 'aria-label': 'Seuil A' });
      nameSel.addEventListener('change', () => {
        t.name = nameSel.value as SeqName;
        this.changed(false);
      });
      opSel.addEventListener('change', () => {
        t.op = opSel.value as ThresholdOp;
        this.changed(false);
      });
      valueIn.addEventListener('input', () => {
        t.value = valueIn.value;
        this.syncThreshold();
        this.ctx.notifyStateChange();
      });
      form = h('div', { class: 'seuil-form', 'data-names': this.state.seqs.map((s) => s.name).join() },
        h('span', { class: 'seuil-text' }, 'Plus petit entier ', h('i', null, 'n'), ' tel que'),
        h('div', { class: 'seuil-inputs' }, nameSel, opSel, valueIn),
      );
      this.thresholdEl.replaceChildren(form, h('div', { class: 'seuil-result' }), h('div', { class: 'seuil-code-wrap' }));
    }
    const [nameSel, opSel] = form.querySelectorAll('select');
    const valueIn = form.querySelector<HTMLInputElement>('.seuil-value')!;
    nameSel.value = t.name;
    opSel.value = t.op;
    if (document.activeElement !== valueIn) valueIn.value = t.value;

    const result = this.thresholdEl.querySelector<HTMLElement>('.seuil-result')!;
    const codeWrap = this.thresholdEl.querySelector<HTMLElement>('.seuil-code-wrap')!;
    const A = parseNumber(t.value);
    const seq = this.compiledOf(t.name);
    if (!seq || seq.error || !Number.isFinite(A)) {
      result.innerHTML = '<span class="muted">Saisissez un seuil numérique.</span>';
      codeWrap.replaceChildren();
      return;
    }
    const found = this.program.threshold(t.name, t.op, A, THRESHOLD_LIMIT);
    const opLabel = OPS.find(([op]) => op === t.op)![1];
    result.innerHTML = found
      ? `<span class="seuil-n"><i>n</i> = ${found.n}</span><span class="seuil-detail">${termHTML(t.name, found.n)} ≈ ${fmt(found.value, 8)} ${opLabel} ${fmt(A, 8)}</span>`
      : `<span class="muted">Condition non atteinte pour <i>n</i> ≤ ${fmt(THRESHOLD_LIMIT, 6)}.</span>`;
    const code = thresholdPython(seq, t.op, fmt(A, 12).replace(',', '.').replace('−', '-').replace(/\s/g, ''), this.program.P);
    let details = codeWrap.querySelector('details');
    if (!code) {
      codeWrap.replaceChildren();
      return;
    }
    if (!details) {
      const copy = h('button', { class: 'btn btn-sm btn-ghost seuil-copy', title: 'Copier le programme' }, svgIcon(icon('copy'), 'icon icon-sm'), 'Copier');
      copy.addEventListener('click', (e) => {
        e.preventDefault();
        void navigator.clipboard?.writeText(codeWrap.querySelector('code')?.textContent ?? '').then(() => this.ctx.toast('Programme copié', 'success'));
      });
      details = h('details', { class: 'seuil-code' }, h('summary', null, svgIcon(icon('chevronRight'), 'icon icon-sm'), 'Programme Python', copy), h('pre', null, h('code')));
      codeWrap.replaceChildren(details);
    }
    details.querySelector('code')!.textContent = code;
  }

  // ─── Vue, animation pas à pas ─────────────────────────────────────────────

  private cobwebAvailable(): SeqName | null {
    const wanted = this.def(this.state.cobweb);
    if (wanted && !wanted.hidden && this.program.mapOf(wanted.name)) return wanted.name;
    return this.state.seqs.find((s) => !s.hidden && this.program.mapOf(s.name))?.name ?? null;
  }

  private setView(view: SequencesState['view']): void {
    this.state.view = view;
    this.state.window = null;
    this.hover = null;
    this.changed(false);
  }

  private syncControls(): void {
    for (const [mode, b] of this.modeButtons) {
      b.classList.toggle('is-active', mode === this.state.view);
      b.setAttribute('aria-checked', String(mode === this.state.view));
    }
    const total = this.totalTerms();
    const shown = Math.min(this.shown, total);
    this.progress.innerHTML = shown >= total ? `<b>${total}</b> termes` : `<b>${shown}</b> / ${total} termes`;
    if (document.activeElement !== this.nInput) this.nInput.value = String(this.state.N);
    this.nRange.value = String(Math.min(this.state.N, 200));
    syncRange(this.nRange);
    this.playBtn.replaceChildren(svgIcon(icon(this.playing ? 'pause' : 'play')));
    this.tableBtn.classList.toggle('is-active', this.state.opts.table);
    this.root.classList.toggle('table-hidden', !this.state.opts.table);
    this.sumsSwitch.checked = this.state.opts.sums;
    // Toile d'araignée indisponible : on explique pourquoi.
    const cobweb = this.cobwebAvailable();
    const needsNotice = this.state.view === 'cobweb' && !cobweb;
    this.notice.hidden = !needsNotice;
    if (needsNotice) {
      this.notice.replaceChildren(
        svgIcon(icon('info')),
        h('div', null,
          h('strong', null, 'Toile d\'araignée indisponible'),
          h('p', null, 'Elle représente une suite récurrente uₙ₊₁ = g(uₙ) dont la relation ne dépend ni de n ni d\'une autre suite.'),
        ),
      );
    }
  }

  private totalTerms(): number {
    const lengths = this.visibleSeqs().map((d) => this.values.get(d.name)?.length ?? 0);
    return Math.max(1, ...lengths);
  }

  private stepTo(n: number): void {
    this.stop();
    this.shown = Math.max(1, Math.min(n, this.totalTerms()));
    this.syncControls();
    this.invalidate();
  }

  private stepBy(delta: number): void {
    const total = this.totalTerms();
    const current = Math.min(this.shown, total);
    this.stepTo(current + delta);
  }

  private togglePlay(): void {
    if (this.playing) {
      this.stop();
      this.syncControls();
      return;
    }
    const total = this.totalTerms();
    if (this.shown >= total) this.shown = 1;
    const interval = Math.max(70, Math.min(650, 7000 / total));
    this.playing = window.setInterval(() => {
      this.shown++;
      if (this.shown >= this.totalTerms()) {
        this.shown = Infinity;
        this.stop();
      }
      this.syncControls();
      this.invalidate();
    }, interval);
    this.syncControls();
    this.invalidate();
  }

  private stop(): void {
    if (this.playing) window.clearInterval(this.playing);
    this.playing = 0;
  }

  private togglePanel(): void {
    this.root.classList.toggle('panel-collapsed');
    this.collapsedForPresentation = false;
  }

  private toggleTable(): void {
    this.state.opts.table = !this.state.opts.table;
    this.changed(false);
  }

  private loadExample(index: number): void {
    const ex = EXAMPLES[index];
    if (!ex) return;
    if (this.dirty && !window.confirm('Remplacer les suites actuelles par cet exemple ?')) return;
    this.stop();
    this.animating.clear();
    this.state = ex.make();
    this.cards.forEach((c) => c.el.remove());
    this.cards.clear();
    this.shown = Infinity;
    this.changed(true);
    this.dirty = false;
    this.ctx.toast(ex.hint);
  }

  // ─── Cadrage ──────────────────────────────────────────────────────────────

  /** Marges en pixels réservées aux barres flottantes. */
  private insets(): { top: number; bottom: number; left: number; right: number } {
    const k = isPresenting() ? 1.3 : 1;
    return { top: 64, bottom: 84, left: 24 * k, right: 30 * k };
  }

  private autoFit(notify = true): void {
    if (!this.sized) return;
    const { top, bottom, left, right } = this.insets();
    const W = this.vp.width;
    const H = this.vp.height;
    const availW = Math.max(40, W - left - right);
    const availH = Math.max(40, H - top - bottom);
    const cobweb = this.state.view === 'cobweb' ? this.cobwebAvailable() : null;
    let x0: number;
    let x1: number;
    let y0: number;
    let y1: number;
    if (cobweb) {
      const vals = (this.values.get(cobweb) ?? []).filter(Number.isFinite);
      const vlo = Math.min(...vals);
      const vhi = Math.max(...vals);
      const vr = vhi - vlo || 1;
      // Points fixes proches des termes seulement (sinon la construction serait minuscule).
      const fixed = (this.observations.get(cobweb)?.fixed.map((f) => f.x) ?? []).filter((f) => f >= vlo - vr && f <= vhi + vr);
      let lo = Math.min(...vals, ...fixed);
      let hi = Math.max(...vals, ...fixed);
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) [lo, hi] = [-1, 1];
      const r = hi - lo || Math.max(1, Math.abs(hi));
      // L'origine reste visible si elle n'est pas trop loin (lecture des termes sur l'axe).
      if (lo > 0 && lo < 1.5 * r) lo = 0;
      if (hi < 0 && -hi < 1.5 * r) hi = 0;
      const pad = (hi - lo) * 0.12;
      lo -= pad;
      hi += pad;
      // Repère orthonormé : y = x à 45°.
      const unit = Math.min(availW, availH) / (hi - lo);
      const cx = (lo + hi) / 2;
      x0 = cx - (availW / unit) / 2;
      x1 = cx + (availW / unit) / 2;
      y0 = cx - (availH / unit) / 2;
      y1 = cx + (availH / unit) / 2;
    } else {
      const seqs = this.visibleSeqs();
      const n0 = Math.min(...seqs.map((s) => s.n0), this.state.N);
      x0 = n0 - 0.6;
      x1 = this.state.N + 0.6;
      const vals = seqs.flatMap((s) => (this.values.get(s.name) ?? []).filter(Number.isFinite));
      let lo = Math.min(...vals);
      let hi = Math.max(...vals);
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) [lo, hi] = [-1, 1];
      if (hi - lo < 1e-9 * Math.max(1, Math.abs(hi))) {
        lo -= 1;
        hi += 1;
      }
      const r = hi - lo;
      if (lo > 0 && lo < 0.6 * r) lo = 0;
      if (hi < 0 && -hi < 0.6 * r) hi = 0;
      const pad = (hi - lo) * 0.08;
      y0 = lo - pad;
      y1 = hi + pad;
    }
    // Conversion des marges en unités du repère.
    const sx = availW / (x1 - x0);
    const sy = availH / (y1 - y0);
    this.vp.set(x0 - left / sx, x1 + right / sx, y0 - bottom / sy, y1 + top / sy);
    if (notify) {
      this.state.window = null;
      this.invalidate();
      this.ctx.notifyStateChange();
    }
  }

  private viewChanged(): void {
    this.state.window = this.vp.bounds().map((v) => Number(v.toPrecision(8))) as SequencesState['window'];
    this.invalidate();
    this.ctx.notifyStateChange();
  }

  private onResize(): void {
    const w = this.stage.clientWidth;
    const hgt = this.stage.clientHeight;
    if (w < 2 || hgt < 2) return;
    if (!this.sized) {
      this.vp.width = w;
      this.vp.height = hgt;
      this.sized = true;
      if (this.state.window) this.vp.set(...this.state.window);
      else this.autoFit(false);
    } else if (this.state.window) {
      this.vp.resize(w, hgt);
    } else {
      this.vp.width = w;
      this.vp.height = hgt;
      this.autoFit(false);
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

  private scene(): SeqScene {
    const series: Series[] = this.visibleSeqs().map((d) => {
      const lim = this.observations.get(d.name)?.limit;
      return { name: d.name, color: this.color(d.color), n0: d.n0, values: this.values.get(d.name) ?? [], limit: lim?.kind === 'converges' ? lim.limit : null };
    });
    let cobweb: Cobweb | null = null;
    const cw = this.state.view === 'cobweb' ? this.cobwebAvailable() : null;
    if (cw) {
      const d = this.def(cw)!;
      cobweb = { name: cw, color: this.color(d.color), g: this.program.mapOf(cw)!, values: this.values.get(cw) ?? [], n0: d.n0, fixed: this.observations.get(cw)?.fixed ?? [] };
    }
    return {
      vp: this.vp,
      mode: this.state.view,
      series,
      cobweb,
      shown: this.shown,
      opts: this.state.opts,
      scale: isPresenting() ? 1.35 : 1,
      hover: this.hover,
    };
  }

  private render(): void {
    if (!this.sized) return;
    const g = fitCanvas(this.canvas, this.vp.width, this.vp.height);
    g.fillStyle = this.palette.bg;
    g.fillRect(0, 0, this.vp.width, this.vp.height);
    drawSequences(new CanvasPainter(g), this.scene(), this.palette);
  }

  // ─── Tableau de valeurs ───────────────────────────────────────────────────

  private scheduleTable(): void {
    if (this.tableFrame) return;
    this.tableFrame = requestAnimationFrame(() => {
      this.tableFrame = 0;
      this.renderTable();
    });
  }

  private renderTable(): void {
    if (!this.state.opts.table) return;
    const seqs = this.state.seqs.filter((s) => s.expr.trim() && !this.compiledOf(s.name)?.error);
    const sums = this.state.opts.sums;
    const head = ['<th><i>n</i></th>'];
    for (const s of seqs) {
      head.push(`<th style="--seq-color:${this.color(s.color)}">${termHTML(s.name, 'n')}</th>`);
      if (sums) head.push(`<th class="is-sum" style="--seq-color:${this.color(s.color)}">Σ ${termHTML(s.name, 'k')}</th>`);
    }
    this.tableHead.innerHTML = head.join('');
    const n0 = Math.min(...seqs.map((s) => s.n0), this.state.N);
    const acc = new Map<SeqName, number>();
    const rows: string[] = [];
    for (let n = n0; n <= this.state.N; n++) {
      const cells = [`<td class="n">${n}</td>`];
      for (const s of seqs) {
        const v = n >= s.n0 ? this.values.get(s.name)?.[n - s.n0] : undefined;
        cells.push(`<td>${v === undefined ? '' : fmt(v, 9)}</td>`);
        if (sums) {
          if (v !== undefined) acc.set(s.name, (acc.get(s.name) ?? 0) + v);
          cells.push(`<td class="is-sum">${v === undefined ? '' : fmt(acc.get(s.name)!, 9)}</td>`);
        }
      }
      rows.push(`<tr data-n="${n}">${cells.join('')}</tr>`);
    }
    this.tableBody.innerHTML = rows.join('');
    this.highlightRow();
  }

  private highlightRow(): void {
    this.tableBody.querySelector('.is-hover')?.classList.remove('is-hover');
    if (!this.hover) return;
    const d = this.def(this.hover.name);
    if (!d) return;
    const row = this.tableBody.querySelector<HTMLElement>(`tr[data-n="${d.n0 + this.hover.index}"]`);
    if (!row) return;
    row.classList.add('is-hover');
    const scroller = row.closest('.panel-scroll') as HTMLElement;
    const top = row.offsetTop - scroller.clientHeight / 2;
    if (row.offsetTop < scroller.scrollTop + 30 || row.offsetTop > scroller.scrollTop + scroller.clientHeight - 30) scroller.scrollTo({ top });
  }

  // ─── Interactions ─────────────────────────────────────────────────────────

  private bindCanvas(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      c.focus({ preventScroll: true });
      this.pointers.set(e.pointerId, this.local(e));
      c.style.cursor = 'grabbing';
    });
    c.addEventListener('pointermove', (e) => {
      const pos = this.local(e);
      const prev = this.pointers.get(e.pointerId);
      if (!prev) {
        if (e.pointerType === 'mouse') this.updateHover(pos);
        return;
      }
      this.pointers.set(e.pointerId, pos);
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const other = [...this.pointers.entries()].find(([id]) => id !== e.pointerId)![1];
        const before = Math.hypot(prev.x - other.x, prev.y - other.y);
        const after = Math.hypot(a.x - b.x, a.y - b.y);
        this.vp.pan((pos.x - prev.x) / 2, (pos.y - prev.y) / 2);
        if (before > 10) this.vp.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, after / before);
      } else {
        this.vp.pan(pos.x - prev.x, pos.y - prev.y);
      }
      this.setHover(null, null);
      this.viewChanged();
    });
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (!this.pointers.size) c.style.cursor = '';
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', () => {
      if (!this.pointers.size) this.setHover(null, null);
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const pos = this.local(e);
      const speed = e.deltaMode === 1 ? 0.05 : 0.0015;
      this.vp.zoomAt(pos.x, pos.y, Math.exp(-e.deltaY * speed));
      this.viewChanged();
    }, { passive: false });
    c.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') this.stepBy(1);
      else if (e.key === 'ArrowLeft') this.stepBy(-1);
      else if (e.key === ' ') this.togglePlay();
      else if (e.key === '0') this.autoFit();
      else return;
      e.preventDefault();
    });
  }

  private local(e: MouseEvent): Pos {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private updateHover(pos: Pos): void {
    if (this.state.view === 'cobweb' && this.cobwebAvailable()) {
      this.setHover(null, null);
      return;
    }
    let best: { name: SeqName; index: number; value: number } | null = null;
    let bestD = 14;
    for (const d of this.visibleSeqs()) {
      const vals = this.values.get(d.name) ?? [];
      const count = Math.min(vals.length, this.shown);
      const i = Math.round(this.vp.pxToX(pos.x)) - d.n0;
      for (const j of [i - 1, i, i + 1]) {
        if (j < 0 || j >= count || !Number.isFinite(vals[j])) continue;
        const dist = Math.hypot(this.vp.xToPx(d.n0 + j) - pos.x, this.vp.yToPx(vals[j]) - pos.y);
        if (dist < bestD) {
          bestD = dist;
          best = { name: d.name, index: j, value: vals[j] };
        }
      }
    }
    if (best) {
      const n = this.def(best.name)!.n0 + best.index;
      this.setHover({ name: best.name, index: best.index }, pos, `${termHTML(best.name, n)} = <span class="t-mono">${fmt(best.value, 10)}</span>`);
    } else {
      this.setHover(null, null);
    }
  }

  private setHover(hover: SeqScene['hover'], pos: Pos | null, htmlText = ''): void {
    const changed = hover?.name !== this.hover?.name || hover?.index !== this.hover?.index;
    this.hover = hover;
    if (!pos || !htmlText) {
      this.tooltip.hidden = true;
    } else {
      this.tooltip.innerHTML = htmlText;
      this.tooltip.hidden = false;
      const w = this.tooltip.offsetWidth;
      const left = pos.x + 16 + w > this.vp.width ? pos.x - 16 - w : pos.x + 16;
      const top = pos.y + 16 + 40 > this.vp.height ? pos.y - 50 : pos.y + 16;
      this.tooltip.style.transform = `translate(${left}px, ${top}px)`;
    }
    if (changed) {
      this.highlightRow();
      this.invalidate();
    }
  }
}
