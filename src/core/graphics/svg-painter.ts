import { DEFAULT_FONT, type Painter, type StrokeStyle, type TextStyle } from './painter';

const TAU = Math.PI * 2;
const n = (v: number) => (Math.round(v * 100) / 100).toString();

/**
 * Couleurs CSS modernes (« rgb(24 24 27 / 16%) ») → « rgb(24,24,27) » + opacité séparée :
 * Inkscape, les visionneuses SVG anciennes et svg2pdf (export PDF) ne lisent pas la syntaxe récente.
 */
export function splitColor(c: string): { color: string; alpha: number } {
  const s = c.trim();
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)(%?))?\s*\)$/i.exec(s);
  if (m) {
    const alpha = m[4] === undefined ? 1 : m[5] ? Number(m[4]) / 100 : Number(m[4]);
    return { color: `rgb(${Math.round(+m[1])},${Math.round(+m[2])},${Math.round(+m[3])})`, alpha };
  }
  const hex8 = /^#([\da-f]{6})([\da-f]{2})$/i.exec(s);
  if (hex8) return { color: `#${hex8[1]}`, alpha: parseInt(hex8[2], 16) / 255 };
  return { color: s, alpha: 1 };
}

const opacity = (attr: string, a: number) => (a < 0.999 ? ` ${attr}="${Math.round(a * 1000) / 1000}"` : '');

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
    const { color, alpha } = splitColor(style.color);
    this.parts.push(
      `<path d="${this.d}" fill="none" stroke="${color}" stroke-width="${n(style.width)}" stroke-linecap="${style.cap ?? 'round'}" stroke-linejoin="${style.join ?? 'round'}"${dash}${opacity('stroke-opacity', alpha * (style.alpha ?? 1))}/>`,
    );
  }

  fill(fillColor: string, fillAlpha = 1): void {
    if (!this.d) return;
    const { color, alpha } = splitColor(fillColor);
    this.parts.push(`<path d="${this.d}" fill="${color}"${opacity('fill-opacity', alpha * fillAlpha)} stroke="none"/>`);
  }

  text(str: string, x: number, y: number, style: TextStyle): void {
    const anchor = style.align === 'center' ? 'middle' : style.align === 'right' ? 'end' : 'start';
    const baseline =
      style.baseline === 'top' ? 'hanging' : style.baseline === 'middle' ? 'central' : style.baseline === 'bottom' ? 'text-after-edge' : 'alphabetic';
    const attrs = `x="${n(x)}" y="${n(y)}" font-family='${style.family ?? DEFAULT_FONT}' font-size="${n(style.size)}" font-weight="${style.weight ?? 'normal'}"${style.italic ? ' font-style="italic"' : ''} text-anchor="${anchor}" dominant-baseline="${baseline}"`;
    const content = escapeXml(str);
    if (style.halo) {
      const halo = splitColor(style.halo);
      this.parts.push(
        `<text ${attrs} fill="${halo.color}" stroke="${halo.color}" stroke-width="${n(Math.max(2, style.size / 4))}" stroke-linejoin="round"${opacity('opacity', halo.alpha)}>${content}</text>`,
      );
    }
    const fill = splitColor(style.color);
    this.parts.push(`<text ${attrs} fill="${fill.color}"${opacity('fill-opacity', fill.alpha)}>${content}</text>`);
  }

  /** Document SVG complet. viewBox = [x, y, w, h] en unités de dessin. */
  toSVG(width: number, height: number, background: string | null, viewBox: [number, number, number, number] = [0, 0, width, height]): string {
    const [vx, vy, vw, vh] = viewBox;
    const bg = background ? `<rect x="${n(vx)}" y="${n(vy)}" width="${n(vw)}" height="${n(vh)}" fill="${splitColor(background).color}"/>` : '';
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" viewBox="${vx} ${vy} ${vw} ${vh}">` +
      bg +
      this.parts.join('') +
      '</svg>'
    );
  }
}
