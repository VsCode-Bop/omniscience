/** Scène du simulateur : grille, composants, courants animés, bornes et étiquettes. */
import { cssVar } from '../../../core/dom';
import { disc, line, type Painter } from '../../../core/graphics/painter';
import { fmtSI } from '../../../core/math/format';
import { CATALOG } from '../model/catalog';
import type { CircuitOptions, ElementData } from '../model/types';
import type { ElementState } from '../solver/simulator';
import { at, bodyLength, drawSymbol, geometry, GRID, ledColor, type SymbolStyle } from './symbols';

export interface CircuitPalette {
  bg: string;
  grid: string;
  wire: string;
  component: string;
  fill: string;
  text: string;
  muted: string;
  accent: string;
  danger: string;
  conv: string;
  electron: string;
  potLow: string;
  potHigh: string;
  lampGlow: string;
  surface: string;
  border: string;
}

export function readCircuitPalette(): CircuitPalette {
  return {
    bg: cssVar('--canvas-bg'),
    grid: cssVar('--grid-major'),
    wire: cssVar('--wire'),
    component: cssVar('--component'),
    fill: cssVar('--canvas-bg'),
    text: cssVar('--canvas-text'),
    muted: cssVar('--canvas-muted'),
    accent: cssVar('--accent'),
    danger: cssVar('--danger'),
    conv: cssVar('--conv-arrow'),
    electron: cssVar('--electron'),
    potLow: cssVar('--pot-low'),
    potHigh: cssVar('--pot-high'),
    lampGlow: cssVar('--lamp-glow'),
    surface: cssVar('--surface'),
    border: cssVar('--border'),
  };
}

export interface SceneInput {
  elements: ElementData[];
  states: Map<string, ElementState>;
  opts: CircuitOptions;
  labels: Map<string, string>;
  selectedId: string | null;
  hoverId: string | null;
  /** Composants signalés (court-circuit…), affichés en rouge. */
  flagged: ReadonlySet<string>;
  /** Décalage d'animation du courant le long de chaque composant (unités de dessin). */
  phases: Map<string, number>;
  angles: Map<string, number>;
  pointVoltage: (x: number, y: number) => number | undefined;
  /** Rectangle visible (unités de dessin) pour la grille ; null : pas de grille. */
  view: { x0: number; y0: number; x1: number; y1: number } | null;
  preview: ElementData | null;
  hoverPoint: { x: number; y: number } | null;
  /** Facteur d'épaisseur (mode présentation). */
  scale: number;
}

const ARROW_SPACING = 44;
const ELECTRON_SPACING = 16;

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [128, 128, 128];
}

function mix(c1: string, c2: string, t: number): string {
  const a = hexToRgb(c1);
  const b = hexToRgb(c2);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * Math.min(1, Math.max(0, t))));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** Portions du composant où l'on dessine le courant (les pattes, pas le corps du symbole). */
function currentPath(el: ElementData, len: number): [number, number][] {
  if (el.type === 'wire') return [[0, len]];
  if (el.type === 'ground') return [];
  const body = Math.min(bodyLength(el), len - 4);
  const s0 = (len - body) / 2;
  return [[0, s0], [s0 + body, len]];
}

/**
 * Seuil d'affichage du courant : en dessous de 100 nA (courant de fuite d'une diode
 * bloquée…), le courant est physiquement négligeable et n'est pas représenté.
 */
export const CURRENT_THRESHOLD = 1e-7;

/** Intensité affichée : les courants résiduels (< 1 nA, dus à la stabilisation numérique) valent 0. */
export function shownCurrent(i: number): number {
  return Math.abs(i) < 1e-9 ? 0 : i;
}

export function currentVisible(el: ElementData, st: ElementState | undefined): boolean {
  return !!st && Math.abs(st.i) > CURRENT_THRESHOLD && el.type !== 'voltmeter' && el.type !== 'ground';
}

export function drawCircuit(p: Painter, s: SceneInput, pal: CircuitPalette): void {
  const k = s.scale;

  // Grille
  if (s.view) {
    const { x0, y0, x1, y1 } = s.view;
    p.beginPath();
    for (let x = Math.floor(x0 / GRID) * GRID; x <= x1; x += GRID) {
      for (let y = Math.floor(y0 / GRID) * GRID; y <= y1; y += GRID) p.rect(x - 0.9, y - 0.9, 1.8, 1.8);
    }
    p.fill(pal.grid);
  }

  // Plage de potentiels (coloration optionnelle)
  let vmin = Infinity;
  let vmax = -Infinity;
  if (s.opts.potentials) {
    for (const el of s.elements) {
      for (const [x, y] of [[el.x1, el.y1], [el.x2, el.y2]]) {
        const v = s.pointVoltage(x, y);
        if (v !== undefined && Number.isFinite(v)) {
          vmin = Math.min(vmin, v);
          vmax = Math.max(vmax, v);
        }
      }
    }
  }
  const potColor = (x: number, y: number): string | undefined => {
    if (!s.opts.potentials || !(vmax > vmin)) return undefined;
    const v = s.pointVoltage(x, y);
    return v === undefined ? undefined : mix(pal.potLow, pal.potHigh, (v - vmin) / (vmax - vmin));
  };

  // Halo de sélection / survol
  for (const el of s.elements) {
    if (el.id !== s.selectedId && el.id !== s.hoverId) continue;
    const g = geometry(el);
    const selected = el.id === s.selectedId;
    if (el.type === 'ground') disc(p, g.ax, g.ay + 12, 18, pal.accent);
    else line(p, g.ax, g.ay, g.bx, g.by, { color: pal.accent, width: (selected ? 22 : 16) * k, alpha: selected ? 0.22 : 0.1 });
  }

  // Composants
  for (const el of s.elements) {
    const st = s.states.get(el.id);
    const flagged = s.flagged.has(el.id);
    const isWire = el.type === 'wire';
    const style: SymbolStyle = {
      stroke: flagged ? pal.danger : isWire ? pal.wire : pal.component,
      fill: pal.fill,
      bg: pal.bg,
      text: flagged ? pal.danger : pal.text,
      width: (isWire ? 2.4 : 2.2) * k,
      glow: st?.glow ?? 0,
      glowColor: el.type === 'led' ? ledColor(el) : pal.lampGlow,
      burnt: st?.burnt ?? false,
      angle: s.angles.get(el.id) ?? 0,
      leadA: flagged ? undefined : potColor(el.x1, el.y1),
      leadB: flagged ? undefined : potColor(el.x2, el.y2),
    };
    drawSymbol(p, el, style);
  }

  // Courant : flèches rouges (sens conventionnel) et électrons (sens réel, opposé)
  const showConv = s.opts.current === 'conventional' || s.opts.current === 'both';
  const showElec = s.opts.current === 'electrons' || s.opts.current === 'both';
  if (showConv || showElec) {
    for (const el of s.elements) {
      const st = s.states.get(el.id);
      if (!currentVisible(el, st)) continue;
      const g = geometry(el);
      const path = currentPath(el, g.len);
      const phase = s.phases.get(el.id) ?? 0;
      const dir = Math.sign(st!.i);
      const inPath = (pos: number, margin: number) => path.some(([a, b]) => pos >= a + margin && pos <= b - margin);
      if (showElec) {
        const off = (((-phase) % ELECTRON_SPACING) + ELECTRON_SPACING) % ELECTRON_SPACING;
        p.beginPath();
        for (let pos = off; pos <= g.len; pos += ELECTRON_SPACING) {
          if (!inPath(pos, 2)) continue;
          const [x, y] = at(g, pos);
          p.moveTo(x + 3.2 * k, y);
          p.arc(x, y, 3.2 * k, 0, Math.PI * 2);
        }
        p.fill(pal.electron);
      }
      if (showConv) {
        const off = ((phase % ARROW_SPACING) + ARROW_SPACING) % ARROW_SPACING;
        p.beginPath();
        for (let pos = off; pos <= g.len; pos += ARROW_SPACING) {
          if (!inPath(pos, 6)) continue;
          const h = 6 * k;
          const [tx, ty] = at(g, pos + dir * h);
          const [lx, ly] = at(g, pos - dir * h, -h);
          const [rx, ry] = at(g, pos - dir * h, h);
          p.moveTo(lx, ly);
          p.lineTo(tx, ty);
          p.lineTo(rx, ry);
        }
        p.stroke({ color: pal.conv, width: 2.6 * k });
      }
    }
  }

  // Bornes : points de jonction (≥ 3) et bornes libres (1)
  const counts = new Map<string, { x: number; y: number; n: number }>();
  for (const el of s.elements) {
    const pts = el.type === 'ground' ? [[el.x1, el.y1]] : [[el.x1, el.y1], [el.x2, el.y2]];
    for (const [x, y] of pts) {
      const key = `${x},${y}`;
      const c = counts.get(key) ?? { x, y, n: 0 };
      c.n++;
      counts.set(key, c);
    }
  }
  for (const { x, y, n } of counts.values()) {
    const px = x * GRID;
    const py = y * GRID;
    if (n >= 3) disc(p, px, py, 4 * k, pal.wire);
    else if (n === 1) disc(p, px, py, 3.6 * k, pal.bg, { color: pal.muted, width: 1.6 * k });
  }
  if (s.hoverPoint) {
    p.beginPath();
    p.arc(s.hoverPoint.x * GRID, s.hoverPoint.y * GRID, 8 * k, 0, Math.PI * 2);
    p.stroke({ color: pal.accent, width: 2 * k });
  }

  // Étiquettes et afficheurs
  for (const el of s.elements) {
    if (el.type === 'wire' || el.type === 'ground') continue;
    drawLabels(p, el, s, pal);
  }

  if (s.preview) {
    drawSymbol(p, s.preview, {
      stroke: pal.accent, fill: pal.fill, bg: pal.bg, text: pal.accent, width: 2.2 * k,
      glow: 0, glowColor: pal.lampGlow, burnt: false, angle: 0,
    });
  }
}

function drawLabels(p: Painter, el: ElementData, s: SceneInput, pal: CircuitPalette): void {
  const g = geometry(el);
  const k = s.scale;
  const [cx, cy] = at(g, g.len / 2);
  const vertical = Math.abs(g.uy) > Math.abs(g.ux);
  // Côté « étiquette » : au-dessus (horizontal) ou à droite (vertical) ; mesures de l'autre côté.
  const [sx, sy] = vertical ? [1, 0] : [0, -1];
  const d = 26 * k;
  const st = s.states.get(el.id);
  const meter = el.type === 'ammeter' || el.type === 'voltmeter';

  const name = s.labels.get(el.id) ?? '';
  const spec = CATALOG[el.type];
  const value = s.opts.values && spec.valueLabel ? spec.valueLabel(el.props) : '';
  const labelText = [name, value].filter(Boolean).join('  ');
  if (labelText && !meter) {
    p.text(labelText, cx + sx * d, cy + sy * d, {
      color: pal.text, size: 12 * k, weight: 'bold', halo: pal.bg,
      align: vertical ? 'left' : 'center', baseline: vertical ? 'middle' : 'bottom',
    });
  }

  if (meter && st) {
    const reading = el.type === 'ammeter' ? fmtSI(shownCurrent(st.i), 'A') : Number.isNaN(st.v) ? '— V' : fmtSI(st.v, 'V');
    const text = `${name}  ${reading}`;
    const w = (text.length * 7.4 + 14) * k;
    const h = 22 * k;
    const bx = vertical ? cx + sx * d : cx - w / 2;
    const by = vertical ? cy - h / 2 : cy + sy * d - h;
    p.beginPath();
    p.rect(bx, by, w, h);
    p.fill(pal.surface);
    p.stroke({ color: el.type === 'ammeter' ? pal.conv : pal.accent, width: 1.5 * k });
    p.text(text, bx + w / 2, by + h / 2 + 0.5, {
      color: pal.text, size: 12.5 * k, weight: 'bold', align: 'center', baseline: 'middle',
      family: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
    });
    return;
  }

  if (s.opts.measures && st && el.type !== 'switch') {
    const u = el.type === 'battery' || el.type === 'acsource' || el.type === 'isource' ? -st.v : st.v;
    const text = `${fmtSI(u, 'V')} · ${fmtSI(Math.abs(shownCurrent(st.i)), 'A')}`;
    p.text(text, cx - sx * d, cy - sy * d, {
      color: pal.muted, size: 11.5 * k, halo: pal.bg,
      align: vertical ? 'right' : 'center', baseline: vertical ? 'middle' : 'top',
    });
  }
}
