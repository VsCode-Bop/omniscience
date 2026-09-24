/**
 * Symboles normalisés (IEC 60617, usage des programmes français) dessinés via Painter.
 * Chaque composant est dessiné dans son repère local : s le long de a→b, t perpendiculaire.
 */
import { disc, line, type Painter, type StrokeStyle } from '../../../core/graphics/painter';
import { LED_COLORS } from '../model/catalog';
import type { ElementData } from '../model/types';

/** Taille d'un pas de grille (unités de dessin). */
export const GRID = 20;

export interface Geometry {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  len: number;
  ux: number;
  uy: number;
  nx: number;
  ny: number;
}

export function geometry(el: ElementData): Geometry {
  const ax = el.x1 * GRID;
  const ay = el.y1 * GRID;
  const bx = el.x2 * GRID;
  const by = el.y2 * GRID;
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;
  return { ax, ay, bx, by, len, ux, uy, nx: -uy, ny: ux };
}

/** Point du repère local : s depuis a le long de l'axe, t sur la normale. */
export function at(g: Geometry, s: number, t = 0): [number, number] {
  return [g.ax + g.ux * s + g.nx * t, g.ay + g.uy * s + g.ny * t];
}

/** Longueur du corps du symbole (hors pattes de connexion). */
export function bodyLength(el: ElementData): number {
  switch (el.type) {
    case 'wire':
      return 0;
    case 'ground':
      return 0;
    case 'capacitor':
    case 'battery':
      return 10;
    case 'resistor':
    case 'inductor':
      return 40;
    case 'switch':
      return 30;
    case 'diode':
    case 'led':
      return 18;
    default:
      return 30; // symboles circulaires (r = 15)
  }
}

export interface SymbolStyle {
  stroke: string;
  fill: string;
  bg: string;
  text: string;
  width: number;
  /** Éclairement 0..∞ (lampes, DEL). */
  glow: number;
  glowColor: string;
  burnt: boolean;
  /** Moteur : angle du rotor. */
  angle: number;
  /** Couleurs des deux pattes (potentiels) ; par défaut `stroke`. */
  leadA?: string;
  leadB?: string;
}

function seg(p: Painter, g: Geometry, s0: number, t0: number, s1: number, t1: number, st: StrokeStyle): void {
  const [x0, y0] = at(g, s0, t0);
  const [x1, y1] = at(g, s1, t1);
  line(p, x0, y0, x1, y1, st);
}

function poly(p: Painter, g: Geometry, pts: [number, number][], close = true): void {
  p.beginPath();
  pts.forEach(([s, t], i) => {
    const [x, y] = at(g, s, t);
    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  });
  if (close) p.closePath();
}

function textAt(p: Painter, g: Geometry, s: number, t: number, str: string, size: number, color: string, weight: 'normal' | 'bold' = 'bold'): void {
  const [x, y] = at(g, s, t);
  p.text(str, x, y, { color, size, weight, align: 'center', baseline: 'middle' });
}

/** Dessine le composant (pattes + corps). */
export function drawSymbol(p: Painter, el: ElementData, st: SymbolStyle): void {
  const g = geometry(el);
  const w = st.width;
  const base: StrokeStyle = { color: st.stroke, width: w };
  const L = g.len;
  const c = L / 2;
  const body = Math.min(bodyLength(el), L - 4);
  const s0 = c - body / 2;
  const s1 = c + body / 2;

  if (el.type === 'ground') {
    const x = g.ax;
    const y = g.ay;
    line(p, x, y, x, y + 12, { ...base, color: st.leadA ?? st.stroke });
    for (const [dy, half] of [[12, 11], [17, 7], [22, 3]] as const) line(p, x - half, y + dy, x + half, y + dy, base);
    return;
  }
  if (el.type === 'wire') {
    if (st.leadA && st.leadB && st.leadA !== st.leadB) {
      seg(p, g, 0, 0, c, 0, { ...base, color: st.leadA });
      seg(p, g, c, 0, L, 0, { ...base, color: st.leadB });
    } else {
      seg(p, g, 0, 0, L, 0, { ...base, color: st.leadA ?? st.stroke });
    }
    return;
  }

  // Pattes de connexion
  seg(p, g, 0, 0, s0, 0, { ...base, color: st.leadA ?? st.stroke });
  seg(p, g, s1, 0, L, 0, { ...base, color: st.leadB ?? st.stroke });
  const k = body / bodyLength(el); // réduction si le composant est très court

  switch (el.type) {
    case 'resistor': {
      poly(p, g, [[s0, -7 * k], [s1, -7 * k], [s1, 7 * k], [s0, 7 * k]]);
      p.fill(st.fill);
      p.stroke(base);
      break;
    }
    case 'lamp':
    case 'motor':
    case 'ammeter':
    case 'voltmeter':
    case 'acsource':
    case 'isource': {
      const r = 15 * k;
      const [cx, cy] = at(g, c);
      const lit = el.type === 'lamp' && st.glow > 0.02 && !st.burnt;
      const a = Math.min(1, st.glow);
      if (lit) {
        // Halo proportionnel à la puissance reçue (P / P nominale).
        p.beginPath();
        p.arc(cx, cy, r + 16 * a, 0, Math.PI * 2);
        p.fill(st.glowColor, 0.18 * a);
        p.beginPath();
        p.arc(cx, cy, r + 7 * a, 0, Math.PI * 2);
        p.fill(st.glowColor, 0.3 * a);
      }
      p.beginPath();
      p.arc(cx, cy, r, 0, Math.PI * 2);
      p.closePath();
      p.fill(st.burnt ? '#44403c' : st.fill);
      if (lit) p.fill(st.glowColor, 0.25 + 0.75 * a);
      p.stroke(base);
      if (el.type === 'lamp') {
        const d = r * 0.7071;
        const cross: StrokeStyle = { color: st.burnt ? '#a8a29e' : st.stroke, width: w };
        line(p, cx - d, cy - d, cx + d, cy + d, cross);
        line(p, cx - d, cy + d, cx + d, cy - d, cross);
      } else if (el.type === 'motor') {
        textAt(p, g, c, 0, 'M', 15 * k, st.text);
        const [ox, oy] = [cx + Math.cos(st.angle) * (r - 4), cy + Math.sin(st.angle) * (r - 4)];
        disc(p, ox, oy, 2.2, st.stroke);
      } else if (el.type === 'ammeter' || el.type === 'voltmeter') {
        textAt(p, g, c, 0, el.type === 'ammeter' ? 'A' : 'V', 15 * k, st.text);
        textAt(p, g, s0 - 7, -9, '+', 11, st.stroke);
        textAt(p, g, s1 + 11, -9, 'COM', 7, st.stroke, 'normal');
      } else if (el.type === 'acsource') {
        p.beginPath();
        for (let i = 0; i <= 24; i++) {
          const s = c - 9 * k + (18 * k * i) / 24;
          const [x, y] = at(g, s, -6 * k * Math.sin((Math.PI * 2 * i) / 24));
          if (i === 0) p.moveTo(x, y);
          else p.lineTo(x, y);
        }
        p.stroke({ ...base, width: w * 0.9 });
      } else {
        seg(p, g, c - 9 * k, 0, c + 7 * k, 0, base);
        poly(p, g, [[c + 9 * k, 0], [c + 3 * k, -5 * k], [c + 3 * k, 5 * k]]);
        p.fill(st.stroke);
      }
      break;
    }
    case 'capacitor': {
      const h = 14 * Math.max(k, 0.6);
      seg(p, g, s0, -h, s0, h, { ...base, width: w * 1.3, cap: 'butt' });
      seg(p, g, s1, -h, s1, h, { ...base, width: w * 1.3, cap: 'butt' });
      break;
    }
    case 'battery': {
      // Petit trait épais : borne − (côté a) ; grand trait fin : borne + (côté b).
      seg(p, g, s0, -7, s0, 7, { ...base, width: w * 2.4, cap: 'butt' });
      seg(p, g, s1, -15, s1, 15, { ...base, cap: 'butt' });
      textAt(p, g, s1 + 8, -14, '+', 13, st.stroke);
      textAt(p, g, s0 - 8, -14, '−', 13, st.stroke);
      break;
    }
    case 'inductor': {
      const turns = 4;
      const r = body / (2 * turns);
      const angle = Math.atan2(g.uy, g.ux);
      p.beginPath();
      for (let i = 0; i < turns; i++) {
        const [cx, cy] = at(g, s0 + r * (2 * i + 1), 0);
        p.arc(cx, cy, r, angle + Math.PI, angle, false);
      }
      p.stroke(base);
      break;
    }
    case 'diode':
    case 'led': {
      const h = 9 * Math.max(k, 0.6);
      const burnt = st.burnt;
      if (el.type === 'led' && st.glow > 0.02 && !burnt) {
        const [cx, cy] = at(g, c);
        const a = Math.min(1, st.glow);
        p.beginPath();
        p.arc(cx, cy, 14 + 10 * a, 0, Math.PI * 2);
        p.fill(st.glowColor, 0.35 * a);
      }
      poly(p, g, [[s0, -h], [s0, h], [s1, 0]]);
      const lit = el.type === 'led' && st.glow > 0.02 && !burnt;
      p.fill(burnt ? '#44403c' : lit ? st.glowColor : el.type === 'led' ? st.fill : st.stroke);
      p.stroke(base);
      seg(p, g, s1, -h, s1, h, base);
      if (el.type === 'led') {
        for (const off of [-2, 5]) {
          const [x0, y0] = at(g, c + off, -h - 3);
          const [x1, y1] = at(g, c + off + 6, -h - 11);
          line(p, x0, y0, x1, y1, { ...base, width: w * 0.8 });
          const hx = x1 - x0;
          const hy = y1 - y0;
          const n = Math.hypot(hx, hy);
          const [ex, ey] = [hx / n, hy / n];
          p.beginPath();
          p.moveTo(x1, y1);
          p.lineTo(x1 - ex * 5 - ey * 3, y1 - ey * 5 + ex * 3);
          p.lineTo(x1 - ex * 5 + ey * 3, y1 - ey * 5 - ex * 3);
          p.closePath();
          p.fill(st.stroke);
        }
      }
      break;
    }
    case 'switch': {
      const closed = el.props.closed === true;
      const [pax, pay] = at(g, s0);
      const [pbx, pby] = at(g, s1);
      if (closed) seg(p, g, s0, 0, s1, 0, base);
      else seg(p, g, s0, 0, s1 - 2, -13, base);
      disc(p, pax, pay, 2.8, st.stroke);
      disc(p, pbx, pby, 2.8, st.bg, base);
      break;
    }
  }

  if (st.burnt) {
    const [cx, cy] = at(g, c);
    const cross: StrokeStyle = { color: '#dc2626', width: 3 };
    line(p, cx - 9, cy - 9, cx + 9, cy + 9, cross);
    line(p, cx - 9, cy + 9, cx + 9, cy - 9, cross);
  }
}

/** Couleur d'éclairage d'une DEL. */
export function ledColor(el: ElementData): string {
  return LED_COLORS[String(el.props.color)]?.color ?? '#ef4444';
}

/** Distance (unités de dessin) d'un point au segment du composant. */
export function distanceToElement(el: ElementData, x: number, y: number): number {
  const g = geometry(el);
  if (el.type === 'ground') return Math.hypot(x - g.ax, y - (g.ay + 12));
  const t = Math.max(0, Math.min(g.len, (x - g.ax) * g.ux + (y - g.ay) * g.uy));
  const [px, py] = at(g, t);
  return Math.hypot(x - px, y - py);
}
