/**
 * Mise en page minimale de formules pour le Painter : texte, fractions, matrices
 * entre parenthèses (éventuellement augmentées), alignées sur leur axe horizontal.
 * Les largeurs sont estimées (police à chasse fixe pour les nombres) afin que le
 * rendu soit identique à l'écran, en SVG et en PDF.
 */
import { MATH_FONT, MONO_FONT, DEFAULT_FONT, line, type Painter } from '../../core/graphics/painter';
import { abs } from './numbers';
import type { Fraction, Matrix } from './matrix';

export interface Box {
  w: number;
  /** Hauteur totale ; la boîte est dessinée centrée sur y. */
  h: number;
  draw(p: Painter, x: number, y: number, color: string): void;
}

export type Font = 'mono' | 'sans' | 'math';
const FAMILY: Record<Font, string> = { mono: MONO_FONT, sans: DEFAULT_FONT, math: MATH_FONT };
const ADVANCE: Record<Font, number> = { mono: 0.6, sans: 0.56, math: 0.5 };

export function text(str: string, size: number, font: Font = 'sans', opts: { italic?: boolean; weight?: number; color?: string } = {}): Box {
  return {
    w: str.length * size * ADVANCE[font],
    h: size * 1.3,
    draw: (p, x, y, color) => p.text(str, x, y, { color: opts.color ?? color, size, family: FAMILY[font], italic: opts.italic, weight: opts.weight, baseline: 'middle' }),
  };
}

/** Espace horizontale. */
export function space(w: number): Box {
  return { w, h: 0, draw: () => {} };
}

export function row(items: Box[], gap = 0): Box {
  const w = items.reduce((s, b) => s + b.w, 0) + gap * Math.max(0, items.length - 1);
  const h = Math.max(0, ...items.map((b) => b.h));
  return {
    w,
    h,
    draw: (p, x, y, color) => {
      let cx = x;
      for (const b of items) {
        b.draw(p, cx, y, color);
        cx += b.w + gap;
      }
    },
  };
}

/** Pile verticale alignée à gauche (lignes de texte). */
export function column(items: Box[], gap = 4): Box {
  const h = items.reduce((s, b) => s + b.h, 0) + gap * Math.max(0, items.length - 1);
  return {
    w: Math.max(0, ...items.map((b) => b.w)),
    h,
    draw: (p, x, y, color) => {
      let cy = y - h / 2;
      for (const b of items) {
        b.draw(p, x, cy + b.h / 2, color);
        cy += b.h + gap;
      }
    },
  };
}

/** Nombre rationnel : entier, ou fraction empilée précédée du signe. */
export function fraction(f: Fraction, size: number): Box {
  if (f.d === 1n) return text(String(f.n).replace('-', '−'), size, 'mono');
  const s = size * 0.8;
  const num = String(abs(f.n));
  const den = String(f.d);
  const width = Math.max(num.length, den.length) * s * 0.6 + s * 0.3;
  const sign = f.n < 0n ? size * 0.62 : 0;
  return {
    w: sign + width,
    h: s * 2.55,
    draw: (p, x, y, color) => {
      if (sign) p.text('−', x, y, { color, size, family: MONO_FONT, baseline: 'middle' });
      const cx = x + sign + width / 2;
      p.text(num, cx, y - s * 0.66, { color, size: s, family: MONO_FONT, align: 'center', baseline: 'middle' });
      p.text(den, cx, y + s * 0.7, { color, size: s, family: MONO_FONT, align: 'center', baseline: 'middle' });
      line(p, x + sign + s * 0.05, y, x + sign + width - s * 0.05, y, { color, width: Math.max(1, s * 0.07), cap: 'butt' });
    },
  };
}

function paren(p: Painter, x: number, top: number, h: number, right: boolean, color: string, size: number): void {
  const bulge = Math.min(size * 0.45, h * 0.12 + 2);
  const steps = 24;
  p.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const dx = bulge * Math.sin(Math.PI * t);
    const px = right ? x + dx : x + bulge - dx;
    const py = top + t * h;
    if (i) p.lineTo(px, py);
    else p.moveTo(px, py);
  }
  p.stroke({ color, width: Math.max(1.3, size * 0.075), cap: 'round' });
}

/**
 * Matrice entre parenthèses. `augmented` : nombre de colonnes à droite séparées par un trait.
 * `highlight` : ligne à surligner (étapes du pivot de Gauss).
 */
export function matrix(m: Matrix, size: number, opts: { augmented?: number; highlight?: number[]; highlightColor?: string } = {}): Box {
  const cells = m.map((r) => r.map((x) => fraction(x, size)));
  const nc = cells[0]?.length ?? 0;
  const colW = Array.from({ length: nc }, (_, j) => Math.max(size * 0.6, ...cells.map((r) => r[j].w)));
  const rowH = cells.map((r) => Math.max(size * 1.5, ...r.map((c) => c.h)));
  const gapX = size * 1.05;
  const gapY = size * 0.35;
  const pad = size * 0.55;
  const parenW = size * 0.5;
  const aug = opts.augmented ?? 0;
  const innerW = colW.reduce((s, w) => s + w, 0) + gapX * Math.max(0, nc - 1);
  const innerH = rowH.reduce((s, h) => s + h, 0) + gapY * Math.max(0, rowH.length - 1);
  const w = innerW + 2 * (pad + parenW);
  const h = innerH + size * 0.5;
  return {
    w,
    h,
    draw: (p, x, y, color) => {
      const top = y - h / 2;
      paren(p, x, top, h, false, color, size);
      paren(p, x + w - parenW, top, h, true, color, size);
      let cy = y - innerH / 2;
      rowH.forEach((rh, i) => {
        if (opts.highlight?.includes(i)) {
          p.beginPath();
          p.rect(x + parenW + pad * 0.4, cy - gapY / 2, w - 2 * parenW - pad * 0.8, rh + gapY);
          p.fill(opts.highlightColor ?? color, 0.12);
        }
        let cx = x + parenW + pad;
        cells[i].forEach((c, j) => {
          // Nombres alignés à droite dans leur colonne.
          c.draw(p, cx + colW[j] - c.w, cy + rh / 2, color);
          cx += colW[j] + gapX;
          if (aug && j === nc - aug - 1) {
            const bx = cx - gapX / 2;
            line(p, bx, top + size * 0.3, bx, top + h - size * 0.3, { color, width: 1.1, cap: 'butt' });
          }
        });
        cy += rh + gapY;
      });
    },
  };
}

/** Puissance : base puis exposant réduit et surélevé (2³). */
export function power(base: string, exp: number, size: number): Box {
  const b = text(base, size, 'mono');
  if (exp <= 1) return b;
  const e = String(exp);
  const es = size * 0.62;
  return {
    w: b.w + e.length * es * 0.6 + size * 0.08,
    h: size * 1.5,
    draw: (p, x, y, color) => {
      b.draw(p, x, y, color);
      p.text(e, x + b.w + size * 0.06, y - size * 0.42, { color, size: es, family: MONO_FONT, baseline: 'middle' });
    },
  };
}
