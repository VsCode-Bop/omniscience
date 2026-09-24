/**
 * Onglet « Lois » : loi choisie, paramètres, calcul de P(X = k), P(X ≤ b), P(a ≤ X ≤ b),
 * seuils et intervalles ; diagramme ou densité avec la zone correspondante, et
 * fonction de répartition.
 */
import { h } from '../../core/dom';
import { line, MATH_FONT, type Painter } from '../../core/graphics/painter';
import { fmt } from '../../core/math/format';
import { area, Axes, bar, chartTitle, curve, polyline, type ChartPalette, type Rect } from './charts';
import { evaluate, LAWS, lawSpec, type Law, type LawId, type Query, type QueryResult } from './distributions';
import { html, numberField, parseNum, section, statGrid, type Hit, type Tab, type TabHost } from './ui';

export type QueryKind = Query['kind'];

export interface LawState {
  id: LawId;
  params: Record<string, number>;
  query: QueryKind;
  a: number;
  b: number;
  k: number;
  alpha: number;
  level: number;
  approx: boolean;
}

export function defaultLaw(): LawState {
  return { id: 'binomial', params: { ...lawSpec('binomial').defaults }, query: 'between', a: 4, b: 8, k: 6, alpha: 0.95, level: 0.95, approx: false };
}

export function sanitizeLaw(raw: unknown): LawState {
  const d = defaultLaw();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<LawState>;
  const spec = LAWS.find((l) => l.id === r.id);
  if (!spec) return d;
  const params: Record<string, number> = { ...spec.defaults };
  for (const p of spec.params) {
    const v = r.params?.[p.key];
    if (typeof v === 'number' && Number.isFinite(v)) params[p.key] = v;
  }
  const num = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
  const kinds: QueryKind[] = ['eq', 'le', 'ge', 'between', 'quantile', 'interval'];
  return {
    id: spec.id,
    params,
    query: kinds.includes(r.query as QueryKind) ? (r.query as QueryKind) : d.query,
    a: num(r.a, d.a), b: num(r.b, d.b), k: num(r.k, d.k),
    alpha: Math.min(0.9999, Math.max(0.0001, num(r.alpha, d.alpha))),
    level: Math.min(0.9999, Math.max(0.5, num(r.level, d.level))),
    approx: r.approx === true,
  };
}

/** Paramètres valides pour la loi (p ∈ [0 ; 1], σ > 0…). */
function clampParams(id: LawId, p: Record<string, number>): Record<string, number> {
  const q = { ...p };
  if ('p' in q) q.p = Math.min(1, Math.max(id === 'geometric' ? 0.001 : 0, q.p));
  if ('sigma' in q) q.sigma = Math.max(1e-6, q.sigma);
  if ('lambda' in q) q.lambda = Math.max(1e-6, q.lambda);
  if (id === 'binomial') q.n = Math.max(1, Math.min(100000, Math.round(q.n)));
  if (id === 'hypergeometric') {
    q.N = Math.max(1, Math.min(100000, Math.round(q.N)));
    q.K = Math.max(0, Math.min(q.N, Math.round(q.K)));
    q.n = Math.max(1, Math.min(q.N, Math.round(q.n)));
  }
  return q;
}

export class LawsTab implements Tab {
  readonly panel: HTMLElement;
  private law!: Law;
  private result!: QueryResult;
  private readonly head: HTMLElement;
  private readonly paramsEl: HTMLElement;
  private readonly queryEl: HTMLElement;
  private readonly resultEl: HTMLElement;
  private readonly formula: HTMLElement;

  constructor(private s: LawState, private readonly host: TabHost) {
    this.head = h('div');
    this.formula = h('div', { class: 'law-formula' });
    this.paramsEl = h('div', { class: 'law-params' });
    this.queryEl = h('div');
    this.resultEl = h('div');
    this.panel = h('div', { class: 'tab-panel' },
      section('Loi de probabilité', this.head, this.formula, this.paramsEl),
      section('Calcul', this.queryEl),
      this.resultEl,
    );
    this.buildHead();
    this.buildParams();
    this.buildQuery();
    this.compute();
  }

  getState(): LawState {
    return this.s;
  }

  private spec() {
    return lawSpec(this.s.id);
  }

  private buildHead(): void {
    const sel = h('select', { class: 'select law-select', 'aria-label': 'Loi' },
      h('optgroup', { label: 'Lois discrètes' }, ...LAWS.filter((l) => l.discrete).map((l) => h('option', { value: l.id }, l.name))),
      h('optgroup', { label: 'Lois à densité' }, ...LAWS.filter((l) => !l.discrete).map((l) => h('option', { value: l.id }, l.name))),
    );
    sel.value = this.s.id;
    sel.addEventListener('change', () => {
      const spec = lawSpec(sel.value as LawId);
      this.s.id = spec.id;
      this.s.params = { ...spec.defaults };
      if (!spec.discrete && this.s.query === 'eq') this.s.query = 'le';
      const L = spec.make(this.s.params);
      // Bornes par défaut adaptées à la nouvelle loi.
      const m = L.mean;
      const sd = Math.sqrt(L.variance);
      const round = (v: number) => (spec.discrete ? Math.round(v) : Number(v.toPrecision(3)));
      this.s.a = round(m - sd);
      this.s.b = round(m + sd);
      this.s.k = round(m);
      this.buildParams();
      this.buildQuery();
      this.renderTex();
      this.compute();
      this.host.notify();
    });
    this.head.replaceChildren(sel);
  }

  renderTex(): void {
    if (!this.host.renderTex(this.formula, this.spec().formula)) this.formula.textContent = '';
  }

  private buildParams(): void {
    const spec = this.spec();
    this.paramsEl.replaceChildren(...spec.params.map((ps) => numberField(ps.label, ps.symbol, ps, this.s.params[ps.key] ?? spec.defaults[ps.key], (v) => {
      this.s.params[ps.key] = v;
      this.compute();
      this.host.notify();
    }).el));
  }

  private buildQuery(): void {
    const discrete = this.spec().discrete;
    const kinds: [QueryKind, string][] = [
      ...(discrete ? [['eq', '<i>P</i>(<i>X</i> = <i>k</i>)'] as [QueryKind, string]] : []),
      ['le', '<i>P</i>(<i>X</i> ≤ <i>b</i>)'],
      ['ge', '<i>P</i>(<i>X</i> ≥ <i>a</i>)'],
      ['between', '<i>P</i>(<i>a</i> ≤ <i>X</i> ≤ <i>b</i>)'],
      ['quantile', 'Seuil'],
      ['interval', 'Intervalle'],
    ];
    const grid = h('div', { class: 'query-grid' }, ...kinds.map(([kind, label]) => {
      const b = h('button', { class: `query-btn${this.s.query === kind ? ' is-active' : ''}`, 'aria-pressed': String(this.s.query === kind), onclick: () => {
        this.s.query = kind;
        this.buildQuery();
        this.compute();
        this.host.notify();
      } });
      b.innerHTML = label;
      return b;
    }));
    const field = (label: string, key: 'a' | 'b' | 'k' | 'alpha' | 'level', hint = '') => {
      const input = h('input', { class: 'input input-mono', type: 'text', inputmode: 'decimal', 'aria-label': label });
      input.value = fmt(this.s[key], 8).replace(/\s/g, '');
      input.addEventListener('input', () => {
        let v = parseNum(input.value.replace('%', ''));
        if (!Number.isFinite(v)) return;
        if ((key === 'alpha' || key === 'level') && v > 1) v /= 100; // « 95 » ou « 95 % »
        this.s[key] = v;
        this.compute();
        this.host.notify();
      });
      const el = h('label', { class: 'query-field' });
      el.innerHTML = `<span>${label}</span>`;
      el.append(input);
      if (hint) el.append(html('small', 'muted', hint));
      return el;
    };
    const inputs: HTMLElement[] = [];
    switch (this.s.query) {
      case 'eq': inputs.push(field('<i>k</i> =', 'k')); break;
      case 'le': inputs.push(field('<i>b</i> =', 'b')); break;
      case 'ge': inputs.push(field('<i>a</i> =', 'a')); break;
      case 'between': inputs.push(field('<i>a</i> =', 'a'), field('<i>b</i> =', 'b')); break;
      case 'quantile': inputs.push(field('<i>P</i>(<i>X</i> ≤ <i>x</i>) ≥', 'alpha', 'probabilité à atteindre')); break;
      case 'interval': inputs.push(field('Niveau', 'level', 'ex. 0,95')); break;
    }
    const approx = this.s.id === 'binomial' || this.s.id === 'poisson'
      ? (() => {
        const input = h('input', { type: 'checkbox', class: 'switch', checked: this.s.approx });
        input.addEventListener('change', () => {
          this.s.approx = input.checked;
          this.host.invalidate();
          this.host.notify();
        });
        return h('label', { class: 'option-row' }, h('span', null, 'Approximation par une loi normale'), input);
      })()
      : null;
    this.queryEl.replaceChildren(grid, h('div', { class: 'query-inputs' }, ...inputs), ...(approx ? [approx] : []));
  }

  private query(): Query {
    const s = this.s;
    switch (s.query) {
      case 'eq': return { kind: 'eq', k: s.k };
      case 'le': return { kind: 'le', b: s.b };
      case 'ge': return { kind: 'ge', a: s.a };
      case 'between': return { kind: 'between', a: s.a, b: s.b };
      case 'quantile': return { kind: 'quantile', alpha: s.alpha };
      case 'interval': return { kind: 'interval', level: s.level };
    }
  }

  /** Écriture de la probabilité calculée (HTML). */
  private label(): string {
    const s = this.s;
    const P = (inner: string) => `<i>P</i>(${inner})`;
    const X = '<i>X</i>';
    const n = (v: number) => fmt(v, 8);
    const r = this.result;
    switch (s.query) {
      case 'eq': return P(`${X} = ${n(s.k)}`);
      case 'le': return P(`${X} ≤ ${n(s.b)}`);
      case 'ge': return P(`${X} ≥ ${n(s.a)}`);
      case 'between': return P(`${n(Math.min(s.a, s.b))} ≤ ${X} ≤ ${n(Math.max(s.a, s.b))}`);
      case 'quantile': return P(`${X} ≤ ${n(r.bounds![0])}`);
      case 'interval': return P(`${n(r.bounds![0])} ≤ ${X} ≤ ${n(r.bounds![1])}`);
    }
  }

  private compute(): void {
    const spec = this.spec();
    this.s.params = clampParams(spec.id, this.s.params);
    this.law = spec.make(this.s.params);
    this.result = evaluate(this.law, this.query());
    const L = this.law;
    const r = this.result;
    let lead = '';
    if (this.s.query === 'quantile') {
      lead = spec.discrete
        ? `Plus petit entier <i>k</i> tel que <i>P</i>(<i>X</i> ≤ <i>k</i>) ≥ ${fmt(this.s.alpha, 6)} : <b><i>k</i> = ${fmt(r.bounds![0], 8)}</b>`
        : `<i>x</i> tel que <i>P</i>(<i>X</i> ≤ <i>x</i>) = ${fmt(this.s.alpha, 6)} : <b><i>x</i> ≈ ${fmt(r.bounds![0], 6)}</b>`;
    } else if (this.s.query === 'interval') {
      lead = `Intervalle ${spec.discrete ? '' : 'centré '}au niveau ${fmt(this.s.level * 100, 4)} % : <b>[${fmt(r.bounds![0], 6)} ; ${fmt(r.bounds![1], 6)}]</b>`;
    }
    this.resultEl.replaceChildren(
      h('section', { class: 'panel-section' },
        h('div', { class: 'result-card' },
          html('div', 'result-law', `<i>X</i> ∼ ${spec.notation(this.s.params)}`),
          html('div', 'result-main', `${this.label()} ${this.result.value === 0 || this.result.value === 1 || this.exact() ? '=' : '≈'} <b>${fmt(r.value, 6)}</b>`),
          lead ? html('div', 'result-lead', lead) : null,
          html('div', 'result-pct', `soit environ ${fmt(r.value * 100, 4)} %`),
        ),
        statGrid([
          ['Espérance <i>E</i>(<i>X</i>)', fmt(L.mean, 7)],
          ['Variance <i>V</i>(<i>X</i>)', fmt(L.variance, 7)],
          ['Écart-type <i>σ</i>(<i>X</i>)', fmt(Math.sqrt(L.variance), 7)],
        ], 'stat-grid-3'),
      ),
    );
    this.host.invalidate();
  }

  /** Valeur exacte (probabilité rationnelle simple) : uniforme discrète. */
  private exact(): boolean {
    return this.s.id === 'uniformDiscrete' && this.s.query !== 'quantile';
  }

  // ─── Dessin ───────────────────────────────────────────────────────────────

  draw(p: Painter, rect: Rect, pal: ChartPalette, k: number, hits: Hit[]): void {
    const gap = 26 * k;
    const top: Rect = { x: rect.x, y: rect.y, w: rect.w, h: (rect.h - gap) * 0.62 };
    const bottom: Rect = { x: rect.x, y: rect.y + top.h + gap, w: rect.w, h: rect.h - top.h - gap };
    const spec = this.spec();
    const L = this.law;
    const r = this.result;
    const [lo, hi] = L.range;
    const highlight = `${this.plainLabel()} ≈ ${fmt(r.value, 5)}`;
    const inRange = (x: number) => x >= r.lo - 1e-9 && x <= r.hi + 1e-9;
    const approx = this.s.approx && (this.s.id === 'binomial' || this.s.id === 'poisson');
    const sd = Math.sqrt(L.variance);
    const normalPdf = (x: number) => Math.exp(-(((x - L.mean) / sd) ** 2) / 2) / (sd * Math.sqrt(2 * Math.PI));

    // Loi
    const body: Rect = { x: top.x, y: top.y + 30 * k, w: top.w, h: top.h - 30 * k };
    if (spec.discrete) {
      let ymax = 0;
      for (let x = lo; x <= hi; x++) ymax = Math.max(ymax, L.pdf(x));
      const ax = new Axes(body, lo - 0.7, hi + 0.7, 0, Math.max(ymax * 1.15, 1e-9), { xLabel: 'k', integerX: true }, k);
      chartTitle(p, top, `Loi de X : P(X = k)`, pal, k, approx ? [{ color: pal.danger, label: 'loi normale', dashed: true }] : [], highlight);
      ax.draw(p, pal);
      const w = Math.min(0.8, Math.max(0.25, 0.8));
      for (let x = lo; x <= hi; x++) {
        const v = L.pdf(x);
        const on = inRange(x);
        bar(p, ax, x, w, v, on ? pal.accent : pal.muted, on ? 0.9 : 0.35);
        const x0 = ax.x(x - 0.5);
        hits.push({ rect: { x: x0, y: ax.plot.y, w: ax.x(x + 0.5) - x0, h: ax.plot.h }, html: `<i>P</i>(<i>X</i> = ${fmt(x, 8)}) ≈ ${fmt(v, 6)}<br><i>P</i>(<i>X</i> ≤ ${fmt(x, 8)}) ≈ ${fmt(L.cdf(x), 6)}` });
      }
      if (approx) curve(p, ax, normalPdf, pal.danger, 2 * k, [6 * k, 4 * k]);
      this.drawMean(p, ax, pal, k);
    } else {
      let ymax = 0;
      for (let i = 0; i <= 200; i++) ymax = Math.max(ymax, L.pdf(lo + ((hi - lo) * i) / 200));
      const ax = new Axes(body, lo, hi, 0, ymax * 1.15, { xLabel: 'x' }, k);
      chartTitle(p, top, 'Densité de X', pal, k, [], highlight);
      ax.draw(p, pal);
      area(p, ax, L.pdf, Math.max(r.lo, lo), Math.min(r.hi, hi), pal.accent, 0.3);
      curve(p, ax, L.pdf, pal.accent, 2.4 * k);
      for (const x of [r.lo, r.hi]) {
        if (!Number.isFinite(x) || x < lo || x > hi) continue;
        line(p, ax.x(x), ax.y(0), ax.x(x), ax.y(L.pdf(x)), { color: pal.accent, width: 1.5 * k });
        p.text(fmt(x, 5), ax.x(x), ax.y(0) + 22 * k, { color: pal.accent, size: 12 * k, weight: 600, align: 'center', baseline: 'top', halo: pal.bg });
      }
      this.drawMean(p, ax, pal, k);
      const steps = 120;
      for (let i = 0; i < steps; i++) {
        const x = lo + ((hi - lo) * (i + 0.5)) / steps;
        const x0 = ax.x(lo + ((hi - lo) * i) / steps);
        hits.push({ rect: { x: x0, y: ax.plot.y, w: ax.plot.w / steps, h: ax.plot.h }, html: `<i>x</i> = ${fmt(x, 4)}<br><i>f</i>(<i>x</i>) ≈ ${fmt(L.pdf(x), 4)}<br><i>P</i>(<i>X</i> ≤ <i>x</i>) ≈ ${fmt(L.cdf(x), 4)}` });
      }
    }

    // Fonction de répartition
    const body2: Rect = { x: bottom.x, y: bottom.y + 30 * k, w: bottom.w, h: bottom.h - 30 * k };
    const ax2 = new Axes(body2, spec.discrete ? lo - 0.7 : lo, spec.discrete ? hi + 0.7 : hi, 0, 1.05, { integerX: spec.discrete }, k);
    chartTitle(p, bottom, 'Fonction de répartition F(x) = P(X ≤ x)', pal, k);
    ax2.draw(p, pal);
    if (spec.discrete) {
      const pts: [number, number][] = [[ax2.x0, L.cdf(ax2.x0)]];
      for (let x = Math.ceil(ax2.x0); x <= Math.floor(ax2.x1); x++) {
        pts.push([x, L.cdf(x - 1)], [x, L.cdf(x)]);
      }
      pts.push([ax2.x1, L.cdf(ax2.x1)]);
      polyline(p, ax2, pts, pal.accent, 2 * k);
    } else {
      curve(p, ax2, L.cdf, pal.accent, 2.2 * k);
    }
    // Repères de la requête
    for (const x of [r.lo, r.hi]) {
      if (!Number.isFinite(x) || x < ax2.x0 || x > ax2.x1) continue;
      const y = L.cdf(x);
      const dash = { color: pal.muted, width: 1.2 * k, dash: [4 * k, 4 * k] };
      line(p, ax2.x(x), ax2.y(0), ax2.x(x), ax2.y(y), dash);
      line(p, ax2.plot.x, ax2.y(y), ax2.x(x), ax2.y(y), dash);
      p.text(fmt(y, 4), ax2.plot.x + 4 * k, ax2.y(y) - 4 * k, { color: pal.text, size: 11.5 * k, baseline: 'bottom', halo: pal.bg });
    }
  }

  private drawMean(p: Painter, ax: Axes, pal: ChartPalette, k: number): void {
    const m = this.law.mean;
    if (m < ax.x0 || m > ax.x1) return;
    line(p, ax.x(m), ax.plot.y, ax.x(m), ax.plot.y + ax.plot.h, { color: pal.text, width: 1.2 * k, dash: [3 * k, 4 * k], alpha: 0.7 });
    p.text('E(X)', ax.x(m) + 5 * k, ax.plot.y + 4 * k, { color: pal.muted, size: 12 * k, italic: true, family: MATH_FONT, baseline: 'top', halo: pal.bg });
  }

  private plainLabel(): string {
    return this.label().replace(/<[^>]+>/g, '');
  }
}
