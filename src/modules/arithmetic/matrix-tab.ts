/**
 * Onglet « Matrices » : saisie de A et B (fractions exactes), opérations,
 * étapes du pivot de Gauss, systèmes linéaires et, pour une matrice 2 × 2,
 * transformation du plan associée.
 */
import { h, svgIcon } from '../../core/dom';
import { disc, line, MATH_FONT, MONO_FONT, type Painter } from '../../core/graphics/painter';
import { icon } from '../../core/icons';
import { fmt } from '../../core/math/format';
import { html, section } from '../../core/widgets';
import { drawGrid, type Palette } from '../grapher/renderer';
import { Viewport } from '../grapher/viewport';
import type { ArithPalette, ViewHost } from './arith-tab';
import {
  add, cols, determinant, Fraction, inverse, MatrixError, mul, power, rows, rref, scale, solve, sub, toTex, transpose,
  type GaussStep, type Matrix, type Solution,
} from './matrix';
import { column, fraction, matrix, row, space, text, type Box } from './typeset';

export type MatOp = 'add' | 'sub' | 'mul' | 'mulBA' | 'scale' | 'transpose' | 'det' | 'inverse' | 'power' | 'rank' | 'solve' | 'gauss';

export interface MatState {
  A: string[][];
  B: string[][];
  k: string;
  n: string;
  op: MatOp;
  steps: boolean;
  view: 'calc' | 'transform';
}

export function defaultMat(): MatState {
  return {
    A: [['2', '1', '-1'], ['-3', '-1', '2'], ['-2', '1', '2']],
    B: [['8'], ['-11'], ['-3']],
    k: '2', n: '3', op: 'solve', steps: true, view: 'calc',
  };
}

export function sanitizeMat(raw: unknown): MatState {
  const d = defaultMat();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<MatState>;
  const grid = (g: unknown, def: string[][]) => {
    if (!Array.isArray(g) || !g.length || g.length > 6) return def;
    const c = Array.isArray(g[0]) ? g[0].length : 0;
    if (!c || c > 6 || !g.every((row) => Array.isArray(row) && row.length === c && row.every((x) => typeof x === 'string' && x.length < 30))) return def;
    return g as string[][];
  };
  const ops: MatOp[] = ['add', 'sub', 'mul', 'mulBA', 'scale', 'transpose', 'det', 'inverse', 'power', 'rank', 'solve', 'gauss'];
  return {
    A: grid(r.A, d.A),
    B: grid(r.B, d.B),
    k: typeof r.k === 'string' && r.k.length < 30 ? r.k : d.k,
    n: typeof r.n === 'string' && r.n.length < 6 ? r.n : d.n,
    op: ops.includes(r.op as MatOp) ? (r.op as MatOp) : d.op,
    steps: r.steps !== false,
    view: r.view === 'transform' ? 'transform' : 'calc',
  };
}

const OPS: [MatOp, string, string][] = [
  ['add', 'A + B', 'Somme'],
  ['sub', 'A − B', 'Différence'],
  ['mul', 'A × B', 'Produit'],
  ['mulBA', 'B × A', 'Produit (ordre inverse)'],
  ['scale', 'k · A', 'Produit par un réel'],
  ['transpose', 'Aᵀ', 'Transposée'],
  ['det', 'det A', 'Déterminant'],
  ['inverse', 'A⁻¹', 'Inverse (Gauss-Jordan)'],
  ['power', 'Aⁿ', 'Puissance'],
  ['rank', 'rang A', 'Rang'],
  ['solve', 'AX = B', 'Système linéaire (B : second membre)'],
  ['gauss', 'Gauss', 'Forme échelonnée réduite de A'],
];

type Result =
  | { kind: 'matrix'; label: string; tex: string; m: Matrix; steps?: GaussStep[]; augmented?: number; note?: string }
  | { kind: 'scalar'; label: string; tex: string; value: Fraction; steps?: GaussStep[]; augmented?: number; note?: string }
  | { kind: 'solve'; steps: GaussStep[]; solution: Solution; unknowns: number }
  | { kind: 'error'; message: string };

const SUBS = '₀₁₂₃₄₅₆₇₈₉';
const sub1 = (i: number) => String(i + 1).replace(/\d/g, (d) => SUBS[Number(d)]);

export class MatrixTab {
  readonly panel: HTMLElement;
  private readonly editors: HTMLElement;
  private readonly opsEl: HTMLElement;
  private readonly extra: HTMLElement;
  private result: Result = { kind: 'error', message: '' };
  private A: Matrix | null = null;
  private B: Matrix | null = null;

  constructor(private s: MatState, private readonly host: ViewHost & { toast(m: string, k?: 'info' | 'success' | 'error'): void }) {
    this.editors = h('div', { class: 'mat-editors' });
    this.opsEl = h('div', { class: 'op-grid' });
    this.extra = h('div');
    this.panel = h('div', { class: 'tab-panel' },
      section('Matrices', this.editors),
      section('Opération', this.opsEl, this.extra),
    );
    this.buildEditors();
    this.buildOps();
    this.compute();
  }

  getState(): MatState {
    return this.s;
  }

  isSquare2(): boolean {
    return this.s.A.length === 2 && this.s.A[0].length === 2 && !!this.A;
  }

  // ─── Saisie ───────────────────────────────────────────────────────────────

  private buildEditors(): void {
    this.editors.replaceChildren(this.editor('A'), this.editor('B'));
  }

  private editor(name: 'A' | 'B'): HTMLElement {
    const grid = this.s[name];
    const sizeSel = (value: number, onChange: (v: number) => void, label: string) => {
      const sel = h('select', { class: 'select select-sm', 'aria-label': label }, ...[1, 2, 3, 4, 5, 6].map((v) => h('option', { value: String(v) }, String(v))));
      sel.value = String(value);
      sel.addEventListener('change', () => onChange(Number(sel.value)));
      return sel;
    };
    const resize = (r: number, c: number) => {
      const old = this.s[name];
      this.s[name] = Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => old[i]?.[j] ?? (i === j && name === 'A' ? '1' : '0')));
      this.buildEditors();
      this.compute();
      this.host.notify();
    };
    const cells = h('div', { class: 'mat-grid', style: `grid-template-columns: repeat(${grid[0].length}, minmax(0, 1fr))` },
      ...grid.flatMap((r, i) => r.map((v, j) => {
        const input = h('input', { class: 'mat-cell', type: 'text', inputmode: 'decimal', spellcheck: false, 'aria-label': `${name} ligne ${i + 1} colonne ${j + 1}` });
        input.value = v;
        input.classList.toggle('is-invalid', Fraction.parse(v) === null);
        input.addEventListener('input', () => {
          this.s[name][i][j] = input.value;
          input.classList.toggle('is-invalid', Fraction.parse(input.value) === null);
          this.compute();
          this.host.notify();
        });
        input.addEventListener('focus', () => input.select());
        return input;
      })),
    );
    return h('div', { class: 'mat-editor' },
      h('div', { class: 'mat-head' },
        html('span', 'mat-name', `<i>${name}</i>`),
        h('div', { class: 'mat-size' },
          sizeSel(grid.length, (r) => resize(r, grid[0].length), `Lignes de ${name}`),
          html('span', 'muted', '×'),
          sizeSel(grid[0].length, (c) => resize(grid.length, c), `Colonnes de ${name}`),
        ),
        h('button', { class: 'btn btn-ghost btn-sm', title: 'Remplir avec la matrice identité', onclick: () => {
          const n = this.s[name].length;
          const m = this.s[name][0].length;
          this.s[name] = Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => (i === j ? '1' : '0')));
          this.buildEditors();
          this.compute();
          this.host.notify();
        } }, 'Identité'),
      ),
      cells,
    );
  }

  private buildOps(): void {
    this.opsEl.replaceChildren(...OPS.map(([op, label, title]) => {
      const b = h('button', { class: `op-btn${this.s.op === op ? ' is-active' : ''}`, title, 'aria-pressed': String(this.s.op === op), onclick: () => {
        this.s.op = op;
        this.buildOps();
        this.compute();
        this.host.notify();
      } }, label);
      return b;
    }));
    const needs = this.s.op === 'scale' ? 'k' : this.s.op === 'power' ? 'n' : null;
    const param = needs
      ? (() => {
        const input = h('input', { class: 'input input-mono', type: 'text', inputmode: 'decimal', 'aria-label': needs });
        input.value = this.s[needs];
        input.addEventListener('input', () => {
          this.s[needs] = input.value;
          this.compute();
          this.host.notify();
        });
        const label = h('label', { class: 'param-inline' });
        label.innerHTML = `<i>${needs}</i> =`;
        label.append(input);
        return label;
      })()
      : null;
    const stepsSw = h('input', { type: 'checkbox', class: 'switch', checked: this.s.steps });
    stepsSw.addEventListener('change', () => {
      this.s.steps = stepsSw.checked;
      this.host.invalidate();
      this.host.notify();
    });
    const copy = h('button', { class: 'btn btn-block', onclick: () => this.copyTex() }, svgIcon(icon('copy'), 'icon icon-sm'), 'Copier le résultat en LaTeX');
    this.extra.replaceChildren(
      ...(param ? [param] : []),
      h('label', { class: 'option-row' }, h('span', null, 'Détailler les étapes (pivot de Gauss)'), stepsSw),
      copy,
    );
  }

  // ─── Calcul ───────────────────────────────────────────────────────────────

  private parseGrid(g: string[][]): Matrix | null {
    const m = g.map((r) => r.map((x) => Fraction.parse(x)));
    return m.every((r) => r.every((x) => x !== null)) ? (m as Matrix) : null;
  }

  private compute(): void {
    this.A = this.parseGrid(this.s.A);
    this.B = this.parseGrid(this.s.B);
    this.result = this.evaluate();
    this.host.invalidate();
  }

  private evaluate(): Result {
    const { A, B } = this;
    const op = this.s.op;
    const needsB = ['add', 'sub', 'mul', 'mulBA', 'solve'].includes(op);
    if (!A) return { kind: 'error', message: 'La matrice A contient une valeur non reconnue (exemples : 3, −2/5, 0,25).' };
    if (needsB && !B) return { kind: 'error', message: 'La matrice B contient une valeur non reconnue.' };
    try {
      switch (op) {
        case 'add': return { kind: 'matrix', label: 'A + B', tex: 'A+B', m: add(A, B!) };
        case 'sub': return { kind: 'matrix', label: 'A − B', tex: 'A-B', m: sub(A, B!) };
        case 'mul': return { kind: 'matrix', label: 'A × B', tex: 'A\\times B', m: mul(A, B!) };
        case 'mulBA': return { kind: 'matrix', label: 'B × A', tex: 'B\\times A', m: mul(B!, A) };
        case 'scale': {
          const k = Fraction.parse(this.s.k);
          if (!k) return { kind: 'error', message: 'Valeur de k non reconnue.' };
          return { kind: 'matrix', label: `${k} · A`, tex: `${k.toTex()}\\,A`, m: scale(A, k) };
        }
        case 'transpose': return { kind: 'matrix', label: 'Aᵀ', tex: 'A^{\\mathsf{T}}', m: transpose(A) };
        case 'det': {
          if (rows(A) !== cols(A)) throw new MatrixError('Le déterminant n\'est défini que pour une matrice carrée.');
          const { steps } = rref(A);
          const d = determinant(A);
          return { kind: 'scalar', label: 'det(A)', tex: '\\det(A)', value: d, steps, note: d.isZero() ? 'A n\'est pas inversible.' : 'A est inversible.' };
        }
        case 'inverse': {
          const { result, steps } = inverse(A);
          return { kind: 'matrix', label: 'A⁻¹', tex: 'A^{-1}', m: result, steps, augmented: cols(A) };
        }
        case 'power': {
          const n = Number(this.s.n.trim());
          if (!Number.isInteger(n) || Math.abs(n) > 999) return { kind: 'error', message: 'n doit être un entier entre −999 et 999.' };
          return { kind: 'matrix', label: `A${String(n).replace(/-/g, '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)])}`, tex: `A^{${n}}`, m: power(A, n) };
        }
        case 'rank': {
          const { rank, steps, result } = rref(A);
          void result;
          return { kind: 'scalar', label: 'rang(A)', tex: '\\operatorname{rg}(A)', value: Fraction.of(rank), steps, note: `Forme échelonnée : ${rank} pivot${rank > 1 ? 's' : ''}.` };
        }
        case 'gauss': {
          const { result, steps, rank } = rref(A);
          return { kind: 'matrix', label: 'Forme échelonnée réduite de A', tex: '\\operatorname{rref}(A)', m: result, steps, note: `Rang : ${rank}` };
        }
        case 'solve': {
          const b = B!.map((r) => r[0]);
          if (cols(B!) !== 1) return { kind: 'error', message: 'Pour résoudre AX = B, B doit être une matrice colonne (une seule colonne).' };
          const { solution, steps } = solve(A, b);
          return { kind: 'solve', steps, solution, unknowns: cols(A) };
        }
      }
    } catch (err) {
      return { kind: 'error', message: err instanceof MatrixError || err instanceof RangeError ? err.message : String(err) };
    }
  }

  private copyTex(): void {
    const r = this.result;
    let tex = '';
    const steps = (list: GaussStep[] | undefined, aug?: number) => (this.s.steps && list?.length
      ? `\n% Étapes\n${list.map((s) => `${s.ops.map((o) => `% ${o}`).join('\n')}\n${toTex(s.matrix, aug)}`).join('\n')}`
      : '');
    if (r.kind === 'matrix') tex = `${r.tex}=${toTex(r.m)}${steps(r.steps, r.augmented)}`;
    else if (r.kind === 'scalar') tex = `${r.tex}=${r.value.toTex()}`;
    else if (r.kind === 'solve') {
      const s = r.solution;
      tex = s.kind === 'unique' ? `\\left\\{\\begin{aligned}${s.x.map((v, i) => `x_{${i + 1}}&=${v.toTex()}`).join('\\\\')}\\end{aligned}\\right.` : s.kind === 'none' ? '\\mathcal{S}=\\varnothing' : '\\text{infinité de solutions}';
      tex += steps(r.steps, 1);
    } else {
      this.host.toast(r.message || 'Rien à copier.', 'error');
      return;
    }
    void navigator.clipboard?.writeText(tex).then(() => this.host.toast('LaTeX copié dans le presse-papiers', 'success'));
  }

  // ─── Dessin : calcul ──────────────────────────────────────────────────────

  /** Dessine (ou mesure si p est null) le compte rendu ; renvoie la hauteur utilisée. */
  drawCalc(p: Painter | null, w: number, pal: ArithPalette, k: number, top: number): number {
    const size = 17 * k;
    const gap = 26 * k;
    let y = top;
    const put = (box: Box, x: number, color = pal.text) => {
      if (p) box.draw(p, x, y + box.h / 2, color);
    };
    const left = 40 * k;

    // Données
    const eq = (name: string, m: Matrix | null) => (m ? row([text(`${name} =`, size * 1.05, 'math', { italic: true }), space(8 * k), matrix(m, size)]) : text(`${name} : saisie invalide`, size, 'sans', { color: pal.muted }));
    const uses = this.usesB();
    const inputs = [eq('A', this.A), ...(uses ? [eq('B', this.B)] : [])];
    const dataRow = row(inputs, 48 * k);
    put(dataRow, left);
    y += dataRow.h + gap;
    if (p) line(p, left, y - gap / 2, w - left, y - gap / 2, { color: pal.line, width: 1, cap: 'butt' });

    const r = this.result;
    if (r.kind === 'error') {
      const t = text(r.message, 15 * k, 'sans', { color: '#e5484d' });
      put(t, left);
      return y + t.h - top + 20 * k;
    }

    // Résultat principal
    if (r.kind === 'matrix' || r.kind === 'scalar') {
      const lhs = text(`${r.label} =`, size * 1.15, 'math', { italic: false, weight: 600 });
      const rhs = r.kind === 'matrix' ? matrix(r.m, size * 1.1) : fraction(r.value, size * 1.5);
      const res = row([lhs, space(10 * k), rhs]);
      put(res, left, pal.text);
      y += res.h + 8 * k;
      if (r.note) {
        const note = text(r.note, 13.5 * k, 'sans', { color: pal.muted });
        put(note, left);
        y += note.h;
      }
      y += gap;
    } else {
      const s = r.solution;
      const lines: Box[] = [];
      if (s.kind === 'unique') {
        lines.push(text('Solution unique :', 14 * k, 'sans', { color: pal.muted }));
        s.x.forEach((v, i) => lines.push(row([text(`x${sub1(i)} =`, size * 1.1, 'math', { italic: true }), space(8 * k), fraction(v, size * 1.1)])));
      } else if (s.kind === 'none') {
        lines.push(text('Le système n\'a aucune solution : S = ∅', size, 'sans', { weight: 600 }));
        lines.push(text('Une ligne du système réduit s\'écrit 0 = c avec c ≠ 0.', 13.5 * k, 'sans', { color: pal.muted }));
      } else {
        lines.push(text('Infinité de solutions', size, 'sans', { weight: 600 }));
        lines.push(text(`Inconnue${s.free.length > 1 ? 's' : ''} libre${s.free.length > 1 ? 's' : ''} : ${s.free.map((i) => `x${sub1(i)}`).join(', ')} ; solution particulière : (${s.particular.map(String).join(' ; ')})`, 13.5 * k, 'sans', { color: pal.muted }));
      }
      const col = column(lines, 10 * k);
      put(col, left);
      y += col.h + gap;
    }

    // Étapes
    const steps = r.steps;
    const aug = r.kind === 'solve' ? 1 : r.augmented ?? 0;
    if (this.s.steps && steps?.length) {
      const title = text(`Méthode du pivot de Gauss — ${steps.length} étape${steps.length > 1 ? 's' : ''}`, 14 * k, 'sans', { weight: 600, color: pal.muted });
      put(title, left);
      y += title.h + 12 * k;
      // Point de départ puis étapes, disposés en lignes qui se replient.
      const start = r.kind === 'solve' || aug ? this.augmentedStart(aug) : this.A!;
      const cards: Box[] = [this.stepCard(['Départ'], start, aug, size * 0.85, k, pal)];
      steps.forEach((s) => cards.push(this.stepCard(s.ops, s.matrix, aug, size * 0.85, k, pal)));
      let x = left;
      let lineH = 0;
      for (const card of cards) {
        if (x > left && x + card.w > w - left) {
          y += lineH + 18 * k;
          x = left;
          lineH = 0;
        }
        if (p) {
          p.beginPath();
          p.rect(x, y, card.w, card.h);
          p.fill(pal.surface);
          p.beginPath();
          p.rect(x, y, card.w, card.h);
          p.stroke({ color: pal.line, width: 1 });
          card.draw(p, x, y + card.h / 2, pal.text);
        }
        x += card.w + 14 * k;
        lineH = Math.max(lineH, card.h);
      }
      y += lineH + gap;
    }
    return y - top;
  }

  private usesB(): boolean {
    return ['add', 'sub', 'mul', 'mulBA', 'solve'].includes(this.s.op);
  }

  private augmentedStart(aug: number): Matrix {
    const A = this.A!;
    if (this.s.op === 'solve') return A.map((r, i) => [...r, this.B![i][0]]);
    return A.map((r, i) => [...r, ...Array.from({ length: aug }, (_, j) => (i === j ? Fraction.ONE : Fraction.ZERO))]);
  }

  private stepCard(ops: string[], m: Matrix, aug: number, size: number, k: number, pal: ArithPalette): Box {
    const pad = 12 * k;
    const opsBox = column(ops.slice(0, 6).map((o) => text(o, 13 * k, 'mono', { color: pal.accent, weight: 600 })), 3 * k);
    const mat = matrix(m, size, { augmented: aug });
    const inner = column([opsBox, mat], 10 * k);
    return {
      w: inner.w + 2 * pad,
      h: inner.h + 2 * pad,
      draw: (p, x, y, color) => inner.draw(p, x + pad, y, color),
    };
  }

  // ─── Dessin : transformation du plan (2 × 2) ──────────────────────────────

  drawTransform(p: Painter, w: number, hgt: number, pal: ArithPalette & Palette, k: number): void {
    const A = this.A;
    if (!A || rows(A) !== 2 || cols(A) !== 2) return;
    const [[a, b], [c, d]] = A.map((r) => r.map((x) => x.toNumber()));
    const T = (x: number, y: number): [number, number] => [a * x + b * y, c * x + d * y];
    const corners = [T(1, 0), T(0, 1), T(1, 1), [1, 1] as [number, number]];
    const R = Math.max(2.5, ...corners.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y)) * 1.35));
    const vp = new Viewport(-R, R, -R, R, w, hgt);
    vp.makeOrthonormal();
    if (vp.ymax - vp.ymin < 2 * R) {
      const f = (2 * R) / (vp.ymax - vp.ymin);
      vp.set(vp.xmin * f, vp.xmax * f, -R, R);
    }
    drawGrid(p, { vp, opts: { grid: true, axes: true, pi: false }, scale: k }, pal);
    const X = (x: number) => vp.xToPx(x);
    const Y = (y: number) => vp.yToPx(y);
    // Image du quadrillage
    const n = Math.ceil(R * 1.5) + 1;
    p.beginPath();
    for (let i = -n; i <= n; i++) {
      const [x1, y1] = T(i, -n);
      const [x2, y2] = T(i, n);
      p.moveTo(X(x1), Y(y1));
      p.lineTo(X(x2), Y(y2));
      const [x3, y3] = T(-n, i);
      const [x4, y4] = T(n, i);
      p.moveTo(X(x3), Y(y3));
      p.lineTo(X(x4), Y(y4));
    }
    p.stroke({ color: pal.accent, width: 1, alpha: 0.28 });
    // Carré unité et son image
    const square: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const poly = (pts: [number, number][], fill: string, alpha: number, stroke: string, dash?: number[]) => {
      p.beginPath();
      pts.forEach(([x, y], i) => (i ? p.lineTo(X(x), Y(y)) : p.moveTo(X(x), Y(y))));
      p.closePath();
      if (alpha) p.fill(fill, alpha);
      p.beginPath();
      pts.forEach(([x, y], i) => (i ? p.lineTo(X(x), Y(y)) : p.moveTo(X(x), Y(y))));
      p.closePath();
      p.stroke({ color: stroke, width: 1.6 * k, dash });
    };
    poly(square, pal.muted, 0.08, pal.muted, [5 * k, 4 * k]);
    poly(square.map(([x, y]) => T(x, y)), pal.accent, 0.2, pal.accent);
    // Lettre F (orientation)
    const F: [number, number][] = [[0.25, 0.2], [0.25, 0.85], [0.7, 0.85], [0.25, 0.85], [0.25, 0.55], [0.55, 0.55]];
    const stroke = (pts: [number, number][], color: string, width: number) => {
      p.beginPath();
      pts.forEach(([x, y], i) => (i ? p.lineTo(X(x), Y(y)) : p.moveTo(X(x), Y(y))));
      p.stroke({ color, width, join: 'round' });
    };
    stroke(F, pal.muted, 3 * k);
    stroke(F.map(([x, y]) => T(x, y)), pal.text, 3.5 * k);
    // Vecteurs de base et leurs images
    const arrow = (x: number, y: number, color: string, label: string) => {
      const px = X(x);
      const py = Y(y);
      const ox = X(0);
      const oy = Y(0);
      const len = Math.hypot(px - ox, py - oy);
      if (len < 2) return;
      line(p, ox, oy, px, py, { color, width: 2.6 * k });
      const ux = (px - ox) / len;
      const uy = (py - oy) / len;
      const s = 10 * k;
      p.beginPath();
      p.moveTo(px, py);
      p.lineTo(px - ux * s - uy * s * 0.5, py - uy * s + ux * s * 0.5);
      p.lineTo(px - ux * s + uy * s * 0.5, py - uy * s - ux * s * 0.5);
      p.closePath();
      p.fill(color);
      p.text(label, px + ux * 12 * k, py + uy * 12 * k, { color, size: 14 * k, weight: 600, family: MATH_FONT, italic: true, align: ux < -0.3 ? 'right' : ux > 0.3 ? 'left' : 'center', baseline: uy < -0.3 ? 'bottom' : uy > 0.3 ? 'top' : 'middle', halo: pal.bg });
    };
    arrow(1, 0, pal.curves[1], '');
    arrow(0, 1, pal.curves[2], '');
    const [ix, iy] = T(1, 0);
    const [jx, jy] = T(0, 1);
    arrow(ix, iy, pal.curves[1], `A·i (${fmt(ix, 4)} ; ${fmt(iy, 4)})`);
    arrow(jx, jy, pal.curves[2], `A·j (${fmt(jx, 4)} ; ${fmt(jy, 4)})`);
    disc(p, X(0), Y(0), 3.5 * k, pal.text);
    // Légende
    const det = a * d - b * c;
    const lines = [
      `det A = ${fmt(det, 6)}`,
      Math.abs(det) < 1e-12 ? 'Transformation non inversible : le plan est écrasé sur une droite (ou un point).' : `Les aires sont multipliées par |det A| = ${fmt(Math.abs(det), 6)} ; orientation ${det > 0 ? 'conservée' : 'inversée (le F est retourné)'}.`,
    ];
    lines.forEach((t, i) => p.text(t, 24 * k, hgt - 44 * k + i * 22 * k, { color: i ? pal.muted : pal.text, size: (i ? 13 : 16) * k, weight: i ? 500 : 600, family: i ? undefined : MONO_FONT, baseline: 'middle', halo: pal.bg }));
  }
}
