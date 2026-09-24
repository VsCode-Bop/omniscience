/** Fenêtre d'affichage : conversion repère mathématique ↔ pixels (y vers le haut). */
export class Viewport {
  constructor(
    public xmin: number,
    public xmax: number,
    public ymin: number,
    public ymax: number,
    public width = 800,
    public height = 600,
  ) {}

  get scaleX(): number {
    return this.width / (this.xmax - this.xmin);
  }
  get scaleY(): number {
    return this.height / (this.ymax - this.ymin);
  }

  xToPx(x: number): number {
    return ((x - this.xmin) / (this.xmax - this.xmin)) * this.width;
  }
  yToPx(y: number): number {
    return this.height - ((y - this.ymin) / (this.ymax - this.ymin)) * this.height;
  }
  pxToX(px: number): number {
    return this.xmin + (px / this.width) * (this.xmax - this.xmin);
  }
  pxToY(py: number): number {
    return this.ymin + ((this.height - py) / this.height) * (this.ymax - this.ymin);
  }

  pan(dxPx: number, dyPx: number): void {
    const dx = dxPx / this.scaleX;
    const dy = dyPx / this.scaleY;
    this.xmin -= dx;
    this.xmax -= dx;
    this.ymin += dy;
    this.ymax += dy;
  }

  /** Zoom centré sur un pixel (facteur > 1 : on s'approche). */
  zoomAt(px: number, py: number, factor: number, factorY = factor): void {
    const x = this.pxToX(px);
    const y = this.pxToY(py);
    const clampSpan = (span: number) => Math.min(Math.max(span, 1e-9), 1e9);
    const w = clampSpan((this.xmax - this.xmin) / factor);
    const hgt = clampSpan((this.ymax - this.ymin) / factorY);
    const fx = px / this.width;
    const fy = (this.height - py) / this.height;
    this.xmin = x - fx * w;
    this.xmax = this.xmin + w;
    this.ymin = y - fy * hgt;
    this.ymax = this.ymin + hgt;
  }

  /** Ajuste l'intervalle en y (autour de son centre) pour un repère orthonormé. */
  makeOrthonormal(): void {
    const cy = (this.ymin + this.ymax) / 2;
    const half = ((this.xmax - this.xmin) * this.height) / this.width / 2;
    this.ymin = cy - half;
    this.ymax = cy + half;
  }

  /** Redimensionne en conservant le centre et l'échelle (pixels par unité). */
  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    const cx = (this.xmin + this.xmax) / 2;
    const cy = (this.ymin + this.ymax) / 2;
    const sx = this.scaleX;
    const sy = this.scaleY;
    this.width = width;
    this.height = height;
    this.xmin = cx - width / sx / 2;
    this.xmax = cx + width / sx / 2;
    this.ymin = cy - height / sy / 2;
    this.ymax = cy + height / sy / 2;
  }

  set(xmin: number, xmax: number, ymin: number, ymax: number): void {
    Object.assign(this, { xmin, xmax, ymin, ymax });
  }

  bounds(): [number, number, number, number] {
    return [this.xmin, this.xmax, this.ymin, this.ymax];
  }

  isVisible(x: number, y: number, marginPx = 0): boolean {
    const px = this.xToPx(x);
    const py = this.yToPx(y);
    return px >= -marginPx && px <= this.width + marginPx && py >= -marginPx && py <= this.height + marginPx;
  }
}
