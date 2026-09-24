/**
 * Abstraction de dessin 2D minimale.
 *
 * Les modules décrivent leur scène une seule fois via cette interface ; elle est
 * rendue soit dans un <canvas> (affichage temps réel), soit en SVG (export vectoriel,
 * puis PDF). Ainsi l'export est toujours fidèle à l'écran.
 */

export interface StrokeStyle {
  color: string;
  width: number;
  dash?: number[];
  cap?: 'butt' | 'round' | 'square';
  join?: 'miter' | 'round' | 'bevel';
  alpha?: number;
}

export interface TextStyle {
  color: string;
  size: number;
  weight?: 'normal' | 'bold' | number;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  baseline?: 'top' | 'middle' | 'bottom' | 'alphabetic';
  /** Contour de lisibilité (couleur de fond) autour du texte. */
  halo?: string;
  family?: string;
}

export interface Painter {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  /** Arc à la manière de CanvasRenderingContext2D.arc (angles en radians, y vers le bas). */
  arc(cx: number, cy: number, r: number, start: number, end: number, ccw?: boolean): void;
  rect(x: number, y: number, w: number, h: number): void;
  closePath(): void;
  stroke(style: StrokeStyle): void;
  fill(color: string, alpha?: number): void;
  text(str: string, x: number, y: number, style: TextStyle): void;
}

export const DEFAULT_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Raccourci : segment isolé. */
export function line(p: Painter, x1: number, y1: number, x2: number, y2: number, style: StrokeStyle): void {
  p.beginPath();
  p.moveTo(x1, y1);
  p.lineTo(x2, y2);
  p.stroke(style);
}

/** Raccourci : disque plein (et contour optionnel). */
export function disc(p: Painter, cx: number, cy: number, r: number, fill: string, stroke?: StrokeStyle): void {
  p.beginPath();
  p.arc(cx, cy, r, 0, Math.PI * 2);
  p.closePath();
  p.fill(fill);
  if (stroke) p.stroke(stroke);
}
