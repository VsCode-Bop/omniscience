/**
 * Onglet « Statistiques » : série à une variable (indicateurs, boîte à moustaches,
 * diagramme en bâtons, histogramme, effectifs cumulés) ou série double (nuage de
 * points, droite des moindres carrés, coefficient de corrélation).
 */
import { h } from '../../core/dom';
import { disc, line, MATH_FONT, type Painter } from '../../core/graphics/painter';
import { fmt } from '../../core/math/format';
import { Axes, bar, boxPlot, chartTitle, points, polyline, type ChartPalette, type Rect } from './charts';
import { histogram, linearRegression, parsePairs, parseSeries, summarize, type Regression, type Series, type Summary } from './stats';
import { html, parseNum, section, segmented, statGrid, type Hit, type Tab, type TabHost } from './ui';

export interface StatsState {
  mode: 'one' | 'two';
  data: string;
  pairs: string;
  chart: 'bars' | 'hist' | 'cumul';
  classes: number;
  predict: string;
  xName: string;
  yName: string;
}

interface Dataset {
  title: string;
  mode: StatsState['mode'];
  text: string;
  chart?: StatsState['chart'];
  xName?: string;
  yName?: string;
}

const DATASETS: Dataset[] = [
  { title: 'Notes d\'un devoir (sur 20)', mode: 'one', chart: 'bars', text: '12 8 15 11 9 14 17 10 13 12 6 18 11 14 9 13 16 10 12 15 7 13 11 19 12 14 8 16 13 10' },
  { title: 'Tailles d\'élèves (cm), valeur ; effectif', mode: 'one', chart: 'hist', text: '150 ; 2\n155 ; 5\n158 ; 7\n160 ; 11\n163 ; 9\n165 ; 12\n168 ; 8\n170 ; 10\n174 ; 6\n178 ; 4\n182 ; 2' },
  { title: 'Temps de trajet domicile-lycée (min)', mode: 'one', chart: 'hist', text: '5 12 18 25 7 9 15 22 31 14 11 8 19 27 45 13 10 16 21 6 12 17 24 33 9 14 20 11 15 38 12 8 26 18 13' },
  { title: 'Loi de Hooke : masse (g) ; allongement (cm)', mode: 'two', xName: 'm (g)', yName: 'ΔL (cm)', text: '0 ; 0\n50 ; 1,1\n100 ; 2,0\n150 ; 3,1\n200 ; 3,9\n250 ; 5,0\n300 ; 6,1\n350 ; 6,9' },
  { title: 'Loi d\'Ohm : tension (V) ; intensité (mA)', mode: 'two', xName: 'U (V)', yName: 'I (mA)', text: '0 ; 0\n1 ; 10,4\n2 ; 21,5\n3 ; 30,8\n4 ; 42,1\n5 ; 51,9\n6 ; 62,3' },
  { title: 'Altitude (m) ; température (°C)', mode: 'two', xName: 'altitude (m)', yName: 'θ (°C)', text: '200 ; 18,2\n500 ; 16,1\n800 ; 14,3\n1100 ; 12,4\n1500 ; 9,6\n1900 ; 7,3\n2400 ; 4,1\n2800 ; 1,6' },
];

export function defaultStats(): StatsState {
  return { mode: 'one', data: DATASETS[0].text, pairs: DATASETS[3].text, chart: 'bars', classes: 0, predict: '', xName: DATASETS[3].xName!, yName: DATASETS[3].yName! };
}

export function sanitizeStats(raw: unknown): StatsState {
  const d = defaultStats();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<StatsState>;
  const str = (v: unknown, def: string, max = 20000) => (typeof v === 'string' && v.length <= max ? v : def);
  return {
    mode: r.mode === 'two' ? 'two' : 'one',
    data: str(r.data, d.data),
    pairs: str(r.pairs, d.pairs),
    chart: r.chart === 'hist' || r.chart === 'cumul' ? r.chart : 'bars',
    classes: typeof r.classes === 'number' && Number.isFinite(r.classes) ? Math.max(0, Math.min(60, Math.round(r.classes))) : 0,
    predict: str(r.predict, '', 40),
    xName: str(r.xName, 'x', 40),
    yName: str(r.yName, 'y', 40),
  };
}

export class StatsTab implements Tab {
  readonly panel: HTMLElement;
  private series: Series = { values: [], counts: [] };
  private summary: Summary | null = null;
  private xs: number[] = [];
  private ys: number[] = [];
  private reg: Regression | null = null;
  private readonly editor: HTMLElement;
  private readonly results: HTMLElement;

  constructor(private s: StatsState, private readonly host: TabHost) {
    this.editor = h('div');
    this.results = h('div');
    const mode = segmented<StatsState['mode']>([['one', 'Une variable'], ['two', 'Deux variables']], s.mode, (v) => {
      this.s.mode = v;
      mode.set(v);
      this.buildEditor();
      this.compute();
      this.host.notify();
    });
    this.panel = h('div', { class: 'tab-panel' },
      section('Série statistique', mode.el, this.editor),
      this.results,
    );
    this.buildEditor();
    this.compute();
  }

  getState(): StatsState {
    return this.s;
  }

  private buildEditor(): void {
    const two = this.s.mode === 'two';
    const area = h('textarea', {
      class: 'input data-input', rows: '7', spellcheck: false,
      placeholder: two ? 'Une ligne par point : x ; y' : 'Valeurs séparées par des espaces, ou lignes « valeur ; effectif »',
      'aria-label': 'Données',
    });
    area.value = two ? this.s.pairs : this.s.data;
    area.addEventListener('input', () => {
      if (two) this.s.pairs = area.value;
      else this.s.data = area.value;
      this.compute();
      this.host.notify();
    });
    const examples = h('select', { class: 'select select-sm', 'aria-label': 'Exemples de données' },
      h('option', { value: '' }, 'Charger un exemple…'),
      ...DATASETS.map((d, i) => (d.mode === this.s.mode ? h('option', { value: String(i) }, d.title) : null)),
    );
    examples.addEventListener('change', () => {
      const d = DATASETS[Number(examples.value)];
      if (!d) return;
      if (two) {
        this.s.pairs = d.text;
        this.s.xName = d.xName ?? 'x';
        this.s.yName = d.yName ?? 'y';
      } else {
        this.s.data = d.text;
        if (d.chart) this.s.chart = d.chart;
      }
      this.s.classes = 0;
      this.buildEditor();
      this.compute();
      this.host.notify();
    });
    const extra: HTMLElement[] = [];
    if (two) {
      const name = (key: 'xName' | 'yName', label: string) => {
        const input = h('input', { class: 'input input-sm', type: 'text', 'aria-label': label });
        input.value = this.s[key];
        input.addEventListener('input', () => {
          this.s[key] = input.value.slice(0, 40);
          this.host.invalidate();
          this.host.notify();
        });
        return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input);
      };
      extra.push(h('div', { class: 'names-grid' }, name('xName', 'Nom de x'), name('yName', 'Nom de y')));
    }
    this.editor.replaceChildren(h('div', { class: 'data-head' }, examples), area, html('p', 'data-hint', two
      ? 'Collez deux colonnes d\'un tableur, ou écrivez « x ; y » sur chaque ligne.'
      : 'Virgule décimale acceptée. Pour une série à effectifs : une ligne « valeur ; effectif ».'), ...extra);
  }

  private compute(): void {
    if (this.s.mode === 'one') {
      const { series, errors } = parseSeries(this.s.data);
      this.series = series;
      this.summary = summarize(series);
      this.renderOne(errors);
    } else {
      const { xs, ys, errors } = parsePairs(this.s.pairs);
      this.xs = xs;
      this.ys = ys;
      this.reg = linearRegression(xs, ys);
      this.renderTwo(errors);
    }
    this.host.invalidate();
  }

  private renderOne(errors: number): void {
    const s = this.summary;
    const chart = segmented<StatsState['chart']>([['bars', 'Bâtons'], ['hist', 'Histogramme'], ['cumul', 'Effectifs cumulés']], this.s.chart, (v) => {
      this.s.chart = v;
      chart.set(v);
      this.renderOne(errors);
      this.host.invalidate();
      this.host.notify();
    });
    const classes = this.s.chart === 'hist' ? (() => {
      const sel = h('select', { class: 'select select-sm', 'aria-label': 'Nombre de classes' },
        h('option', { value: '0' }, 'Classes : automatique'),
        ...[3, 4, 5, 6, 8, 10, 12, 15, 20].map((n) => h('option', { value: String(n) }, `${n} classes`)),
      );
      sel.value = String(this.s.classes);
      sel.addEventListener('change', () => {
        this.s.classes = Number(sel.value);
        this.host.invalidate();
        this.host.notify();
      });
      return sel;
    })() : null;
    this.results.replaceChildren(
      section('Représentation', chart.el, classes),
      section('Indicateurs',
        errors ? html('p', 'data-error', `${errors} valeur${errors > 1 ? 's' : ''} ignorée${errors > 1 ? 's' : ''} (non numérique${errors > 1 ? 's' : ''}).`) : null,
        s ? statGrid([
          ['Effectif total <i>N</i>', fmt(s.n, 9)],
          ['Moyenne <i>x̄</i>', fmt(s.mean, 6)],
          ['Médiane', fmt(s.median, 6)],
          ['Écart-type <i>σ</i>', fmt(s.sd, 6)],
          ['1<sup>er</sup> quartile <i>Q</i><sub>1</sub>', fmt(s.q1, 6)],
          ['3<sup>e</sup> quartile <i>Q</i><sub>3</sub>', fmt(s.q3, 6)],
          ['Écart interquartile', fmt(s.q3 - s.q1, 6)],
          ['Variance <i>V</i>', fmt(s.variance, 6)],
          ['Minimum', fmt(s.min, 6)],
          ['Maximum', fmt(s.max, 6)],
          ['Étendue', fmt(s.max - s.min, 6)],
          ['Mode', s.modes.length ? s.modes.map((m) => fmt(m, 6)).join(' ; ') : '—'],
          ['1<sup>er</sup> décile <i>D</i><sub>1</sub>', fmt(s.d1, 6)],
          ['9<sup>e</sup> décile <i>D</i><sub>9</sub>', fmt(s.d9, 6)],
        ]) : html('p', 'muted', 'Saisissez au moins une valeur.'),
        html('p', 'data-hint', 'Quartiles selon la définition du lycée : <i>Q</i><sub>1</sub> est la plus petite valeur de la série telle qu\'au moins 25 % des valeurs lui soient inférieures ou égales.'),
      ),
    );
  }

  private renderTwo(errors: number): void {
    const r = this.reg;
    const predictIn = h('input', { class: 'input input-mono', type: 'text', inputmode: 'decimal', placeholder: 'valeur de x', 'aria-label': 'Valeur de x pour l\'estimation' });
    predictIn.value = this.s.predict;
    const out = h('span', { class: 'predict-out' });
    const update = () => {
      const x = parseNum(predictIn.value);
      out.innerHTML = r && Number.isFinite(x) ? `<i>y</i> ≈ <b>${fmt(r.a * x + r.b, 6)}</b>` : '';
    };
    predictIn.addEventListener('input', () => {
      this.s.predict = predictIn.value;
      update();
      this.host.invalidate();
      this.host.notify();
    });
    update();
    const sign = (v: number) => (v < 0 ? '−' : '+');
    this.results.replaceChildren(
      section('Ajustement affine',
        errors ? html('p', 'data-error', `${errors} ligne${errors > 1 ? 's' : ''} ignorée${errors > 1 ? 's' : ''}.`) : null,
        r ? h('div', { class: 'result-card' },
          html('div', 'result-law', 'Droite des moindres carrés'),
          html('div', 'result-main', `<i>y</i> = ${fmt(r.a, 5)}<i>x</i> ${sign(r.b)} ${fmt(Math.abs(r.b), 5)}`),
          html('div', 'result-pct', `Coefficient de corrélation <i>r</i> ≈ ${fmt(r.r, 4)} · <i>r</i>² ≈ ${fmt(r.r * r.r, 4)}`),
        ) : html('p', 'muted', 'Saisissez au moins deux points d\'abscisses différentes.'),
        r ? statGrid([
          ['Nombre de points', fmt(r.n, 6)],
          ['Point moyen <i>G</i>', `(${fmt(r.meanX, 5)} ; ${fmt(r.meanY, 5)})`],
          ['Covariance', fmt(r.covariance, 5)],
          ['Corrélation', Math.abs(r.r) > 0.95 ? 'très forte' : Math.abs(r.r) > 0.8 ? 'forte' : Math.abs(r.r) > 0.5 ? 'modérée' : 'faible'],
        ]) : null,
      ),
      ...(r ? [section('Estimation', h('div', { class: 'predict' }, html('span', '', 'Pour <i>x</i> ='), predictIn, out))] : []),
    );
  }

  // ─── Dessin ───────────────────────────────────────────────────────────────

  draw(p: Painter, rect: Rect, pal: ChartPalette, k: number, hits: Hit[]): void {
    if (this.s.mode === 'two') this.drawScatter(p, rect, pal, k, hits);
    else this.drawOne(p, rect, pal, k, hits);
  }

  private drawOne(p: Painter, rect: Rect, pal: ChartPalette, k: number, hits: Hit[]): void {
    const s = this.summary;
    if (!s) {
      p.text('Aucune donnée', rect.x + rect.w / 2, rect.y + rect.h / 2, { color: pal.muted, size: 15 * k, align: 'center', baseline: 'middle' });
      return;
    }
    const gap = 26 * k;
    const boxH = Math.min(170 * k, rect.h * 0.3);
    const top: Rect = { x: rect.x, y: rect.y, w: rect.w, h: boxH };
    const bottom: Rect = { x: rect.x, y: rect.y + boxH + gap, w: rect.w, h: rect.h - boxH - gap };
    const span = s.max - s.min || Math.max(1, Math.abs(s.max));
    const x0 = s.min - span * 0.06;
    const x1 = s.max + span * 0.06;

    // Boîte à moustaches
    const boxBody: Rect = { x: top.x, y: top.y + 30 * k, w: top.w, h: top.h - 30 * k };
    const bax = new Axes(boxBody, x0, x1, 0, 1, {}, k);
    chartTitle(p, top, 'Diagramme en boîte', pal, k, [{ color: pal.danger, label: 'moyenne' }], `x̄ ≈ ${fmt(s.mean, 4)} · Me = ${fmt(s.median, 4)}`);
    const base = bax.plot.y + bax.plot.h;
    line(p, bax.plot.x, base, bax.plot.x + bax.plot.w, base, { color: pal.axis, width: 1.2 * k });
    const ticksAx = new Axes(boxBody, x0, x1, 0, 1, {}, k);
    // Graduations seules (sans quadrillage horizontal)
    drawXTicks(p, ticksAx, pal, k);
    boxPlot(p, bax, bax.plot.y + bax.plot.h * 0.55, Math.min(44 * k, bax.plot.h * 0.5), s, pal.accent, pal, k);
    hits.push({ rect: bax.plot, html: `min = ${fmt(s.min, 6)} · <i>Q</i><sub>1</sub> = ${fmt(s.q1, 6)}<br>Me = ${fmt(s.median, 6)} · <i>Q</i><sub>3</sub> = ${fmt(s.q3, 6)}<br>max = ${fmt(s.max, 6)} · <i>x̄</i> = ${fmt(s.mean, 6)}` });

    const body: Rect = { x: bottom.x, y: bottom.y + 30 * k, w: bottom.w, h: bottom.h - 30 * k };
    const { values, counts } = this.series;
    if (this.s.chart === 'bars') {
      const ymax = Math.max(...counts) * 1.15;
      const ax = new Axes(body, x0, x1, 0, ymax, { integerX: values.every(Number.isInteger), integerY: true }, k);
      chartTitle(p, bottom, 'Diagramme en bâtons (effectifs)', pal, k);
      ax.draw(p, pal);
      const minGap = values.slice(1).reduce((m, v, i) => Math.min(m, v - values[i]), Infinity);
      const w = Math.min(Number.isFinite(minGap) ? minGap * 0.28 : span * 0.03, span * 0.03) || 0.3;
      values.forEach((v, i) => {
        bar(p, ax, v, w, counts[i], pal.accent, 0.85);
        const px = ax.x(v - Math.max(w, (x1 - x0) / 200) / 2);
        hits.push({ rect: { x: px, y: ax.plot.y, w: Math.max(6, ax.x(v + w / 2) - px), h: ax.plot.h }, html: `<b>${fmt(v, 6)}</b><br>Effectif : ${counts[i]}<br>Fréquence : ${fmt(counts[i] / s.n, 4)}` });
      });
    } else if (this.s.chart === 'hist') {
      const hgm = histogram(this.series, this.s.classes || undefined);
      const w = hgm.edges[1] - hgm.edges[0];
      // Classes de même amplitude : hauteur = effectif.
      const ymax = Math.max(...hgm.counts) * 1.15;
      const ax = new Axes(body, hgm.edges[0] - w * 0.2, hgm.edges[hgm.edges.length - 1] + w * 0.2, 0, ymax, {
        integerY: true,
        xTicks: hgm.edges.map((e) => ({ value: e, label: fmt(e, 6) })),
      }, k);
      chartTitle(p, bottom, `Histogramme (${hgm.counts.length} classes d'amplitude ${fmt(w, 4)})`, pal, k);
      ax.draw(p, pal);
      hgm.counts.forEach((c, i) => {
        const mid = (hgm.edges[i] + hgm.edges[i + 1]) / 2;
        bar(p, ax, mid, w, c, pal.accent, 0.7);
        const x = ax.x(hgm.edges[i]);
        const xr = ax.x(hgm.edges[i + 1]);
        p.beginPath();
        p.rect(x, ax.y(c), xr - x, ax.y(0) - ax.y(c));
        p.stroke({ color: pal.bg, width: 1.5 * k });
        hits.push({ rect: { x, y: ax.plot.y, w: xr - x, h: ax.plot.h }, html: `<b>[${fmt(hgm.edges[i], 6)} ; ${fmt(hgm.edges[i + 1], 6)}[</b><br>Effectif : ${c}<br>Fréquence : ${fmt(c / s.n, 4)}` });
      });
    } else {
      const ax = new Axes(body, x0, x1, 0, s.n * 1.08, { integerY: true }, k);
      chartTitle(p, bottom, 'Polygone des effectifs cumulés croissants', pal, k, [], `N = ${fmt(s.n, 9)}`);
      ax.draw(p, pal);
      const pts: [number, number][] = [[values[0], 0]];
      let acc = 0;
      values.forEach((v, i) => {
        acc += counts[i];
        pts.push([v, acc]);
      });
      polyline(p, ax, pts, pal.accent, 2.2 * k);
      pts.slice(1).forEach(([v, c]) => disc(p, ax.x(v), ax.y(c), 3.2 * k, pal.accent, { color: pal.bg, width: 1.2 * k }));
      // Lecture de la médiane et des quartiles
      for (const [frac, name, v] of [[0.25, 'Q₁', s.q1], [0.5, 'Me', s.median], [0.75, 'Q₃', s.q3]] as const) {
        const y = frac * s.n;
        const dash = { color: pal.muted, width: 1.1 * k, dash: [4 * k, 4 * k] };
        line(p, ax.plot.x, ax.y(y), ax.x(v), ax.y(y), dash);
        line(p, ax.x(v), ax.y(y), ax.x(v), ax.y(0), dash);
        p.text(name, ax.x(v) + 4 * k, ax.y(0) - 6 * k, { color: pal.text, size: 12 * k, baseline: 'bottom', halo: pal.bg });
      }
      let cum = 0;
      values.forEach((v, i) => {
        cum += counts[i];
        hits.push({ rect: { x: ax.x(v) - 8, y: ax.plot.y, w: 16, h: ax.plot.h }, html: `Valeurs ≤ ${fmt(v, 6)} : <b>${cum}</b> (${fmt((cum / s.n) * 100, 4)} %)` });
      });
    }
  }

  private drawScatter(p: Painter, rect: Rect, pal: ChartPalette, k: number, hits: Hit[]): void {
    const { xs, ys, reg } = this;
    if (!xs.length) {
      p.text('Aucune donnée', rect.x + rect.w / 2, rect.y + rect.h / 2, { color: pal.muted, size: 15 * k, align: 'center', baseline: 'middle' });
      return;
    }
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const sx = maxX - minX || 1;
    const sy = maxY - minY || 1;
    const predict = parseNum(this.s.predict);
    const px = reg && Number.isFinite(predict) ? predict : null;
    const lox = Math.min(minX, px ?? minX);
    const hix = Math.max(maxX, px ?? maxX);
    const py = px !== null && reg ? reg.a * px + reg.b : null;
    const loy = Math.min(minY, py ?? minY);
    const hiy = Math.max(maxY, py ?? maxY);
    const body: Rect = { x: rect.x, y: rect.y + 30 * k, w: rect.w, h: rect.h - 30 * k };
    const ax = new Axes(body, lox - sx * 0.08, hix + sx * 0.08, Math.min(0, loy - sy * 0.1), hiy + sy * 0.12, { xLabel: this.s.xName, yLabel: this.s.yName }, k);
    chartTitle(p, rect, 'Nuage de points', pal, k, reg ? [{ color: pal.danger, label: 'droite des moindres carrés' }] : [], reg ? `r ≈ ${fmt(reg.r, 4)}` : undefined);
    ax.draw(p, pal);
    if (reg) {
      polyline(p, ax, [[ax.x0, reg.a * ax.x0 + reg.b], [ax.x1, reg.a * ax.x1 + reg.b]], pal.danger, 2 * k);
      // Point moyen G
      const gx = ax.x(reg.meanX);
      const gy = ax.y(reg.meanY);
      disc(p, gx, gy, 5 * k, pal.bg, { color: pal.danger, width: 2 * k });
      p.text('G', gx + 8 * k, gy + 4 * k, { color: pal.danger, size: 14 * k, italic: true, family: MATH_FONT, baseline: 'top', halo: pal.bg });
      const eq = `y = ${fmt(reg.a, 4)}x ${reg.b < 0 ? '−' : '+'} ${fmt(Math.abs(reg.b), 4)}`;
      p.text(eq, ax.plot.x + 12 * k, ax.plot.y + 8 * k, { color: pal.danger, size: 14 * k, weight: 600, baseline: 'top', halo: pal.bg });
    }
    points(p, ax, xs, ys, pal.accent, 4.2 * k, pal);
    xs.forEach((x, i) => hits.push({ rect: { x: ax.x(x) - 8, y: ax.y(ys[i]) - 8, w: 16, h: 16 }, html: `(${fmt(x, 6)} ; ${fmt(ys[i], 6)})` }));
    if (px !== null && py !== null) {
      const dash = { color: pal.text, width: 1.2 * k, dash: [4 * k, 4 * k] };
      line(p, ax.x(px), ax.y(Math.max(ax.y0, 0)), ax.x(px), ax.y(py), dash);
      line(p, ax.plot.x, ax.y(py), ax.x(px), ax.y(py), dash);
      disc(p, ax.x(px), ax.y(py), 5 * k, pal.text, { color: pal.bg, width: 1.5 * k });
      const right = ax.x(px) > ax.plot.x + ax.plot.w - 140 * k;
      p.text(`(${fmt(px, 5)} ; ${fmt(py, 5)})`, ax.x(px) + (right ? -9 : 9) * k, ax.y(py) - 6 * k, { color: pal.text, size: 12.5 * k, weight: 600, align: right ? 'right' : 'left', baseline: 'bottom', halo: pal.bg });
    }
  }
}

/** Graduations de l'axe des abscisses seules (boîte à moustaches). */
function drawXTicks(p: Painter, ax: Axes, pal: ChartPalette, k: number): void {
  const plot = ax.plot;
  const base = plot.y + plot.h;
  const raw = (ax.x1 - ax.x0) / Math.max(1, plot.w / 70 / k);
  const pw = 10 ** Math.floor(Math.log10(raw));
  const m = raw / pw;
  const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * pw;
  p.beginPath();
  const labels: [number, string][] = [];
  for (let v = Math.ceil(ax.x0 / step) * step; v <= ax.x1; v += step) {
    const x = ax.x(v);
    p.moveTo(x, base);
    p.lineTo(x, base + 4 * k);
    labels.push([x, fmt(Number(v.toPrecision(10)), 6)]);
  }
  p.stroke({ color: pal.axis, width: 1, cap: 'butt' });
  for (const [x, l] of labels) p.text(l, x, base + 8 * k, { color: pal.muted, size: 11.5 * k, align: 'center', baseline: 'top' });
}
