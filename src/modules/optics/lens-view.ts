/**
 * Banc d'optique : une ou deux lentilles minces, objet à distance finie ou à
 * l'infini, rayons particuliers, faisceau, constructions (prolongements virtuels).
 */
import { h } from '../../core/dom';
import { disc, line, MATH_FONT, MONO_FONT, type Painter, type StrokeStyle } from '../../core/graphics/painter';
import { fmt } from '../../core/math/format';
import { niceStep } from '../../core/math/numeric';
import { html, numberField, section, segmented, statGrid } from '../../core/widgets';
import type { Viewport } from '../grapher/viewport';
import { conjugate, imageOfInfinity, traceRay, vergence, type Lens, type Ray } from './optics';

export interface LensState {
  lenses: Lens[];
  object: { kind: 'finite' | 'infinity'; x: number; h: number; theta: number };
  rays: { particular: boolean; bundle: boolean; construct: boolean; foci: boolean };
}

export function defaultLens(): LensState {
  return {
    lenses: [{ x: 0, f: 10 }],
    object: { kind: 'finite', x: -30, h: 3, theta: 3 },
    rays: { particular: true, bundle: false, construct: true, foci: true },
  };
}

export function sanitizeLens(raw: unknown): LensState {
  const d = defaultLens();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<LensState>;
  const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
  const lenses = Array.isArray(r.lenses) && r.lenses.length
    ? r.lenses.slice(0, 2).map((l) => ({ x: num(l?.x, -500, 500, 0), f: num(l?.f, -500, 500, 10) || 10 }))
    : d.lenses;
  const o = (r.object ?? {}) as Partial<LensState['object']>;
  const ry = (r.rays ?? {}) as Partial<LensState['rays']>;
  return {
    lenses,
    object: { kind: o.kind === 'infinity' ? 'infinity' : 'finite', x: num(o.x, -1000, 1000, d.object.x), h: num(o.h, -100, 100, d.object.h), theta: num(o.theta, -30, 30, d.object.theta) },
    rays: { particular: ry.particular !== false, bundle: ry.bundle === true, construct: ry.construct !== false, foci: ry.foci !== false },
  };
}

export interface OpticsPalette {
  bg: string;
  text: string;
  muted: string;
  gridMinor: string;
  gridMajor: string;
  axis: string;
  accent: string;
  rays: [string, string, string];
  bundle: string;
  glass: string;
}

export interface LensHost {
  changed(recompute?: boolean): void;
}

type Drag = { kind: 'object' } | { kind: 'lens'; i: number } | { kind: 'focus'; i: number };

const SUB = '₀₁₂₃₄₅₆₇₈₉';
const sub = (i: number) => String(i + 1).replace(/\d/g, (d) => SUB[Number(d)]);

export class LensView {
  readonly panel: HTMLElement;
  private readonly body: HTMLElement;
  private readonly results: HTMLElement;
  drag: Drag | null = null;

  constructor(public s: LensState, private readonly host: LensHost) {
    this.body = h('div');
    this.results = h('div');
    this.panel = h('div', { class: 'tab-panel' }, this.body, this.results);
    this.build();
  }

  build(): void {
    const s = this.s;
    const count = segmented([['1', 'Une lentille'], ['2', 'Deux lentilles']], String(s.lenses.length), (v) => {
      if (v === '2' && s.lenses.length === 1) s.lenses.push({ x: s.lenses[0].x + Math.abs(s.lenses[0].f) * 3 + 10, f: 10 });
      if (v === '1') s.lenses = [s.lenses[0]];
      this.build();
      this.host.changed();
    });
    const kind = segmented([['finite', 'À distance finie'], ['infinity', 'À l\'infini']], s.object.kind, (v) => {
      s.object.kind = v as 'finite' | 'infinity';
      this.build();
      this.host.changed();
    });
    const L0 = s.lenses[0];
    const objFields = s.object.kind === 'finite'
      ? [
        numberField('Position de l\'objet (cm)', '<span class="ovl">O<sub>1</sub>A</span>', { min: -120, max: 60, step: 0.5 }, s.object.x - L0.x, (v) => { s.object.x = L0.x + v; this.host.changed(); }).el,
        numberField('Hauteur de l\'objet (cm)', '<span class="ovl">AB</span>', { min: -10, max: 10, step: 0.1 }, s.object.h, (v) => { s.object.h = v; this.host.changed(); }).el,
      ]
      : [numberField('Diamètre apparent (°)', '<i>θ</i>', { min: -15, max: 15, step: 0.1 }, s.object.theta, (v) => { s.object.theta = v; this.host.changed(); }).el];
    const lensFields = s.lenses.map((L, i) => section(`Lentille L${sub(i)}`,
      numberField('Distance focale f′ (cm)', `<i>f′</i><sub>${i + 1}</sub>`, { min: -60, max: 60, step: 0.5 }, L.f, (v) => {
        L.f = Math.abs(v) < 0.5 ? (v < 0 ? -0.5 : 0.5) : v;
        this.host.changed();
      }).el,
      i > 0 ? numberField('Distance entre les lentilles (cm)', `<span class="ovl">O<sub>1</sub>O<sub>2</sub></span>`, { min: 0, max: 150, step: 0.5 }, L.x - L0.x, (v) => { L.x = L0.x + Math.max(0.1, v); this.host.changed(); }).el : null,
      html('p', 'lens-note', `Vergence <i>C</i> = ${fmt(vergence(L.f), 4)} δ · lentille ${L.f > 0 ? 'convergente' : 'divergente'}`),
    ));
    const sw = (key: keyof LensState['rays'], label: string) => {
      const input = h('input', { type: 'checkbox', class: 'switch', checked: s.rays[key] });
      input.addEventListener('change', () => {
        s.rays[key] = input.checked;
        this.host.changed(false);
      });
      return h('label', { class: 'option-row' }, h('span', null, label), input);
    };
    this.body.replaceChildren(
      section('Système', count.el),
      section('Objet', kind.el, ...objFields),
      ...lensFields,
      section('Tracé', sw('particular', 'Rayons particuliers'), sw('bundle', 'Faisceau de rayons'), sw('construct', 'Prolongements (tracés virtuels)'), sw('foci', 'Foyers')),
    );
    this.renderResults();
  }

  /** Images successives (intermédiaire puis finale). */
  images(): { x: number; h: number; real: boolean; atInfinity: boolean; gamma: number; oa: number; oaPrime: number; virtualObject: boolean }[] {
    const s = this.s;
    const sorted = [...s.lenses].sort((a, b) => a.x - b.x);
    const out: ReturnType<LensView['images']> = [];
    let objX = s.object.x;
    let objH = s.object.h;
    sorted.forEach((L, i) => {
      if (i === 0 && s.object.kind === 'infinity') {
        const im = imageOfInfinity(L, (s.object.theta * Math.PI) / 180);
        out.push({ x: im.x, h: im.h, real: L.f > 0, atInfinity: false, gamma: NaN, oa: -Infinity, oaPrime: L.f, virtualObject: false });
        objX = im.x;
        objH = im.h;
        return;
      }
      if (!Number.isFinite(objX)) {
        out.push({ x: Infinity, h: Infinity, real: false, atInfinity: true, gamma: Infinity, oa: -Infinity, oaPrime: Infinity, virtualObject: false });
        return;
      }
      const c = conjugate(L, objX, objH);
      out.push({ x: c.x, h: c.h, real: c.real, atInfinity: c.atInfinity, gamma: c.gamma, oa: c.oa, oaPrime: c.oaPrime, virtualObject: c.virtualObject });
      objX = c.x;
      objH = c.h;
    });
    return out;
  }

  renderResults(): void {
    const s = this.s;
    const ims = this.images();
    const last = ims[ims.length - 1];
    const nature = (im: (typeof ims)[number], gammaTotal: number) => {
      if (im.atInfinity) return 'Image rejetée à l\'infini';
      const parts = [im.real ? 'réelle' : 'virtuelle'];
      if (Number.isFinite(gammaTotal)) {
        parts.push(gammaTotal < 0 ? 'renversée' : 'droite');
        parts.push(Math.abs(gammaTotal) > 1 + 1e-9 ? `${fmt(Math.abs(gammaTotal), 3)} fois plus grande` : Math.abs(gammaTotal) < 1 - 1e-9 ? `${fmt(1 / Math.abs(gammaTotal), 3)} fois plus petite` : 'de même taille');
      }
      return `Image ${parts.join(', ')}`;
    };
    const gammaTotal = ims.reduce((g, im) => g * im.gamma, 1);
    const L0 = [...s.lenses].sort((a, b) => a.x - b.x)[0];
    const rows: [string, string][] = [];
    if (s.object.kind === 'finite') {
      const im = ims[0];
      rows.push(['<span class="ovl">O<sub>1</sub>A</span>', `${fmt(im.oa, 5)} cm`]);
      rows.push([s.lenses.length > 1 ? '<span class="ovl">O<sub>1</sub>A<sub>1</sub></span>' : '<span class="ovl">OA′</span>', im.atInfinity ? '∞' : `${fmt(im.oaPrime, 5)} cm`]);
    }
    if (s.lenses.length > 1 && !last.atInfinity) rows.push(['<span class="ovl">O<sub>2</sub>A′</span>', `${fmt(last.oaPrime, 5)} cm`]);
    if (!last.atInfinity && Number.isFinite(last.h)) rows.push(['<span class="ovl">A′B′</span>', `${fmt(last.h, 4)} cm`]);
    if (s.object.kind === 'finite' && Number.isFinite(gammaTotal)) rows.push(['Grandissement <i>γ</i>', fmt(gammaTotal, 4)]);
    if (s.object.kind === 'infinity' && s.lenses.length === 2) {
      const [a, b] = [...s.lenses].sort((u, v) => u.x - v.x);
      rows.push(['Grossissement <i>G</i> = −<i>f′</i><sub>1</sub>/<i>f′</i><sub>2</sub>', fmt(-a.f / b.f, 4)]);
      if (Math.abs(b.x - a.x - (a.f + b.f)) < 1e-6) rows.push(['Système', 'afocal (F′₁ = F₂)']);
    }
    const formula = s.object.kind === 'finite' && s.lenses.length === 1 && !ims[0].atInfinity
      ? html('p', 'lens-formula', `<span class="frac"><span>1</span><span class="ovl">OA′</span></span> − <span class="frac"><span>1</span><span class="ovl">OA</span></span> = <span class="frac"><span>1</span><span><i>f′</i></span></span> : &nbsp;<span class="mono">1/${fmt(ims[0].oaPrime, 4)} − 1/(${fmt(ims[0].oa, 4)}) = 1/${fmt(L0.f, 4)}</span>`)
      : null;
    this.results.replaceChildren(section('Résultats',
      html('p', `lens-nature ${last.real ? 'is-real' : 'is-virtual'}`, s.object.kind === 'infinity' && s.lenses.length === 1 ? `Image dans le plan focal image, hauteur ${fmt(last.h, 4)} cm` : nature(last, gammaTotal)),
      statGrid(rows),
      formula,
    ));
  }

  // ─── Dessin ───────────────────────────────────────────────────────────────

  /** Rectangle englobant pour le cadrage (x0, x1, demi-hauteur). */
  extent(): [number, number, number] {
    const s = this.s;
    const ims = this.images();
    const xs = s.lenses.flatMap((L) => [L.x, L.x - Math.abs(L.f), L.x + Math.abs(L.f)]);
    let hMax = Math.max(1, Math.abs(s.object.kind === 'finite' ? s.object.h : 2));
    if (s.object.kind === 'finite') xs.push(s.object.x);
    const span = Math.max(...xs) - Math.min(...xs);
    for (const im of ims) {
      if (!im.atInfinity && Number.isFinite(im.x) && Math.abs(im.x - s.lenses[0].x) < Math.max(span * 3, 60)) {
        xs.push(im.x);
        if (Math.abs(im.h) < 40) hMax = Math.max(hMax, Math.abs(im.h));
      }
    }
    return [Math.min(...xs), Math.max(...xs), hMax];
  }

  draw(p: Painter, vp: Viewport, pal: OpticsPalette, k: number): void {
    const s = this.s;
    const X = (x: number) => vp.xToPx(x);
    const Y = (y: number) => vp.yToPx(y);
    const sorted = [...s.lenses].sort((a, b) => a.x - b.x);
    const ims = this.images();

    // Papier millimétré léger + axe optique gradué
    const stepX = niceStep(70 / vp.scaleX);
    const stepY = niceStep(50 / vp.scaleY);
    p.beginPath();
    for (let x = Math.ceil(vp.xmin / stepX) * stepX; x <= vp.xmax; x += stepX) {
      p.moveTo(Math.round(X(x)) + 0.5, 0);
      p.lineTo(Math.round(X(x)) + 0.5, vp.height);
    }
    for (let y = Math.ceil(vp.ymin / stepY) * stepY; y <= vp.ymax; y += stepY) {
      p.moveTo(0, Math.round(Y(y)) + 0.5);
      p.lineTo(vp.width, Math.round(Y(y)) + 0.5);
    }
    p.stroke({ color: pal.gridMinor, width: 1, cap: 'butt' });
    const axisY = Y(0);
    line(p, 0, axisY, vp.width, axisY, { color: pal.axis, width: 1.3 * k, dash: [10 * k, 4 * k, 2 * k, 4 * k] });
    for (let x = Math.ceil(vp.xmin / stepX) * stepX; x <= vp.xmax; x += stepX) {
      line(p, X(x), axisY - 3 * k, X(x), axisY + 3 * k, { color: pal.axis, width: 1 });
      p.text(`${fmt(Number(x.toPrecision(10)), 6)}`, X(x), axisY + 6 * k, { color: pal.muted, size: 10.5 * k, align: 'center', baseline: 'top' });
    }
    p.text('cm', vp.width - 10 * k, axisY + 6 * k, { color: pal.muted, size: 10.5 * k, align: 'right', baseline: 'top' });

    // Lentilles
    const [, , hMax] = this.extent();
    const halfH = hMax * 1.35;
    sorted.forEach((L, i) => {
      const x = X(L.x);
      const top = Y(halfH);
      const bottom = Y(-halfH);
      p.beginPath();
      p.rect(x - 4 * k, top, 8 * k, bottom - top);
      p.fill(pal.glass, 0.35);
      line(p, x, top, x, bottom, { color: pal.text, width: 2.2 * k });
      const a = 9 * k;
      const head = (y: number, dir: 1 | -1) => {
        // Convergente : pointes vers l'extérieur ; divergente : vers l'intérieur.
        const out = L.f > 0 ? dir : -dir;
        p.beginPath();
        p.moveTo(x - a, y + out * a);
        p.lineTo(x, y);
        p.lineTo(x + a, y + out * a);
        p.stroke({ color: pal.text, width: 2.2 * k, join: 'miter' });
      };
      head(top, 1);
      head(bottom, -1);
      p.text(`L${sorted.length > 1 ? sub(i) : ''}`, x + 8 * k, top - 4 * k, { color: pal.text, size: 14 * k, weight: 600, family: MATH_FONT, baseline: 'bottom' });
      p.text(`O${sorted.length > 1 ? sub(i) : ''}`, x - 6 * k, axisY + 18 * k, { color: pal.text, size: 13 * k, italic: true, family: MATH_FONT, align: 'right', baseline: 'top', halo: pal.bg });
      if (s.rays.foci) {
        for (const [fx, name] of [[L.x - L.f, 'F'], [L.x + L.f, 'F′']] as const) {
          const px = X(fx);
          disc(p, px, axisY, 3.6 * k, pal.text);
          p.text(`${name}${sorted.length > 1 ? sub(i) : ''}`, px, axisY - 8 * k, { color: pal.text, size: 13 * k, italic: true, family: MATH_FONT, align: 'center', baseline: 'bottom', halo: pal.bg });
        }
      }
    });

    // Objet
    const obj = s.object;
    if (obj.kind === 'finite') this.arrowAB(p, X(obj.x), axisY, Y(obj.h), pal.text, false, 'A', 'B', k, pal);

    // Rayons
    const xEnd = vp.xmax + (vp.xmax - vp.xmin);
    const xStart = obj.kind === 'finite' ? obj.x : vp.xmin - (vp.xmax - vp.xmin) * 0.02;
    const L1 = sorted[0];
    const rays: { ray: Ray; color: string; width: number; alpha?: number }[] = [];
    if (obj.kind === 'finite') {
      const B: [number, number] = [obj.x, obj.h];
      if (s.rays.bundle) {
        const n = 9;
        for (let j = 0; j < n; j++) {
          const yl = -halfH * 0.9 + (1.8 * halfH * j) / (n - 1);
          rays.push({ ray: { x0: B[0], y0: B[1], s: (yl - B[1]) / (L1.x - B[0]) }, color: pal.bundle, width: 1.2 * k, alpha: 0.7 });
        }
      }
      if (s.rays.particular && L1.x > B[0]) {
        rays.push({ ray: { x0: B[0], y0: B[1], s: 0 }, color: pal.rays[0], width: 2 * k });
        rays.push({ ray: { x0: B[0], y0: B[1], s: -B[1] / (L1.x - B[0]) }, color: pal.rays[1], width: 2 * k });
        const fx = L1.x - L1.f;
        if (Math.abs(fx - B[0]) > 1e-9) rays.push({ ray: { x0: B[0], y0: B[1], s: -B[1] / (fx - B[0]) }, color: pal.rays[2], width: 2 * k });
      }
    } else {
      const slope = Math.tan((obj.theta * Math.PI) / 180);
      const through = (xp: number, yp: number): Ray => ({ x0: xStart, y0: yp + slope * (xStart - xp), s: slope });
      if (s.rays.bundle) {
        for (let j = 0; j < 7; j++) rays.push({ ray: through(L1.x, -halfH * 0.8 + (1.6 * halfH * j) / 6), color: pal.bundle, width: 1.2 * k, alpha: 0.7 });
      }
      if (s.rays.particular) {
        rays.push({ ray: through(L1.x, 0), color: pal.rays[1], width: 2 * k });
        rays.push({ ray: through(L1.x - L1.f, 0), color: pal.rays[2], width: 2 * k });
        rays.push({ ray: through(L1.x, halfH * 0.6), color: pal.rays[0], width: 2 * k });
      }
    }
    for (const r of rays) {
      const { points, segments } = traceRay(r.ray, sorted, xEnd);
      const style: StrokeStyle = { color: r.color, width: r.width, alpha: r.alpha, join: 'round' };
      p.beginPath();
      points.forEach(([x, y], i) => (i ? p.lineTo(X(x), Y(y)) : p.moveTo(X(x), Y(y))));
      p.stroke(style);
      // Flèches de propagation au milieu de chaque segment
      for (let i = 0; i + 1 < points.length; i++) {
        const [xa, ya] = points[i];
        const [xb, yb] = points[i + 1];
        const mx = (X(xa) + X(xb)) / 2;
        if (mx < 0 || mx > vp.width || Math.abs(X(xb) - X(xa)) < 40 * k) continue;
        const my = (Y(ya) + Y(yb)) / 2;
        const ang = Math.atan2(Y(yb) - Y(ya), X(xb) - X(xa));
        const a = 6 * k;
        p.beginPath();
        p.moveTo(mx + Math.cos(ang) * a, my + Math.sin(ang) * a);
        p.lineTo(mx + Math.cos(ang + 2.5) * a, my + Math.sin(ang + 2.5) * a);
        p.lineTo(mx + Math.cos(ang - 2.5) * a, my + Math.sin(ang - 2.5) * a);
        p.closePath();
        p.fill(r.color, r.alpha);
      }
      // Prolongements virtuels : vers une image virtuelle (en arrière) ou un objet virtuel (en avant).
      if (s.rays.construct) {
        const dashed: StrokeStyle = { color: r.color, width: 1.2 * k, dash: [5 * k, 4 * k], alpha: (r.alpha ?? 1) * 0.8 };
        sorted.forEach((L, i) => {
          const im = ims[i];
          if (!im || im.atInfinity || !Number.isFinite(im.x)) return;
          const seg = segments[i + 1];
          if (!seg) return;
          if (!im.real && im.x < L.x) line(p, X(L.x), Y(seg.y0), X(im.x), Y(seg.y0 + seg.s * (im.x - L.x)), dashed);
          const next = sorted[i + 1];
          if (next && im.x > next.x) {
            // Objet virtuel pour la lentille suivante : on prolonge le rayon incident au-delà.
            const yN = seg.y0 + seg.s * (next.x - L.x);
            line(p, X(next.x), Y(yN), X(im.x), Y(seg.y0 + seg.s * (im.x - L.x)), dashed);
          }
        });
      }
    }

    // Images (intermédiaire estompée, finale en couleur)
    ims.forEach((im, i) => {
      if (im.atInfinity || !Number.isFinite(im.x) || !Number.isFinite(im.h) || Math.abs(im.h) > 200) return;
      const final = i === ims.length - 1;
      const names: [string, string] = final ? ['A′', 'B′'] : [`A${sub(i)}`, `B${sub(i)}`];
      this.arrowAB(p, X(im.x), axisY, Y(im.h), final ? pal.accent : pal.muted, !im.real, names[0], names[1], k, pal);
    });

    // Poignées
    if (obj.kind === 'finite') disc(p, X(obj.x), Y(obj.h), 6 * k, pal.bg, { color: pal.text, width: 2 * k });
    sorted.forEach((L) => disc(p, X(L.x + L.f), axisY, 6 * k, pal.bg, { color: pal.text, width: 1.6 * k }));

    // Bilan en surimpression (utile en projection et à l'export)
    const last = ims[ims.length - 1];
    const lines: string[] = [];
    if (obj.kind === 'finite') {
      lines.push(`OA = ${fmt(ims[0].oa, 4)} cm   f′ = ${sorted.map((L) => fmt(L.f, 4)).join(' ; ')} cm`);
      if (!last.atInfinity) lines.push(`OA′ = ${fmt(last.oaPrime, 4)} cm   γ = ${fmt(ims.reduce((g, im) => g * im.gamma, 1), 4)}`);
      else lines.push('Image à l\'infini');
    } else {
      lines.push(`Objet à l'infini, θ = ${fmt(obj.theta, 3)}°`);
      if (sorted.length === 2) lines.push(`Grossissement G = ${fmt(-sorted[0].f / sorted[1].f, 4)}`);
    }
    lines.forEach((t, i) => p.text(t, vp.width - 16 * k, 72 * k + i * 20 * k, { color: pal.text, size: 13.5 * k, family: MONO_FONT, align: 'right', baseline: 'top', halo: pal.bg, weight: i === 1 ? 600 : 500 }));
  }

  private arrowAB(p: Painter, x: number, y0: number, y1: number, color: string, dashed: boolean, a: string, b: string, k: number, pal: OpticsPalette): void {
    if (Math.abs(y1 - y0) < 2) return;
    const dir = y1 < y0 ? -1 : 1;
    line(p, x, y0, x, y1 - dir * 7 * k, { color, width: 2.6 * k, dash: dashed ? [6 * k, 4 * k] : undefined });
    p.beginPath();
    p.moveTo(x, y1);
    p.lineTo(x - 6 * k, y1 - dir * 11 * k);
    p.lineTo(x + 6 * k, y1 - dir * 11 * k);
    p.closePath();
    p.fill(color);
    p.text(a, x - 5 * k, y0 + (dir < 0 ? 6 : -6) * k, { color, size: 14 * k, italic: true, family: MATH_FONT, align: 'right', baseline: dir < 0 ? 'top' : 'bottom', halo: pal.bg, weight: 600 });
    p.text(b, x + 8 * k, y1 + (dir < 0 ? -2 : 4) * k, { color, size: 14 * k, italic: true, family: MATH_FONT, align: 'left', baseline: dir < 0 ? 'bottom' : 'top', halo: pal.bg, weight: 600 });
  }

  /** Poignée sous le pointeur (objet B, lentille, foyer image). */
  hit(vp: Viewport, px: number, py: number): Drag | null {
    const s = this.s;
    const near = (x: number, y: number, r = 12) => Math.hypot(vp.xToPx(x) - px, vp.yToPx(y) - py) < r;
    if (s.object.kind === 'finite' && near(s.object.x, s.object.h)) return { kind: 'object' };
    for (let i = 0; i < s.lenses.length; i++) if (near(s.lenses[i].x + s.lenses[i].f, 0)) return { kind: 'focus', i };
    for (let i = 0; i < s.lenses.length; i++) {
      const L = s.lenses[i];
      if (Math.abs(vp.xToPx(L.x) - px) < 10) return { kind: 'lens', i };
    }
    return null;
  }

  dragTo(vp: Viewport, d: Drag, px: number, py: number): void {
    const s = this.s;
    const snap = (v: number) => Math.round(v * 2) / 2;
    const x = snap(vp.pxToX(px));
    if (d.kind === 'object') {
      s.object.x = x;
      s.object.h = Math.round(vp.pxToY(py) * 10) / 10 || 0.1;
    } else if (d.kind === 'lens') {
      s.lenses[d.i].x = x;
    } else {
      const L = s.lenses[d.i];
      const f = x - L.x;
      L.f = Math.abs(f) < 0.5 ? (f < 0 ? -0.5 : 0.5) : f;
    }
  }
}
