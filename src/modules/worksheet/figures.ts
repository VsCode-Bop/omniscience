/**
 * Figures géométriques des exercices, produites à la fois en SVG (aperçu, impression,
 * Markdown) et en TikZ (export LaTeX) à partir des mêmes coordonnées.
 */
import type { Rng } from './rng';
import type { Figure } from './types';

type P = [number, number];

const CM = 37.8; // px par cm à 96 dpi
const INK = '#16161a';

export interface TriangleSpec {
  /** Noms des sommets : [sommet de l'angle droit, sommet 1, sommet 2]. */
  names: [string, string, string];
  /** Longueurs réelles des côtés de l'angle droit [P₀P₁, P₀P₂]. */
  legs: [number, number];
  /** Longueurs affichées (en cm) ou « ? » pour la longueur cherchée. */
  sides?: { s01?: number | '?'; s02?: number | '?'; s12?: number | '?' };
  /** Angle marqué au sommet 1 ou 2 (en degrés, ou « ? »). */
  angle?: { at: 1 | 2; value: number | '?' };
}

const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const unit = (a: P): P => {
  const n = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / n, a[1] / n];
};
const r2 = (x: number) => Math.round(x * 100) / 100;
const frNum = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',');
const texNum = (x: number) => String(Math.round(x * 100) / 100).replace('.', '{,}');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

interface Label {
  at: P;
  svg: string;
  tex: string;
  italic?: boolean;
  bold?: boolean;
  size: number;
}

/** Triangle rectangle, orienté au hasard, avec angle droit codé et longueurs. */
export function rightTriangle(spec: TriangleSpec, rng: Rng): Figure {
  const [a, b] = spec.legs;
  const k = 3.4 / Math.max(a, b);
  const theta = (rng.pick([0, 90, 180, 270]) * Math.PI) / 180 + (rng.next() - 0.5) * 0.7;
  const mirror = rng.chance(0.5);
  const raw: P[] = [[0, 0], [a * k, 0], [0, b * k]];
  const pts = raw.map(([x, y]): P => {
    const xm = mirror ? -x : x;
    return [xm * Math.cos(theta) - y * Math.sin(theta), xm * Math.sin(theta) + y * Math.cos(theta)];
  });
  const g: P = mul(add(add(pts[0], pts[1]), pts[2]), 1 / 3);

  const labels: Label[] = [];
  spec.names.forEach((name, i) => {
    labels.push({ at: add(pts[i], mul(unit(sub(pts[i], g)), 0.36)), svg: name, tex: `$${name}$`, italic: true, size: 15 });
  });

  const side = (i: number, j: number, v: number | '?' | undefined) => {
    if (v === undefined) return;
    const mid = mul(add(pts[i], pts[j]), 0.5);
    const dir = unit(sub(pts[j], pts[i]));
    let n: P = [-dir[1], dir[0]];
    if (n[0] * (mid[0] - g[0]) + n[1] * (mid[1] - g[1]) < 0) n = mul(n, -1);
    const text = v === '?' ? '?' : `${frNum(v)} cm`;
    const w = text.length * 0.19;
    const off = 0.18 + Math.abs(n[0]) * (w / 2) + Math.abs(n[1]) * 0.2;
    labels.push({
      at: add(mid, mul(n, off)),
      svg: text,
      tex: v === '?' ? '\\textbf{?}' : `$${texNum(v)}$~cm`,
      bold: v === '?',
      size: 13,
    });
  };
  side(0, 1, spec.sides?.s01);
  side(0, 2, spec.sides?.s02);
  side(1, 2, spec.sides?.s12);

  // Angle droit
  const s = 0.28;
  const u1 = unit(sub(pts[1], pts[0]));
  const u2 = unit(sub(pts[2], pts[0]));
  const sq: P[] = [add(pts[0], mul(u1, s)), add(add(pts[0], mul(u1, s)), mul(u2, s)), add(pts[0], mul(u2, s))];

  // Angle marqué
  let arc: { c: P; r: number; from: P; to: P; sweep: number; a1: number; a2: number } | null = null;
  if (spec.angle) {
    const v = pts[spec.angle.at];
    const others = [0, 1, 2].filter((i) => i !== spec.angle!.at);
    const u = unit(sub(pts[others[0]], v));
    const w = unit(sub(pts[others[1]], v));
    const r = 0.55;
    const cross = u[0] * w[1] - u[1] * w[0];
    let a1 = (Math.atan2(u[1], u[0]) * 180) / Math.PI;
    let a2 = (Math.atan2(w[1], w[0]) * 180) / Math.PI;
    if (a2 - a1 > 180) a2 -= 360;
    if (a2 - a1 < -180) a2 += 360;
    arc = { c: v, r, from: add(v, mul(u, r)), to: add(v, mul(w, r)), sweep: cross > 0 ? 1 : 0, a1, a2 };
    const bis = unit(add(u, w));
    const val = spec.angle.value;
    const text = val === '?' ? '?' : `${frNum(val)}°`;
    labels.push({ at: add(v, mul(bis, 0.98)), svg: text, tex: val === '?' ? '\\textbf{?}' : `$${texNum(val)}^\\circ$`, bold: val === '?', size: 12 });
  }

  // Cadre
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  const grow = (p: P, hw = 0, hh = 0) => {
    minX = Math.min(minX, p[0] - hw);
    maxX = Math.max(maxX, p[0] + hw);
    minY = Math.min(minY, p[1] - hh);
    maxY = Math.max(maxY, p[1] + hh);
  };
  pts.forEach((p) => grow(p));
  labels.forEach((l) => grow(l.at, (l.svg.length * l.size * 0.55) / CM / 2 + 0.05, 0.25));
  const pad = 0.12;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const W = (maxX - minX) * CM;
  const H = (maxY - minY) * CM;
  const X = (p: P) => ((p[0] - minX) * CM).toFixed(1);
  const Y = (p: P) => ((maxY - p[1]) * CM).toFixed(1);

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" width="${W.toFixed(0)}" height="${H.toFixed(0)}" class="ws-fig">`,
    `<polygon points="${pts.map((p) => `${X(p)},${Y(p)}`).join(' ')}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`,
    `<polyline points="${sq.map((p) => `${X(p)},${Y(p)}`).join(' ')}" fill="none" stroke="${INK}" stroke-width="1"/>`,
    arc ? `<path d="M${X(arc.from)} ${Y(arc.from)} A${(arc.r * CM).toFixed(1)} ${(arc.r * CM).toFixed(1)} 0 0 ${arc.sweep} ${X(arc.to)} ${Y(arc.to)}" fill="none" stroke="${INK}" stroke-width="1"/>` : '',
    ...labels.map((l) => `<text x="${X(l.at)}" y="${Y(l.at)}" font-size="${l.size}" text-anchor="middle" dominant-baseline="central" fill="${INK}" font-family="'Source Serif 4', Georgia, serif"${l.italic ? ' font-style="italic"' : ''}${l.bold ? ' font-weight="700"' : ''}>${esc(l.svg)}</text>`),
    '</svg>',
  ].join('');

  const c = (p: P) => `(${r2(p[0])},${r2(p[1])})`;
  const tikz = [
    '\\begin{tikzpicture}[line join=round]',
    `\\draw[thick] ${pts.map(c).join(' -- ')} -- cycle;`,
    `\\draw ${sq.map(c).join(' -- ')};`,
    arc ? `\\draw ${c(arc.from)} arc[start angle=${r2(arc.a1)}, end angle=${r2(arc.a2)}, radius=${arc.r}];` : '',
    ...labels.map((l) => `\\node${l.size < 14 ? '[font=\\small]' : ''} at ${c(l.at)} {${l.tex}};`),
    '\\end{tikzpicture}',
  ].filter(Boolean).join('\n');

  return { svg, tikz };
}
