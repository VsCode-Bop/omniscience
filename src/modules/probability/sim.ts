/**
 * Onglet « Simulation » : pièce, dé, somme de deux dés, urne. Fréquences observées
 * et théoriques, convergence de la fréquence (loi des grands nombres) et
 * fluctuation d'échantillonnage (intervalle p ± 1/√n du programme de seconde).
 */
import { h, svgIcon } from '../../core/dom';
import { line, type Painter } from '../../core/graphics/painter';
import { icon } from '../../core/icons';
import { fmt } from '../../core/math/format';
import { Axes, bar, chartTitle, points, polyline, type ChartPalette, type Rect } from './charts';
import { lawSpec } from './distributions';
import { Random } from './stats';
import { html, numberField, pct, section, segmented, statGrid, type Hit, type Tab, type TabHost } from './ui';

export type Experiment = 'coin' | 'die' | 'dice' | 'urn';

export interface SimState {
  exp: Experiment;
  p: number;
  faces: number;
  urn: { color: string; count: number }[];
  event: number;
  view: 'trials' | 'samples';
  sampleSize: number;
  samples: number;
}

export const BALLS: Record<string, { name: string; color: string }> = {
  rouge: { name: 'Rouge', color: '#e5484d' },
  bleue: { name: 'Bleue', color: '#3e63dd' },
  verte: { name: 'Verte', color: '#30a46c' },
  jaune: { name: 'Jaune', color: '#f0b400' },
  noire: { name: 'Noire', color: '#2b2b30' },
  blanche: { name: 'Blanche', color: '#d9d9de' },
};

export function defaultSim(): SimState {
  return {
    exp: 'die', p: 0.5, faces: 6, event: 5, view: 'trials', sampleSize: 100, samples: 100,
    urn: [{ color: 'rouge', count: 3 }, { color: 'bleue', count: 2 }, { color: 'verte', count: 5 }],
  };
}

export function sanitizeSim(raw: unknown): SimState {
  const d = defaultSim();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<SimState>;
  const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
  const urn = Array.isArray(r.urn)
    ? r.urn.filter((b) => b && b.color in BALLS).slice(0, 6).map((b) => ({ color: b.color, count: Math.round(num(b.count, 0, 99, 1)) }))
    : d.urn;
  return {
    exp: (['coin', 'die', 'dice', 'urn'] as const).includes(r.exp as Experiment) ? (r.exp as Experiment) : d.exp,
    p: num(r.p, 0, 1, 0.5),
    faces: Math.round(num(r.faces, 2, 20, 6)),
    urn: urn.length ? urn : d.urn,
    event: Math.round(num(r.event, 0, 30, 0)),
    view: r.view === 'samples' ? 'samples' : 'trials',
    sampleSize: Math.round(num(r.sampleSize, 5, 5000, 100)),
    samples: Math.round(num(r.samples, 5, 2000, 100)),
  };
}

interface Outcomes {
  labels: string[];
  probs: number[];
  colors?: string[];
  noun: string;
}

function outcomesOf(s: SimState): Outcomes {
  switch (s.exp) {
    case 'coin':
      return { labels: ['Pile', 'Face'], probs: [s.p, 1 - s.p], noun: 'lancers' };
    case 'die':
      return { labels: Array.from({ length: s.faces }, (_, i) => String(i + 1)), probs: Array(s.faces).fill(1 / s.faces), noun: 'lancers' };
    case 'dice':
      return { labels: Array.from({ length: 11 }, (_, i) => String(i + 2)), probs: Array.from({ length: 11 }, (_, i) => (6 - Math.abs(i + 2 - 7)) / 36), noun: 'lancers' };
    case 'urn': {
      const total = s.urn.reduce((a, b) => a + b.count, 0) || 1;
      return { labels: s.urn.map((b) => BALLS[b.color].name), probs: s.urn.map((b) => b.count / total), colors: s.urn.map((b) => BALLS[b.color].color), noun: 'tirages' };
    }
  }
}

const HISTORY_MAX = 1500;

export class SimulationTab implements Tab {
  readonly panel: HTMLElement;
  private readonly rng = new Random();
  private counts: number[] = [];
  private total = 0;
  private hits = 0;
  /** Historique (n ; fréquence de l'événement), sous-échantillonné. */
  private history: [number, number][] = [];
  private historyStep = 1;
  private last: number[] = [];
  private sampleFreqs: number[] = [];
  private running = 0;
  private readonly body: HTMLElement;
  private readonly results: HTMLElement;

  constructor(private s: SimState, private readonly host: TabHost) {
    this.body = h('div');
    this.results = h('div');
    this.panel = h('div', { class: 'tab-panel' }, this.body, this.results);
    this.build();
    this.reset();
  }

  getState(): SimState {
    return this.s;
  }

  destroy(): void {
    this.stop();
  }

  private outcomes(): Outcomes {
    return outcomesOf(this.s);
  }

  private change(rebuild = true): void {
    const o = this.outcomes();
    if (this.s.event >= o.labels.length) this.s.event = 0;
    if (rebuild) this.build();
    this.reset();
    this.host.notify();
  }

  // ─── Panneau ──────────────────────────────────────────────────────────────

  private build(): void {
    const s = this.s;
    const expButton = (exp: Experiment, label: string, glyph: string) => {
      const b = h('button', { class: `exp-card${s.exp === exp ? ' is-active' : ''}`, 'aria-pressed': String(s.exp === exp), onclick: () => {
        s.exp = exp;
        s.event = exp === 'die' ? Math.min(5, s.faces - 1) : exp === 'dice' ? 5 : 0;
        this.change();
      } });
      b.innerHTML = `<span class="exp-glyph">${glyph}</span><span>${label}</span>`;
      return b;
    };
    const params: HTMLElement[] = [];
    if (s.exp === 'coin') {
      params.push(numberField('Probabilité d\'obtenir Pile', '<i>p</i>', { min: 0, max: 1, step: 0.01 }, s.p, (v) => {
        s.p = v;
        this.change(false);
        this.renderResults();
      }).el);
    } else if (s.exp === 'die') {
      params.push(h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Nombre de faces'),
        segmented([4, 6, 8, 10, 12, 20].map((n) => [String(n), String(n)] as [string, string]), String(s.faces), (v) => {
          s.faces = Number(v);
          s.event = Math.min(s.event, s.faces - 1);
          this.change();
        }).el));
    } else if (s.exp === 'urn') {
      const rows = s.urn.map((b, i) => h('div', { class: 'urn-row' },
        h('span', { class: 'ball', style: `--ball:${BALLS[b.color].color}` }),
        h('span', { class: 'urn-name' }, BALLS[b.color].name),
        h('div', { class: 'stepper' },
          h('button', { class: 'btn btn-icon btn-sm', 'aria-label': 'Retirer une boule', onclick: () => { b.count = Math.max(0, b.count - 1); this.change(); } }, svgIcon(icon('minus'), 'icon icon-sm')),
          h('span', { class: 'stepper-value' }, String(b.count)),
          h('button', { class: 'btn btn-icon btn-sm', 'aria-label': 'Ajouter une boule', onclick: () => { b.count = Math.min(99, b.count + 1); this.change(); } }, svgIcon(icon('plus'), 'icon icon-sm')),
        ),
        s.urn.length > 2 ? h('button', { class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Supprimer la couleur', onclick: () => { s.urn.splice(i, 1); this.change(); } }, svgIcon(icon('x'), 'icon icon-sm')) : h('span'),
      ));
      const free = Object.keys(BALLS).find((c) => !s.urn.some((b) => b.color === c));
      params.push(h('div', { class: 'urn' }, ...rows,
        free ? h('button', { class: 'btn btn-sm btn-ghost urn-add', onclick: () => { s.urn.push({ color: free, count: 1 }); this.change(); } }, svgIcon(icon('plus'), 'icon icon-sm'), 'Ajouter une couleur') : null,
      ));
    }
    const o = this.outcomes();
    const eventSel = h('select', { class: 'select', 'aria-label': 'Issue suivie' }, ...o.labels.map((l, i) => h('option', { value: String(i) }, s.exp === 'dice' ? `Somme = ${l}` : s.exp === 'urn' ? `Boule ${l.toLowerCase()}` : l)));
    eventSel.value = String(s.event);
    eventSel.addEventListener('change', () => {
      s.event = Number(eventSel.value);
      this.change(false);
    });
    const view = segmented<SimState['view']>([['trials', 'Lancers successifs'], ['samples', 'Échantillons']], s.view, (v) => {
      s.view = v;
      this.change();
    });

    const actions = s.view === 'trials'
      ? h('div', { class: 'sim-actions' },
        h('div', { class: 'sim-batch' }, ...[1, 10, 100, 1000, 10000].map((n) => h('button', { class: 'btn btn-sm', onclick: () => this.run(n) }, `+${fmt(n, 6)}`))),
        h('div', { class: 'sim-run' },
          h('button', { class: 'btn btn-primary sim-play', onclick: () => this.toggleRun() }),
          h('button', { class: 'btn', onclick: () => this.reset(true) }, svgIcon(icon('reset'), 'icon icon-sm'), 'Réinitialiser'),
        ),
      )
      : h('div', { class: 'sim-actions' },
        h('div', { class: 'sample-grid' },
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Taille de chaque échantillon'), this.select([25, 50, 100, 200, 500, 1000], s.sampleSize, (v) => { s.sampleSize = v; this.change(false); })),
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nombre d\'échantillons'), this.select([20, 50, 100, 200, 500, 1000], s.samples, (v) => { s.samples = v; this.change(false); })),
        ),
        h('button', { class: 'btn btn-primary btn-block', onclick: () => this.simulateSamples() }, svgIcon(icon('play'), 'icon icon-sm'), 'Simuler les échantillons'),
      );

    this.body.replaceChildren(
      section('Expérience',
        h('div', { class: 'exp-grid' },
          expButton('coin', 'Pièce', '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5.5" opacity=".45"/></svg>'),
          expButton('die', 'Dé', '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.3" class="pip"/><circle cx="12" cy="12" r="1.3" class="pip"/><circle cx="15.5" cy="15.5" r="1.3" class="pip"/></svg>'),
          expButton('dice', 'Deux dés', '<svg viewBox="0 0 24 24"><rect x="2.5" y="7" width="11" height="11" rx="2.5"/><rect x="10.5" y="3" width="11" height="11" rx="2.5"/><circle cx="16" cy="8.5" r="1.1" class="pip"/><circle cx="6" cy="14.5" r="1.1" class="pip"/></svg>'),
          expButton('urn', 'Urne', '<svg viewBox="0 0 24 24"><path d="M6 6h12l-1.5 13a2 2 0 0 1-2 1.8h-5a2 2 0 0 1-2-1.8Z"/><circle cx="10" cy="15" r="1.6" class="pip"/><circle cx="14" cy="12" r="1.6" class="pip"/></svg>'),
        ),
        ...params,
      ),
      section('Issue étudiée', eventSel, h('div', { class: 'view-switch' }, view.el)),
      section(s.view === 'trials' ? 'Lancers' : 'Fluctuation d\'échantillonnage', actions),
    );
    this.syncPlay();
  }

  private select(options: number[], value: number, onChange: (v: number) => void): HTMLSelectElement {
    const sel = h('select', { class: 'select' }, ...options.map((v) => h('option', { value: String(v) }, fmt(v, 6))));
    sel.value = String(value);
    sel.addEventListener('change', () => onChange(Number(sel.value)));
    return sel;
  }

  private renderResults(): void {
    const s = this.s;
    const o = this.outcomes();
    const p = o.probs[s.event];
    const label = this.eventLabel();
    if (s.view === 'trials') {
      const n = this.total;
      const f = n ? this.hits / n : Number.NaN;
      const half = n ? 1 / Math.sqrt(n) : Number.NaN;
      const inside = n ? Math.abs(f - p) <= half : false;
      const lastChips = this.last.slice(-24).map((i) => this.chip(i)).join('');
      this.results.replaceChildren(
        section('Résultats',
          statGrid([
            [`Nombre de ${o.noun} <i>n</i>`, fmt(n, 9)],
            [`Fréquence de ${label}`, n ? fmt(f, 5) : '—'],
            [`Probabilité <i>p</i>`, fmt(p, 5)],
            ['Écart |<i>f</i> − <i>p</i>|', n ? fmt(Math.abs(f - p), 3) : '—'],
          ]),
          n >= 25 ? html('p', `sim-note ${inside ? 'is-ok' : 'is-out'}`, `${inside ? 'Dans' : 'Hors de'} l'intervalle [<i>p</i> − 1/√<i>n</i> ; <i>p</i> + 1/√<i>n</i>] = [${fmt(p - half, 4)} ; ${fmt(p + half, 4)}]`) : html('p', 'sim-note', 'Lancez au moins 25 fois pour comparer à l\'intervalle de fluctuation.'),
          lastChips ? h('div', { class: 'last-strip' }, html('span', 'last-label', 'Derniers résultats'), html('div', 'last-chips', lastChips)) : null,
        ),
      );
    } else {
      const N = this.sampleFreqs.length;
      const half = 1 / Math.sqrt(s.sampleSize);
      const inside = this.sampleFreqs.filter((f) => Math.abs(f - p) <= half).length;
      this.results.replaceChildren(
        section('Résultats',
          statGrid([
            ['Probabilité <i>p</i>', fmt(p, 5)],
            ['Intervalle', `[${fmt(p - half, 4)} ; ${fmt(p + half, 4)}]`],
            ['Échantillons simulés', fmt(N, 6)],
            ['Dans l\'intervalle', N ? `${fmt(inside, 6)} (${pct(inside / N)})` : '—'],
          ]),
          html('p', 'sim-note', 'Au programme de seconde : pour <i>n</i> ≥ 25 et 0,2 ≤ <i>p</i> ≤ 0,8, environ 95 % des échantillons ont une fréquence dans [<i>p</i> − 1/√<i>n</i> ; <i>p</i> + 1/√<i>n</i>].'),
        ),
      );
    }
  }

  private eventLabel(): string {
    const o = this.outcomes();
    const l = o.labels[this.s.event];
    return this.s.exp === 'dice' ? `« somme = ${l} »` : this.s.exp === 'urn' ? `« boule ${l.toLowerCase()} »` : `« ${l} »`;
  }

  private chip(i: number): string {
    const o = this.outcomes();
    const l = o.labels[i];
    const hit = i === this.s.event ? ' is-hit' : '';
    if (this.s.exp === 'urn') return `<span class="ball${hit}" style="--ball:${o.colors![i]}" title="${l}"></span>`;
    if (this.s.exp === 'coin') return `<span class="chip-coin${hit}">${l[0]}</span>`;
    return `<span class="chip-die${hit}">${l}</span>`;
  }

  // ─── Simulation ───────────────────────────────────────────────────────────

  private reset(notify = false): void {
    const o = this.outcomes();
    this.counts = new Array(o.labels.length).fill(0);
    this.total = 0;
    this.hits = 0;
    this.history = [];
    this.historyStep = 1;
    this.last = [];
    this.sampleFreqs = [];
    this.renderResults();
    this.host.invalidate();
    if (notify) this.stop();
  }

  private drawOne(cum: number[]): number {
    if (this.s.exp === 'dice') {
      const a = Math.floor(this.rng.next() * 6);
      const b = Math.floor(this.rng.next() * 6);
      return a + b; // indice de la somme (2 → 0)
    }
    return this.rng.pick(cum);
  }

  private cumulative(): number[] {
    const o = this.outcomes();
    let acc = 0;
    return o.probs.map((p) => (acc += p));
  }

  run(n: number): void {
    const cum = this.cumulative();
    if (cum[cum.length - 1] <= 0) {
      this.host.toast('L\'urne est vide.', 'error');
      return;
    }
    for (let i = 0; i < n; i++) {
      const r = this.drawOne(cum);
      this.counts[r]++;
      this.total++;
      if (r === this.s.event) this.hits++;
      if (this.total % this.historyStep === 0) {
        this.history.push([this.total, this.hits / this.total]);
        if (this.history.length > HISTORY_MAX) {
          // On garde un point sur deux et on double le pas.
          this.history = this.history.filter((_, j) => j % 2 === 1);
          this.historyStep *= 2;
        }
      }
      if (n - i <= 24) this.last.push(r);
    }
    if (this.last.length > 48) this.last = this.last.slice(-24);
    this.renderResults();
    this.host.invalidate();
  }

  private toggleRun(): void {
    if (this.running) this.stop();
    else {
      const tick = () => {
        // Accélération progressive : on voit les premiers lancers un à un.
        const batch = this.total < 20 ? 1 : this.total < 200 ? 5 : this.total < 2000 ? 40 : 400;
        this.run(batch);
        this.running = window.setTimeout(tick, this.total < 20 ? 180 : 40);
      };
      tick();
    }
    this.syncPlay();
  }

  private stop(): void {
    if (this.running) window.clearTimeout(this.running);
    this.running = 0;
    this.syncPlay();
  }

  private syncPlay(): void {
    const b = this.panel.querySelector('.sim-play');
    if (!b) return;
    b.replaceChildren(svgIcon(icon(this.running ? 'pause' : 'play'), 'icon icon-sm'), this.running ? 'Pause' : 'Lancer en continu');
  }

  private simulateSamples(): void {
    const cum = this.cumulative();
    if (cum[cum.length - 1] <= 0) return;
    const { sampleSize, samples, event } = this.s;
    this.sampleFreqs = [];
    for (let j = 0; j < samples; j++) {
      let k = 0;
      for (let i = 0; i < sampleSize; i++) if (this.drawOne(cum) === event) k++;
      this.sampleFreqs.push(k / sampleSize);
    }
    this.renderResults();
    this.host.invalidate();
  }

  // ─── Dessin ───────────────────────────────────────────────────────────────

  draw(p: Painter, area: Rect, pal: ChartPalette, k: number, hits: Hit[]): void {
    const gap = 26 * k;
    const top: Rect = { x: area.x, y: area.y, w: area.w, h: (area.h - gap) * 0.5 };
    const bottom: Rect = { x: area.x, y: area.y + top.h + gap, w: area.w, h: area.h - top.h - gap };
    if (this.s.view === 'trials') {
      this.drawFrequencies(p, top, pal, k, hits);
      this.drawConvergence(p, bottom, pal, k);
    } else {
      this.drawSamples(p, top, pal, k);
      this.drawSampleDistribution(p, bottom, pal, k, hits);
    }
  }

  private drawFrequencies(p: Painter, r: Rect, pal: ChartPalette, k: number, hits: Hit[]): void {
    const o = this.outcomes();
    const n = this.total;
    const freqs = this.counts.map((c) => (n ? c / n : 0));
    const ymax = Math.max(0.05, ...freqs, ...o.probs) * 1.18;
    const body: Rect = { x: r.x, y: r.y + 30 * k, w: r.w, h: r.h - 30 * k };
    const ax = new Axes(body, -0.6, o.labels.length - 0.4, 0, ymax, {
      percentY: true,
      xTicks: o.labels.map((l, i) => ({ value: i, label: l })),
    }, k);
    chartTitle(p, r, 'Fréquences observées', pal, k, [{ color: pal.accent, label: 'observée' }, { color: pal.text, label: 'probabilité', dashed: true }], `n = ${fmt(n, 9)}`);
    ax.draw(p, pal);
    const w = Math.min(0.72, 0.72 * Math.min(1, 14 / o.labels.length) + 0.1);
    o.labels.forEach((label, i) => {
      const color = o.colors?.[i] ?? pal.accent;
      const alpha = o.colors ? (i === this.s.event ? 0.95 : 0.55) : i === this.s.event ? 0.9 : 0.28;
      bar(p, ax, i, w, freqs[i], color, alpha);
      // Probabilité théorique : trait en pointillés au-dessus de la barre
      const y = ax.y(o.probs[i]);
      line(p, ax.x(i - w / 2 - 0.08), y, ax.x(i + w / 2 + 0.08), y, { color: pal.text, width: 2 * k, dash: [5 * k, 3 * k] });
      hits.push({
        rect: { x: ax.x(i - 0.5), y: ax.plot.y, w: ax.x(i + 0.5) - ax.x(i - 0.5), h: ax.plot.h },
        html: `<b>${label}</b><br>Effectif : ${fmt(this.counts[i], 9)}<br>Fréquence : ${n ? fmt(freqs[i], 5) : '—'}<br>Probabilité : ${fmt(o.probs[i], 5)}`,
      });
    });
  }

  private drawConvergence(p: Painter, r: Rect, pal: ChartPalette, k: number): void {
    const o = this.outcomes();
    const prob = o.probs[this.s.event];
    const n = Math.max(this.total, 10);
    const body: Rect = { x: r.x, y: r.y + 30 * k, w: r.w, h: r.h - 30 * k };
    const f = this.total ? this.hits / this.total : Number.NaN;
    const ax = new Axes(body, 0, n, 0, Math.min(1, Math.max(prob * 2, prob + 0.25, 0.1)), { xLabel: 'n', integerX: true }, k);
    chartTitle(p, r, `Fréquence de ${this.eventLabel()}`, pal, k, [{ color: pal.accent, label: 'fréquence' }, { color: pal.muted, label: 'p ± 1/√n' }], Number.isFinite(f) ? `f ≈ ${fmt(f, 4)}` : undefined);
    ax.draw(p, pal);
    // Entonnoir p ± 1/√n
    const pts: [number, number][] = [];
    const steps = 160;
    for (let i = 0; i <= steps; i++) {
      const x = Math.max(1, (n * i) / steps);
      pts.push([x, 1 / Math.sqrt(x)]);
    }
    p.beginPath();
    pts.forEach(([x, d], i) => {
      const px = ax.x(x);
      const py = ax.y(Math.min(ax.y1, prob + d));
      if (i) p.lineTo(px, py);
      else p.moveTo(px, py);
    });
    for (let i = pts.length - 1; i >= 0; i--) p.lineTo(ax.x(pts[i][0]), ax.y(Math.max(0, prob - pts[i][1])));
    p.closePath();
    p.fill(pal.muted, 0.12);
    line(p, ax.plot.x, ax.y(prob), ax.plot.x + ax.plot.w, ax.y(prob), { color: pal.text, width: 1.6 * k, dash: [6 * k, 4 * k] });
    p.text(`p = ${fmt(prob, 4)}`, ax.plot.x + 8 * k, ax.y(prob) + 6 * k, { color: pal.text, size: 12 * k, weight: 600, baseline: 'top', halo: pal.bg });
    polyline(p, ax, this.history, pal.accent, 2 * k);
  }

  private drawSamples(p: Painter, r: Rect, pal: ChartPalette, k: number): void {
    const o = this.outcomes();
    const prob = o.probs[this.s.event];
    const half = 1 / Math.sqrt(this.s.sampleSize);
    const N = this.sampleFreqs.length;
    const body: Rect = { x: r.x, y: r.y + 30 * k, w: r.w, h: r.h - 30 * k };
    const lo = Math.max(0, Math.min(prob - 2 * half, ...this.sampleFreqs));
    const hi = Math.min(1, Math.max(prob + 2 * half, ...this.sampleFreqs));
    const ax = new Axes(body, 0, Math.max(N, this.s.samples) + 1, lo, hi, { xLabel: 'échantillon', integerX: true }, k);
    const inside = this.sampleFreqs.filter((f) => Math.abs(f - prob) <= half).length;
    chartTitle(p, r, `Fréquence de ${this.eventLabel()} par échantillon (n = ${fmt(this.s.sampleSize, 6)})`, pal, k, [], N ? `${pct(inside / N, 3)} dans l'intervalle` : undefined);
    ax.draw(p, pal);
    p.beginPath();
    p.rect(ax.plot.x, ax.y(Math.min(hi, prob + half)), ax.plot.w, ax.y(Math.max(lo, prob - half)) - ax.y(Math.min(hi, prob + half)));
    p.fill(pal.accent, 0.1);
    for (const y of [prob - half, prob + half]) line(p, ax.plot.x, ax.y(y), ax.plot.x + ax.plot.w, ax.y(y), { color: pal.accent, width: 1.3 * k, dash: [5 * k, 4 * k] });
    line(p, ax.plot.x, ax.y(prob), ax.plot.x + ax.plot.w, ax.y(prob), { color: pal.text, width: 1.4 * k });
    const xs = this.sampleFreqs.map((_, i) => i + 1);
    const inX: number[] = [];
    const inY: number[] = [];
    const outX: number[] = [];
    const outY: number[] = [];
    this.sampleFreqs.forEach((f, i) => {
      if (Math.abs(f - prob) <= half) {
        inX.push(xs[i]);
        inY.push(f);
      } else {
        outX.push(xs[i]);
        outY.push(f);
      }
    });
    const rad = (N > 300 ? 2.2 : 3.4) * k;
    points(p, ax, inX, inY, pal.accent, rad, pal);
    points(p, ax, outX, outY, pal.danger, rad, pal);
    if (!N) p.text('Cliquez sur « Simuler les échantillons ».', ax.plot.x + ax.plot.w / 2, ax.plot.y + ax.plot.h / 2, { color: pal.muted, size: 14 * k, align: 'center', baseline: 'middle' });
  }

  private drawSampleDistribution(p: Painter, r: Rect, pal: ChartPalette, k: number, hits: Hit[]): void {
    const o = this.outcomes();
    const prob = o.probs[this.s.event];
    const n = this.s.sampleSize;
    const N = this.sampleFreqs.length;
    const B = lawSpec('binomial').make({ n, p: prob });
    // Répartition des fréquences observées (k/n) comparée à la loi binomiale.
    const counts = new Map<number, number>();
    for (const f of this.sampleFreqs) counts.set(Math.round(f * n), (counts.get(Math.round(f * n)) ?? 0) + 1);
    const [k0, k1] = B.range;
    const ymax = Math.max(...[...counts.values()].map((c) => c / Math.max(N, 1)), B.pdf(B.quantile(0.5)), 0.02) * 1.2;
    const body: Rect = { x: r.x, y: r.y + 30 * k, w: r.w, h: r.h - 30 * k };
    const ax = new Axes(body, k0 / n - 0.5 / n, k1 / n + 0.5 / n, 0, ymax, { percentY: true, xLabel: 'f' }, k);
    chartTitle(p, r, 'Répartition des fréquences des échantillons', pal, k, [{ color: pal.accent, label: 'observée' }, { color: pal.text, label: 'loi binomiale', dashed: true }]);
    ax.draw(p, pal);
    const w = Math.max(1 / n * 0.8, (ax.x1 - ax.x0) / 400);
    for (const [kk, c] of counts) bar(p, ax, kk / n, w, c / N, pal.accent, 0.75);
    const pts: [number, number][] = [];
    for (let kk = k0; kk <= k1; kk++) pts.push([kk / n, B.pdf(kk)]);
    polyline(p, ax, pts, pal.text, 1.6 * k, [5 * k, 3 * k]);
    for (let kk = k0; kk <= k1; kk++) {
      const x0 = ax.x((kk - 0.5) / n);
      hits.push({ rect: { x: x0, y: ax.plot.y, w: ax.x((kk + 0.5) / n) - x0, h: ax.plot.h }, html: `<b>f = ${fmt(kk / n, 4)}</b><br>Échantillons : ${counts.get(kk) ?? 0}<br>Probabilité binomiale : ${fmt(B.pdf(kk), 4)}` });
    }
  }
}
