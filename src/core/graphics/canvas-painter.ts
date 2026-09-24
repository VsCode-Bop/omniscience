import { DEFAULT_FONT, type Painter, type StrokeStyle, type TextStyle } from './painter';

export class CanvasPainter implements Painter {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  beginPath(): void {
    this.ctx.beginPath();
  }
  moveTo(x: number, y: number): void {
    this.ctx.moveTo(x, y);
  }
  lineTo(x: number, y: number): void {
    this.ctx.lineTo(x, y);
  }
  arc(cx: number, cy: number, r: number, start: number, end: number, ccw = false): void {
    this.ctx.arc(cx, cy, r, start, end, ccw);
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.ctx.rect(x, y, w, h);
  }
  closePath(): void {
    this.ctx.closePath();
  }

  stroke(style: StrokeStyle): void {
    const { ctx } = this;
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width;
    ctx.lineCap = style.cap ?? 'round';
    ctx.lineJoin = style.join ?? 'round';
    ctx.setLineDash(style.dash ?? []);
    ctx.globalAlpha = style.alpha ?? 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  fill(color: string, alpha = 1): void {
    this.ctx.fillStyle = color;
    this.ctx.globalAlpha = alpha;
    this.ctx.fill();
    this.ctx.globalAlpha = 1;
  }

  text(str: string, x: number, y: number, style: TextStyle): void {
    const { ctx } = this;
    ctx.font = `${style.italic ? 'italic ' : ''}${style.weight ?? 'normal'} ${style.size}px ${style.family ?? DEFAULT_FONT}`;
    ctx.textAlign = style.align ?? 'left';
    ctx.textBaseline = style.baseline ?? 'alphabetic';
    if (style.halo) {
      ctx.strokeStyle = style.halo;
      ctx.lineWidth = Math.max(2, style.size / 4);
      ctx.lineJoin = 'round';
      ctx.setLineDash([]);
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = style.color;
    ctx.fillText(str, x, y);
  }
}

/**
 * Prépare un canvas « net » sur écrans haute densité : taille CSS en px logiques,
 * tampon interne multiplié par devicePixelRatio.
 */
export function fitCanvas(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number): CanvasRenderingContext2D {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = Math.max(1, Math.round(cssWidth * dpr));
  const h = Math.max(1, Math.round(cssHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
