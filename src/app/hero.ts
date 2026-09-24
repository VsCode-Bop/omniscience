/**
 * Aperçus animés de l'accueil : une courbe dont le paramètre varie avec sa tangente
 * mobile, et un circuit où circulent les électrons. Les dessins utilisent les mêmes
 * briques que les modules (Painter, symboles IEC du simulateur).
 */
import { cssVar, h } from '../core/dom';
import { CanvasPainter, fitCanvas } from '../core/graphics/canvas-painter';
import { disc, line, MATH_FONT, type Painter } from '../core/graphics/painter';
import { fmt } from '../core/math/format';
import type { ElementData } from '../modules/circuit/model/types';
import { drawSymbol, GRID } from '../modules/circuit/render/symbols';

interface Colors {
  bg: string;
  gridMinor: string;
  gridMajor: string;
  axis: string;
  text: string;
  curve: string;
  tangent: string;
  board: string;
  dot: string;
  wire: string;
  fill: string;
  electron: string;
  conv: string;
  glow: string;
}

function readColors(): Colors {
  return {
    bg: cssVar('--canvas-bg'),
    gridMinor: cssVar('--grid-minor'),
    gridMajor: cssVar('--grid-major'),
    axis: cssVar('--axis'),
    text: cssVar('--canvas-text'),
    curve: cssVar('--c1'),
    tangent: cssVar('--c2'),
    board: cssVar('--board'),
    dot: cssVar('--board-dot'),
    wire: cssVar('--wire'),
    fill: cssVar('--component-fill'),
    electron: cssVar('--electron'),
    conv: cssVar('--conv-arrow'),
    glow: cssVar('--lamp-glow'),
  };
}

// ─── Aperçu de la grapheuse ──────────────────────────────────────────────────

function drawGraph(p: Painter, w: number, hgt: number, t: number, c: Colors): { a: number } {
  const unit = w / 13;
  const ox = w * 0.46;
  const oy = hgt * 0.58;
  const X = (x: number) => ox + x * unit;
  const Y = (y: number) => oy - y * unit;
  p.beginPath();
  for (let x = Math.ceil(-ox / (unit / 2)); x * (unit / 2) < w - ox; x++) {
    p.moveTo(ox + (x * unit) / 2, 0);
    p.lineTo(ox + (x * unit) / 2, hgt);
  }
  for (let y = Math.ceil(-oy / (unit / 2)); y * (unit / 2) < hgt - oy; y++) {
    p.moveTo(0, oy + (y * unit) / 2);
    p.lineTo(w, oy + (y * unit) / 2);
  }
  p.stroke({ color: c.gridMinor, width: 1, cap: 'butt' });
  p.beginPath();
  for (let x = Math.ceil(-ox / unit); x * unit < w - ox; x++) {
    p.moveTo(ox + x * unit, 0);
    p.lineTo(ox + x * unit, hgt);
  }
  for (let y = Math.ceil(-oy / unit); y * unit < hgt - oy; y++) {
    p.moveTo(0, oy + y * unit);
    p.lineTo(w, oy + y * unit);
  }
  p.stroke({ color: c.gridMajor, width: 1, cap: 'butt' });
  line(p, 0, oy, w, oy, { color: c.axis, width: 1.4 });
  line(p, ox, 0, ox, hgt, { color: c.axis, width: 1.4 });

  const a = 1.25 + 0.75 * Math.sin(t * 0.7);
  const f = (x: number) => a * Math.sin(x) + x / 3;
  const df = (x: number) => a * Math.cos(x) + 1 / 3;
  p.beginPath();
  for (let px = 0; px <= w; px += 2) {
    const x = (px - ox) / unit;
    if (px === 0) p.moveTo(px, Y(f(x)));
    else p.lineTo(px, Y(f(x)));
  }
  p.stroke({ color: c.curve, width: 2.8 });

  const x0 = 2.6 * Math.sin(t * 0.45);
  const y0 = f(x0);
  const m = df(x0);
  const span = 3.2;
  line(p, X(x0 - span), Y(y0 - m * span), X(x0 + span), Y(y0 + m * span), { color: c.tangent, width: 1.8 });
  disc(p, X(x0), Y(y0), 5.5, c.tangent, { color: c.bg, width: 2.5 });
  const lx = X(4.75);
  const ly = Y(f(4.75)) - 18;
  p.text('C', lx, ly, { color: c.curve, size: 19, family: MATH_FONT, italic: true, halo: c.bg });
  p.text('f', lx + 13, ly + 5, { color: c.curve, size: 13, family: MATH_FONT, italic: true, halo: c.bg });
  return { a };
}

// ─── Aperçu du simulateur ────────────────────────────────────────────────────

const el = (id: string, type: ElementData['type'], x1: number, y1: number, x2: number, y2: number, props: ElementData['props'] = {}): ElementData => ({ id, type, x1, y1, x2, y2, props });

/** Boucle de 14 × 8 carreaux : pile à gauche, lampe en haut, résistance à droite. */
const LOOP: ElementData[] = [
  el('bat', 'battery', 0, 5, 0, 3),
  el('w1', 'wire', 0, 3, 0, 0),
  el('w2', 'wire', 0, 0, 5, 0),
  el('lamp', 'lamp', 5, 0, 9, 0),
  el('w3', 'wire', 9, 0, 14, 0),
  el('w4', 'wire', 14, 0, 14, 2),
  el('res', 'resistor', 14, 2, 14, 6),
  el('w5', 'wire', 14, 6, 14, 8),
  el('w6', 'wire', 14, 8, 0, 8),
  el('w7', 'wire', 0, 8, 0, 5),
];

/** Parcours du courant conventionnel (de la borne + à la borne −), en unités de dessin. */
const PATH: [number, number][] = [[0, 3], [0, 0], [14, 0], [14, 8], [0, 8], [0, 5]].map(([x, y]) => [x * GRID, y * GRID]);

function pointAlong(s: number): { x: number; y: number; dx: number; dy: number } | null {
  for (let i = 0; i < PATH.length - 1; i++) {
    const [x1, y1] = PATH[i];
    const [x2, y2] = PATH[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (s <= len) return { x: x1 + ((x2 - x1) * s) / len, y: y1 + ((y2 - y1) * s) / len, dx: (x2 - x1) / len, dy: (y2 - y1) / len };
    s -= len;
  }
  return null;
}
const PATH_LEN = PATH.slice(1).reduce((sum, [x, y], i) => sum + Math.hypot(x - PATH[i][0], y - PATH[i][1]), 0);

function drawCircuit(p: Painter, w: number, hgt: number, t: number, c: Colors): void {
  const scale = Math.min(w / (19 * GRID), hgt / (12.5 * GRID));
  const ox = (w - 14 * GRID * scale) / 2 + 14;
  const oy = (hgt - 8 * GRID * scale) / 2 - 6;
  const T = (x: number, y: number): [number, number] => [ox + x * scale, oy + y * scale];

  // Points de la grille
  p.beginPath();
  for (let x = ox % (GRID * scale); x < w; x += GRID * scale) {
    for (let y = oy % (GRID * scale); y < hgt; y += GRID * scale) p.rect(x - 0.8, y - 0.8, 1.6, 1.6);
  }
  p.fill(c.dot);

  // Composants : dessinés dans un Painter décalé/mis à l'échelle.
  const scaled: Painter = {
    beginPath: () => p.beginPath(),
    moveTo: (x, y) => p.moveTo(...T(x, y)),
    lineTo: (x, y) => p.lineTo(...T(x, y)),
    arc: (cx, cy, r, a0, a1, ccw) => p.arc(...T(cx, cy), r * scale, a0, a1, ccw),
    rect: (x, y, rw, rh) => p.rect(...T(x, y), rw * scale, rh * scale),
    closePath: () => p.closePath(),
    stroke: (s) => p.stroke({ ...s, width: s.width * scale }),
    fill: (col, a) => p.fill(col, a),
    text: (str, x, y, s) => p.text(str, ...T(x, y), { ...s, size: s.size * scale }),
  };
  const glow = 0.85 + 0.1 * Math.sin(t * 3);
  for (const e of LOOP) {
    drawSymbol(scaled, e, {
      stroke: c.wire, fill: c.fill, bg: c.board, text: c.text, width: 2.3,
      glow: e.type === 'lamp' ? glow : 0, glowColor: c.glow, burnt: false, angle: 0,
    });
  }

  // Électrons (sens réel : de − vers + à l'extérieur du générateur)
  const spacing = 18;
  const phase = (t * 38) % spacing;
  p.beginPath();
  for (let s = spacing - phase; s < PATH_LEN; s += spacing) {
    const pt = pointAlong(PATH_LEN - s);
    if (!pt) continue;
    const [x, y] = T(pt.x, pt.y);
    p.moveTo(x + 3.1, y);
    p.arc(x, y, 3.1, 0, Math.PI * 2);
  }
  p.fill(c.electron);

  // Flèches du sens conventionnel
  const arrowSpacing = 70;
  const aphase = (t * 38) % arrowSpacing;
  p.beginPath();
  for (let s = aphase; s < PATH_LEN; s += arrowSpacing) {
    const pt = pointAlong(s);
    if (!pt) continue;
    const [x, y] = T(pt.x, pt.y);
    const k = 5.5;
    p.moveTo(x - pt.dx * k - pt.dy * k, y - pt.dy * k + pt.dx * k);
    p.lineTo(x + pt.dx * k, y + pt.dy * k);
    p.lineTo(x - pt.dx * k + pt.dy * k, y - pt.dy * k - pt.dx * k);
  }
  p.stroke({ color: c.conv, width: 2.4 });
}

// ─── Montage ─────────────────────────────────────────────────────────────────

function windowCard(title: string, className: string, canvas: HTMLCanvasElement, ...overlay: Node[]): HTMLElement {
  return h('div', { class: `preview ${className}` },
    h('div', { class: 'preview-bar' },
      h('span', { class: 'preview-dots' }, h('i'), h('i'), h('i')),
      h('span', { class: 'preview-title' }, title),
    ),
    h('div', { class: 'preview-body' }, canvas, ...overlay),
  );
}

export function mountHero(container: HTMLElement): () => void {
  const graphCanvas = h('canvas', { 'aria-hidden': 'true' });
  const circuitCanvas = h('canvas', { 'aria-hidden': 'true' });
  const exprValue = h('span', { class: 'preview-expr-value' }, '1,25');
  const expr = h('div', { class: 'preview-expr' },
    h('span', { class: 'preview-swatch' }),
    h('span', { class: 'serif' }, h('i', null, 'f'), '(', h('i', null, 'x'), ') = ', h('i', null, 'a'), ' sin ', h('i', null, 'x'), ' + ', h('i', null, 'x'), '/3'),
    h('span', { class: 'preview-param' }, h('i', { class: 'serif' }, 'a'), ' = ', exprValue),
  );
  const meter = h('div', { class: 'preview-meter' }, h('span', null, 'I'), h('strong', null, '45,0 mA'));
  const graph = windowCard('Grapheuse', 'preview-graph', graphCanvas, expr);
  const circuit = windowCard('Simulateur de circuits', 'preview-circuit', circuitCanvas, meter);
  container.append(graph, circuit);

  let colors = readColors();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let frame = 0;
  const start = performance.now();

  const render = (now: number) => {
    const t = reduced ? 2 : (now - start) / 1000;
    for (const [canvas, draw] of [[graphCanvas, 'graph'], [circuitCanvas, 'circuit']] as const) {
      const w = canvas.clientWidth;
      const hh = canvas.clientHeight;
      if (w < 10 || hh < 10) continue;
      const g = fitCanvas(canvas, w, hh);
      g.fillStyle = draw === 'graph' ? colors.bg : colors.board;
      g.fillRect(0, 0, w, hh);
      const p = new CanvasPainter(g);
      if (draw === 'graph') exprValue.textContent = fmt(drawGraph(p, w, hh, t, colors).a, 3);
      else drawCircuit(p, w, hh, t, colors);
    }
    if (!reduced) frame = requestAnimationFrame(render);
  };
  const onTheme = () => {
    colors = readColors();
    if (reduced) render(performance.now());
  };
  window.addEventListener('omni:themechange', onTheme);
  const ro = new ResizeObserver(() => reduced && render(performance.now()));
  ro.observe(container);
  void document.fonts?.ready.then(() => reduced && render(performance.now()));
  frame = requestAnimationFrame(render);

  return () => {
    cancelAnimationFrame(frame);
    ro.disconnect();
    window.removeEventListener('omni:themechange', onTheme);
  };
}
