import { DEFAULT_FONT, type Painter, type StrokeStyle, type TextStyle } from './painter';

const TAU = Math.PI * 2;
const n = (v: number) => (Math.round(v * 100) / 100).toString();

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
}

/** Implémentation SVG du Painter : accumule des éléments puis produit un document autonome. */
export class SvgPainter implements Painter {
  private readonly parts: string[] = [];
  private d = '';
  private hasPoint = false;

  beginPath(): void {
    this.d = '';
    this.hasPoint = false;
  }
  moveTo(x: number, y: number): void {
    this.d += `M${n(x)} ${n(y)}`;
    this.hasPoint = true;
  }
  lineTo(x: number, y: number): void {
    this.d += `${this.hasPoint ? 'L' : 'M'}${n(x)} ${n(y)}`;
    this.hasPoint = true;
  }
  arc(cx: number, cy: number, r: number, start: number, end: number, ccw = false): void {
    let delta = ccw ? start - end : end - start;
    const sweep = ccw ? 0 : 1;
    const pt = (a: number) => `${n(cx + r * Math.cos(a))} ${n(cy + r * Math.sin(a))}`;
    this.d += `${this.hasPoint ? 'L' : 'M'}${pt(start)}`;
    if (delta >= TAU - 1e-9) {
      const mid = start + (ccw ? -Math.PI : Math.PI);
      this.d += `A${n(r)} ${n(r)} 0 1 ${sweep} ${pt(mid)}A${n(r)} ${n(r)} 0 1 ${sweep} ${pt(start)}`;
    } else {
      delta = ((delta % TAU) + TAU) % TAU;
      this.d += `A${n(r)} ${n(r)} 0 ${delta > Math.PI ? 1 : 0} ${sweep} ${pt(end)}`;
    }
    this.hasPoint = true;
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.d += `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z`;
    this.hasPoint = true;
  }
  closePath(): void {
    this.d += 'Z';
  }

  stroke(style: StrokeStyle): void {
    if (!this.d) return;
    const dash = style.dash?.length ? ` stroke-dasharray="${style.dash.map(n).join(' ')}"` : '';
    const alpha = style.alpha !== undefined && style.alpha < 1 ? ` stroke-opacity="${style.alpha}"` : '';
    this.parts.push(
      `<path d="${this.d}" fill="none" stroke="${style.color}" stroke-width="${n(style.width)}" stroke-linecap="${style.cap ?? 'round'}" stroke-linejoin="${style.join ?? 'round'}"${dash}${alpha}/>`,
    );
  }

  fill(color: string, alpha = 1): void {
    if (!this.d) return;
    this.parts.push(`<path d="${this.d}" fill="${color}"${alpha < 1 ? ` fill-opacity="${alpha}"` : ''} stroke="none"/>`);
  }

  text(str: string, x: number, y: number, style: TextStyle): void {
    const anchor = style.align === 'center' ? 'middle' : style.align === 'right' ? 'end' : 'start';
    const baseline =
      style.baseline === 'top' ? 'hanging' : style.baseline === 'middle' ? 'central' : style.baseline === 'bottom' ? 'text-after-edge' : 'alphabetic';
    const attrs = `x="${n(x)}" y="${n(y)}" font-family='${style.family ?? DEFAULT_FONT}' font-size="${n(style.size)}" font-weight="${style.weight ?? 'normal'}"${style.italic ? ' font-style="italic"' : ''} text-anchor="${anchor}" dominant-baseline="${baseline}"`;
    const content = escapeXml(str);
    if (style.halo) {
      this.parts.push(
        `<text ${attrs} fill="${style.halo}" stroke="${style.halo}" stroke-width="${n(Math.max(2, style.size / 4))}" stroke-linejoin="round">${content}</text>`,
      );
    }
    this.parts.push(`<text ${attrs} fill="${style.color}">${content}</text>`);
  }

  /** Document SVG complet. viewBox = [x, y, w, h] en unités de dessin. */
  toSVG(width: number, height: number, background: string | null, viewBox: [number, number, number, number] = [0, 0, width, height]): string {
    const [vx, vy, vw, vh] = viewBox;
    const bg = background ? `<rect x="${n(vx)}" y="${n(vy)}" width="${n(vw)}" height="${n(vh)}" fill="${background}"/>` : '';
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" viewBox="${vx} ${vy} ${vw} ${vh}">` +
      bg +
      this.parts.join('') +
      '</svg>'
    );
  }
}
