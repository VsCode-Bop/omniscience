/**
 * Réfraction : dioptre plan (loi de Snell-Descartes, réflexion totale, relevé de
 * mesures et droite sin i₂ = f(sin i₁)) et prisme (dispersion de la lumière blanche).
 */
import { h, svgIcon } from '../../core/dom';
import { disc, line, MATH_FONT, MONO_FONT, type Painter } from '../../core/graphics/painter';
import { icon } from '../../core/icons';
import { fmt } from '../../core/math/format';
import { html, numberField, section, segmented, statGrid } from '../../core/widgets';
import { Axes, chartTitle, points, polyline, type ChartPalette, type Rect } from '../probability/charts';
import type { OpticsPalette } from './lens-view';
import { cauchy, criticalAngle, fresnel, GLASSES, snell, tracePrism, wavelengthColor, type Vec } from './optics';

export interface RefrState {
  mode: 'dioptre' | 'prism';
  n1: number;
  n2: number;
  i1: number;
  measures: [number, number][];
  A: number;
  glass: keyof typeof GLASSES;
  i: number;
  light: 'white' | 'mono';
  lambda: number;
}

export function defaultRefr(): RefrState {
  return { mode: 'dioptre', n1: 1, n2: 1.33, i1: 40, measures: [], A: 60, glass: 'crown', i: 50, light: 'white', lambda: 589 };
}

export function sanitizeRefr(raw: unknown): RefrState {
  const d = defaultRefr();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<RefrState>;
  const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
  return {
    mode: r.mode === 'prism' ? 'prism' : 'dioptre',
    n1: num(r.n1, 1, 3, d.n1),
    n2: num(r.n2, 1, 3, d.n2),
    i1: num(r.i1, 0, 89.9, d.i1),
    measures: Array.isArray(r.measures) ? r.measures.filter((m) => Array.isArray(m) && m.length === 2 && m.every((v) => typeof v === 'number' && Number.isFinite(v))).slice(0, 30) as [number, number][] : [],
    A: num(r.A, 20, 80, d.A),
    glass: r.glass && r.glass in GLASSES ? r.glass : 'crown',
    i: num(r.i, 0, 89.9, d.i),
    light: r.light === 'mono' ? 'mono' : 'white',
    lambda: num(r.lambda, 380, 780, d.lambda),
  };
}

const MEDIA: [string, number][] = [['Air', 1], ['Eau', 1.33], ['Huile', 1.47], ['Plexiglas', 1.49], ['Verre', 1.5], ['Verre flint', 1.62], ['Diamant', 2.42]];
const LAMBDAS = [400, 430, 460, 490, 520, 550, 580, 610, 640, 670, 700];

export interface RefrHost {
  changed(recompute?: boolean): void;
  toast(message: string, kind?: 'info' | 'success' | 'error'): void;
}

export class RefractionView {
  readonly panel: HTMLElement;
  private readonly body: HTMLElement;
  private readonly results: HTMLElement;
  private readonly fields = new Map<string, { set: (v: number) => void }>();
  dragging = false;

  constructor(public s: RefrState, private readonly host: RefrHost) {
    this.body = h('div');
    this.results = h('div');
    this.panel = h('div', { class: 'tab-panel' }, this.body, this.results);
    this.build();
  }

  build(): void {
    const s = this.s;
    this.fields.clear();
    const mode = segmented([['dioptre', 'Dioptre plan'], ['prism', 'Prisme']], s.mode, (v) => {
      s.mode = v as RefrState['mode'];
      this.build();
      this.host.changed();
    });
    const medium = (key: 'n1' | 'n2', label: string) => {
      const sel = h('select', { class: 'select', 'aria-label': label },
        ...MEDIA.map(([name, n]) => h('option', { value: String(n) }, `${name} (n = ${fmt(n, 3)})`)),
        h('option', { value: 'custom' }, 'Autre…'),
      );
      const known = MEDIA.some(([, n]) => n === s[key]);
      sel.value = known ? String(s[key]) : 'custom';
      const field = numberField('Indice de réfraction', `<i>n</i><sub>${key === 'n1' ? 1 : 2}</sub>`, { min: 1, max: 2.6, step: 0.01 }, s[key], (v) => {
        s[key] = v;
        sel.value = MEDIA.some(([, n]) => n === v) ? String(v) : 'custom';
        this.host.changed();
      });
      sel.addEventListener('change', () => {
        if (sel.value === 'custom') return;
        s[key] = Number(sel.value);
        field.set(s[key]);
        this.host.changed();
      });
      return h('div', { class: 'medium' }, h('span', { class: 'field-label' }, label), sel, field.el);
    };
    if (s.mode === 'dioptre') {
      const i1 = numberField('Angle d\'incidence (°)', '<i>i</i><sub>1</sub>', { min: 0, max: 89.9, step: 0.5 }, s.i1, (v) => {
        s.i1 = v;
        this.host.changed();
      });
      this.fields.set('i1', i1);
      this.body.replaceChildren(
        section('Situation', mode.el),
        section('Milieux', medium('n1', 'Milieu d\'incidence (en haut)'), medium('n2', 'Second milieu (en bas)'),
          h('button', { class: 'btn btn-sm swap-btn', onclick: () => { [s.n1, s.n2] = [s.n2, s.n1]; this.build(); this.host.changed(); } }, svgIcon(icon('rotate'), 'icon icon-sm'), 'Échanger les milieux')),
        section('Rayon incident', i1.el, html('p', 'hint', 'Faites aussi glisser la source lumineuse sur le rapporteur.')),
        section('Relevé de mesures',
          h('div', { class: 'measure-actions' },
            h('button', { class: 'btn btn-primary btn-sm', onclick: () => this.record() }, svgIcon(icon('plus'), 'icon icon-sm'), 'Relever (i₁ ; i₂)'),
            h('button', { class: 'btn btn-sm', onclick: () => { s.measures = []; this.host.changed(false); } }, 'Effacer'),
          ),
          this.measureTable(),
        ),
      );
    } else {
      const glass = segmented(Object.entries(GLASSES).map(([k, g]) => [k, g.name] as [string, string]), s.glass, (v) => {
        s.glass = v as RefrState['glass'];
        this.build();
        this.host.changed();
      });
      const light = segmented([['white', 'Lumière blanche'], ['mono', 'Monochromatique']], s.light, (v) => {
        s.light = v as RefrState['light'];
        this.build();
        this.host.changed();
      });
      const iField = numberField('Angle d\'incidence (°)', '<i>i</i>', { min: 0, max: 89.9, step: 0.5 }, s.i, (v) => {
        s.i = v;
        this.host.changed();
      });
      this.fields.set('i', iField);
      this.body.replaceChildren(
        section('Situation', mode.el),
        section('Prisme',
          numberField('Angle au sommet (°)', '<i>A</i>', { min: 20, max: 80, step: 1 }, s.A, (v) => { s.A = v; this.host.changed(); }).el,
          h('div', { class: 'field glass-field' }, h('span', { class: 'field-label' }, 'Matériau (loi de Cauchy)'), glass.el),
        ),
        section('Lumière', light.el,
          s.light === 'mono' ? numberField('Longueur d\'onde (nm)', '<i>λ</i>', { min: 380, max: 780, step: 1 }, s.lambda, (v) => { s.lambda = v; this.host.changed(); }).el : null,
          iField.el,
          h('button', { class: 'btn btn-sm', onclick: () => this.minDeviation() }, 'Placer au minimum de déviation'),
        ),
      );
    }
    this.renderResults();
  }

  private measureTable(): HTMLElement {
    const m = this.s.measures;
    if (!m.length) return html('p', 'hint', 'Relevez plusieurs couples (i₁ ; i₂) : le graphique sin i₂ = f(sin i₁) permet de retrouver n₁/n₂.');
    return h('table', { class: 'measure-table' },
      h('thead', null, h('tr', null, ...['i₁ (°)', 'i₂ (°)', 'sin i₁', 'sin i₂'].map((t) => h('th', null, t)))),
      h('tbody', null, ...m.map(([a, b]) => h('tr', null, ...[fmt(a, 4), fmt(b, 4), fmt(Math.sin((a * Math.PI) / 180), 3), fmt(Math.sin((b * Math.PI) / 180), 3)].map((t) => h('td', null, t))))),
    );
  }

  private record(): void {
    const s = this.s;
    const i2 = snell(s.i1, s.n1, s.n2);
    if (i2 === null) {
      this.host.toast('Réflexion totale : pas de rayon réfracté à mesurer.', 'error');
      return;
    }
    // Mesure « au rapporteur » : arrondie au demi-degré.
    const round = (v: number) => Math.round(v * 2) / 2;
    s.measures.push([round(s.i1), round(i2)]);
    s.measures.sort((a, b) => a[0] - b[0]);
    this.build();
    this.host.changed(false);
  }

  private minDeviation(): void {
    const s = this.s;
    const n = cauchy(GLASSES[s.glass], s.light === 'mono' ? s.lambda : 589);
    const x = n * Math.sin(((s.A / 2) * Math.PI) / 180);
    if (x >= 1) {
      this.host.toast('Pas de minimum de déviation accessible pour ce prisme.', 'error');
      return;
    }
    s.i = Math.round(((Math.asin(x) * 180) / Math.PI) * 10) / 10;
    this.fields.get('i')?.set(s.i);
    this.host.changed();
  }

  renderResults(): void {
    const s = this.s;
    if (s.mode === 'dioptre') {
      const i2 = snell(s.i1, s.n1, s.n2);
      const lim = criticalAngle(s.n1, s.n2);
      const R = fresnel(s.i1, s.n1, s.n2);
      const sin = (d: number) => Math.sin((d * Math.PI) / 180);
      this.results.replaceChildren(section('Résultats',
        i2 === null
          ? html('p', 'refr-total', `Réflexion totale : <i>i</i><sub>1</sub> = ${fmt(s.i1, 4)}° dépasse l'angle limite ${fmt(lim!, 4)}°.`)
          : h('div', { class: 'result-card' },
            html('div', 'result-law', 'Loi de Snell-Descartes : <i>n</i><sub>1</sub> sin <i>i</i><sub>1</sub> = <i>n</i><sub>2</sub> sin <i>i</i><sub>2</sub>'),
            html('div', 'result-main', `<i>i</i><sub>2</sub> = <b>${fmt(i2, 4)}°</b>`),
            html('div', 'result-pct', `${fmt(s.n1, 3)} × ${fmt(sin(s.i1), 4)} = ${fmt(s.n2, 3)} × ${fmt(sin(i2), 4)} = ${fmt(s.n1 * sin(s.i1), 4)}`),
          ),
        statGrid([
          ['Angle de réflexion', `${fmt(s.i1, 4)}°`],
          ['Angle limite', lim === null ? `— (n₁ < n₂)` : `${fmt(lim, 4)}°`],
          ['Énergie réfléchie', `${fmt(R * 100, 3)} %`],
          ['Rayon réfracté', i2 === null ? 'aucun' : i2 < s.i1 ? 'se rapproche de la normale' : i2 > s.i1 ? 's\'écarte de la normale' : 'non dévié'],
        ]),
      ));
      return;
    }
    const g = GLASSES[s.glass];
    const lam = s.light === 'mono' ? s.lambda : 589;
    const n = cauchy(g, lam);
    const path = tracePrism(s.A, 100, 45, s.i, n, lam, 100);
    const devs = s.light === 'white' ? [400, 700].map((l) => tracePrism(s.A, 100, 45, s.i, cauchy(g, l), l, 100).deviation) : [];
    this.results.replaceChildren(section('Résultats',
      statGrid([
        [`Indice n (λ = ${lam} nm)`, fmt(n, 5)],
        ['Déviation D', path.deviation === null ? 'réflexion totale' : `${fmt(path.deviation, 4)}°`],
        ['Angle de réfraction r', `${fmt(path.r, 4)}°`],
        ['Angle d\'émergence i′', path.i2 === null ? '—' : `${fmt(path.i2, 4)}°`],
        ...(devs.length && devs.every((d) => d !== null) ? [['Étalement du spectre', `${fmt(devs[0]! - devs[1]!, 3)}° (violet − rouge)`] as [string, string]] : []),
      ]),
      html('p', 'hint', 'Relations du prisme : <i>A</i> = <i>r</i> + <i>r′</i> et <i>D</i> = <i>i</i> + <i>i′</i> − <i>A</i>. L\'indice dépend de la longueur d\'onde : le violet est plus dévié que le rouge.'),
    ));
  }

  // ─── Dessin : dioptre ─────────────────────────────────────────────────────

  /** Centre et rayon du rapporteur (pixels) pour une scène de taille w × h. */
  private geometry(w: number, hgt: number, k: number): { cx: number; cy: number; R: number } {
    const chartW = this.s.measures.length >= 2 ? Math.min(420 * k, w * 0.38) : 0;
    const cx = (w - chartW) / 2;
    const cy = hgt / 2 + 10 * k;
    const R = Math.min((w - chartW) * 0.4, hgt * 0.38);
    return { cx, cy, R };
  }

  drawDioptre(p: Painter, w: number, hgt: number, pal: OpticsPalette & ChartPalette, k: number): void {
    const s = this.s;
    const { cx, cy, R } = this.geometry(w, hgt, k);
    const tint = (n: number) => Math.min(0.45, (n - 1) * 0.55);
    // Milieux
    p.beginPath();
    p.rect(0, 0, w, cy);
    p.fill(pal.glass, tint(s.n1));
    p.beginPath();
    p.rect(0, cy, w, hgt - cy);
    p.fill(pal.glass, tint(s.n2));
    const name = (n: number) => MEDIA.find(([, v]) => v === n)?.[0] ?? 'Milieu';
    p.text(`${name(s.n1)} · n₁ = ${fmt(s.n1, 3)}`, 24 * k, 80 * k, { color: pal.text, size: 15 * k, weight: 600, baseline: 'top' });
    p.text(`${name(s.n2)} · n₂ = ${fmt(s.n2, 3)}`, 24 * k, hgt - 24 * k, { color: pal.text, size: 15 * k, weight: 600, baseline: 'bottom' });
    line(p, 0, cy, w, cy, { color: pal.text, width: 1.6 * k, cap: 'butt' });

    // Rapporteur gradué
    p.beginPath();
    p.arc(cx, cy, R, 0, Math.PI * 2);
    p.stroke({ color: pal.muted, width: 1.2 * k, alpha: 0.6 });
    for (let d = 0; d < 360; d += 5) {
      const a = (d * Math.PI) / 180;
      const len = d % 30 === 0 ? 14 : d % 10 === 0 ? 9 : 5;
      line(p, cx + Math.sin(a) * R, cy - Math.cos(a) * R, cx + Math.sin(a) * (R - len * k), cy - Math.cos(a) * (R - len * k), { color: pal.muted, width: 1, alpha: 0.7 });
      if (d % 30 === 0) {
        const lab = d <= 90 ? d : d <= 180 ? 180 - d : d <= 270 ? d - 180 : 360 - d;
        p.text(`${lab}°`, cx + Math.sin(a) * (R + 14 * k), cy - Math.cos(a) * (R + 14 * k), { color: pal.muted, size: 11 * k, align: 'center', baseline: 'middle' });
      }
    }
    // Normale
    line(p, cx, cy - R * 1.08, cx, cy + R * 1.08, { color: pal.muted, width: 1.3 * k, dash: [7 * k, 5 * k] });
    p.text('normale', cx + 6 * k, cy - R * 1.08, { color: pal.muted, size: 11.5 * k, baseline: 'top' });

    const rad = (d: number) => (d * Math.PI) / 180;
    const i1 = rad(s.i1);
    const src: Vec = [cx - Math.sin(i1) * R, cy - Math.cos(i1) * R];
    const i2d = snell(s.i1, s.n1, s.n2);
    const Rf = fresnel(s.i1, s.n1, s.n2);
    const ray = pal.rays[0];
    // Rayon incident
    line(p, src[0], src[1], cx, cy, { color: ray, width: 3 * k });
    this.midArrow(p, src[0], src[1], cx, cy, ray, k);
    // Réfléchi (intensité selon Fresnel)
    const refl: Vec = [cx + Math.sin(i1) * R, cy - Math.cos(i1) * R];
    line(p, cx, cy, refl[0], refl[1], { color: ray, width: (1 + 2 * Math.sqrt(Rf)) * k, alpha: Math.max(0.18, Math.min(1, Rf * 3)) });
    this.midArrow(p, cx, cy, refl[0], refl[1], ray, k, Math.max(0.18, Math.min(1, Rf * 3)));
    // Réfracté
    if (i2d !== null) {
      const i2 = rad(i2d);
      const out: Vec = [cx + Math.sin(i2) * R, cy + Math.cos(i2) * R];
      line(p, cx, cy, out[0], out[1], { color: ray, width: 3 * k, alpha: Math.max(0.35, 1 - Rf) });
      this.midArrow(p, cx, cy, out[0], out[1], ray, k);
      this.angleArc(p, cx, cy, Math.PI / 2, Math.PI / 2 - i2, R * 0.28, pal.accent, `i₂ = ${fmt(i2d, 3)}°`, k, pal, 1);
    } else {
      p.text('Réflexion totale', cx, cy + R * 0.5, { color: pal.danger, size: 18 * k, weight: 700, align: 'center', baseline: 'middle', halo: pal.bg });
    }
    this.angleArc(p, cx, cy, -Math.PI / 2, -Math.PI / 2 - i1, R * 0.34, pal.text, `i₁ = ${fmt(s.i1, 3)}°`, k, pal, -1);
    // Source (poignée)
    disc(p, src[0], src[1], 9 * k, ray, { color: pal.bg, width: 2 * k });
    disc(p, cx, cy, 3.5 * k, pal.text);
    p.text('I', cx + 8 * k, cy + 6 * k, { color: pal.text, size: 14 * k, italic: true, family: MATH_FONT, baseline: 'top', halo: pal.bg });

    // Graphique des mesures
    if (s.measures.length >= 2) this.drawMeasures(p, { x: w - Math.min(420 * k, w * 0.38) - 10 * k, y: 70 * k, w: Math.min(420 * k, w * 0.38), h: Math.min(360 * k, hgt - 140 * k) }, pal, k);
  }

  private drawMeasures(p: Painter, r: Rect, pal: OpticsPalette & ChartPalette, k: number): void {
    const m = this.s.measures;
    const xs = m.map(([a]) => Math.sin((a * Math.PI) / 180));
    const ys = m.map(([, b]) => Math.sin((b * Math.PI) / 180));
    // Droite passant par l'origine (moindres carrés) : sin i₂ = a·sin i₁ avec a = n₁/n₂.
    const a = xs.reduce((s, x, i) => s + x * ys[i], 0) / xs.reduce((s, x) => s + x * x, 0);
    p.beginPath();
    p.rect(r.x, r.y, r.w, r.h + 40 * k);
    p.fill(pal.bg, 0.92);
    const body: Rect = { x: r.x, y: r.y + 30 * k, w: r.w, h: r.h - 30 * k };
    const ax = new Axes(body, 0, 1, 0, 1, { xLabel: 'sin i₁' }, k);
    chartTitle(p, r, 'sin i₂ = f(sin i₁)', pal, k, [], `pente ≈ ${fmt(a, 3)}`);
    ax.draw(p, pal);
    polyline(p, ax, [[0, 0], [1, a]], pal.danger, 1.6 * k);
    points(p, ax, xs, ys, pal.accent, 4.5 * k, pal);
    p.text(`n₁/n₂ ≈ ${fmt(a, 3)} donc n₂ ≈ ${fmt(this.s.n1 / a, 3)}`, r.x + r.w / 2, r.y + r.h + 18 * k, { color: pal.text, size: 13 * k, weight: 600, align: 'center', baseline: 'middle' });
  }

  private midArrow(p: Painter, x1: number, y1: number, x2: number, y2: number, color: string, k: number, alpha = 1): void {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const a = 8 * k;
    p.beginPath();
    p.moveTo(mx + Math.cos(ang) * a, my + Math.sin(ang) * a);
    p.lineTo(mx + Math.cos(ang + 2.5) * a, my + Math.sin(ang + 2.5) * a);
    p.lineTo(mx + Math.cos(ang - 2.5) * a, my + Math.sin(ang - 2.5) * a);
    p.closePath();
    p.fill(color, alpha);
  }

  /** Arc d'angle entre deux directions (angles écran, y vers le bas). */
  private angleArc(p: Painter, cx: number, cy: number, a0: number, a1: number, r: number, color: string, label: string, k: number, pal: OpticsPalette, side: 1 | -1): void {
    const start = Math.min(a0, a1);
    const end = Math.max(a0, a1);
    if (end - start < 1e-3) return;
    p.beginPath();
    p.arc(cx, cy, r, start, end);
    p.stroke({ color, width: 1.8 * k });
    const mid = (start + end) / 2;
    const lx = cx + Math.cos(mid) * (r + 14 * k);
    const ly = cy + Math.sin(mid) * (r + 14 * k);
    p.text(label, lx, ly, { color, size: 14 * k, weight: 600, align: Math.cos(mid) < -0.2 ? 'right' : Math.cos(mid) > 0.2 ? 'left' : 'center', baseline: side < 0 ? 'bottom' : 'top', halo: pal.bg, family: MONO_FONT });
  }

  /** Glisser la source sur le rapporteur. */
  hitSource(w: number, hgt: number, k: number, px: number, py: number): boolean {
    if (this.s.mode !== 'dioptre') return false;
    const { cx, cy, R } = this.geometry(w, hgt, k);
    const i1 = (this.s.i1 * Math.PI) / 180;
    return Math.hypot(cx - Math.sin(i1) * R - px, cy - Math.cos(i1) * R - py) < 16;
  }

  dragSource(w: number, hgt: number, k: number, px: number, py: number): void {
    const { cx, cy } = this.geometry(w, hgt, k);
    const a = Math.atan2(Math.abs(cx - px), Math.max(0.001, cy - py));
    this.s.i1 = Math.round(Math.min(89.5, Math.max(0, (a * 180) / Math.PI)) * 2) / 2;
    this.fields.get('i1')?.set(this.s.i1);
  }

  // ─── Dessin : prisme ──────────────────────────────────────────────────────

  drawPrism(p: Painter, w: number, hgt: number, pal: OpticsPalette & ChartPalette, k: number): void {
    const s = this.s;
    const g = GLASSES[s.glass];
    const A = (s.A * Math.PI) / 180;
    const side = 100;
    const half = A / 2;
    const height = Math.cos(half) * side;
    const scale = Math.min((hgt - 180 * k) / height, (w * 0.34) / (Math.sin(half) * side * 2 + 1));
    const ox = w * 0.4;
    const oy = (hgt - height * scale) / 2 + 20 * k;
    const P = ([x, y]: Vec): Vec => [ox + x * scale, oy - y * scale];
    const apex = P([0, 0]);
    const bl = P([-Math.sin(half) * side, -height]);
    const br = P([Math.sin(half) * side, -height]);
    p.beginPath();
    p.moveTo(apex[0], apex[1]);
    p.lineTo(br[0], br[1]);
    p.lineTo(bl[0], bl[1]);
    p.closePath();
    p.fill(pal.glass, 0.45);
    p.beginPath();
    p.moveTo(apex[0], apex[1]);
    p.lineTo(br[0], br[1]);
    p.lineTo(bl[0], bl[1]);
    p.closePath();
    p.stroke({ color: pal.text, width: 1.8 * k, join: 'round' });
    p.text(`A = ${fmt(s.A, 3)}°`, apex[0], apex[1] - 10 * k, { color: pal.text, size: 13 * k, weight: 600, align: 'center', baseline: 'bottom' });

    const length = (w / scale) * 1.2;
    const lambdas = s.light === 'white' ? LAMBDAS : [s.lambda];
    const paths = lambdas.map((l) => tracePrism(s.A, side, side * 0.45, s.i, cauchy(g, l), l, length));
    // Rayon incident (lumière blanche : trait neutre)
    const first = paths[0];
    const inc0 = P(first.points[0]);
    const inc1 = P(first.points[1]);
    const incColor = s.light === 'white' ? pal.text : wavelengthColor(s.lambda);
    line(p, inc0[0], inc0[1], inc1[0], inc1[1], { color: incColor, width: 3 * k });
    p.text(s.light === 'white' ? 'lumière blanche' : `λ = ${fmt(s.lambda, 3)} nm`, (inc0[0] + inc1[0]) / 2, (inc0[1] + inc1[1]) / 2 - 10 * k, { color: pal.text, size: 12.5 * k, align: 'center', baseline: 'bottom', halo: pal.bg });
    // Rayons dans et hors du prisme
    for (const path of paths) {
      const color = wavelengthColor(path.lambda);
      const pts = path.points.slice(1).map(P);
      p.beginPath();
      pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
      p.stroke({ color, width: (s.light === 'white' ? 2 : 3) * k, alpha: 0.95, join: 'round' });
    }
    // Écran : spectre projeté
    const screenX = w - 70 * k;
    line(p, screenX, 60 * k, screenX, hgt - 60 * k, { color: pal.muted, width: 4 * k, cap: 'butt' });
    p.text('écran', screenX, hgt - 50 * k, { color: pal.muted, size: 12 * k, align: 'center', baseline: 'top' });
    for (const path of paths) {
      if (path.deviation === null) continue;
      const [q, e] = path.points.slice(2, 4).map(P);
      if (e[0] <= q[0]) continue;
      const t = (screenX - q[0]) / (e[0] - q[0]);
      const y = q[1] + (e[1] - q[1]) * t;
      if (y < 0 || y > hgt) continue;
      disc(p, screenX, y, (s.light === 'white' ? 5 : 7) * k, wavelengthColor(path.lambda));
    }
    // Déviation (rayon de référence)
    const ref = paths[Math.floor(paths.length / 2)];
    if (ref.deviation !== null) p.text(`D = ${fmt(ref.deviation, 4)}°${s.light === 'white' ? ` (λ = ${ref.lambda} nm)` : ''}`, 24 * k, hgt - 40 * k, { color: pal.text, size: 15 * k, weight: 600, family: MONO_FONT, baseline: 'middle' });
    else p.text('Réflexion totale sur la seconde face', 24 * k, hgt - 40 * k, { color: pal.danger, size: 15 * k, weight: 600, baseline: 'middle' });
  }
}
