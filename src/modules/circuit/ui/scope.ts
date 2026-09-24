/**
 * Oscilloscope 2 voies (défilement continu) : tension ou intensité de n'importe quel
 * composant, calibres automatiques (1-2-5), lecture des extremums.
 */
import { h, svgIcon } from '../../../core/dom';
import { fitCanvas } from '../../../core/graphics/canvas-painter';
import { icon } from '../../../core/icons';
import { fmtSI } from '../../../core/math/format';
import { niceCeil } from '../../../core/math/numeric';
import type { ScopeChannel } from '../model/types';

const CAPACITY = 4096;
const COLORS = ['#facc15', '#22d3ee'];
const DIV_X = 10;
const DIV_Y = 8;

export interface ChannelInfo {
  channel: ScopeChannel;
  label: string;
}

export class Scope {
  readonly el: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly legend: HTMLElement;
  private readonly t = new Float64Array(CAPACITY);
  private readonly values = [new Float64Array(CAPACITY), new Float64Array(CAPACITY)];
  private head = 0;
  private count = 0;
  private lastT = -Infinity;
  /** Durée affichée (secondes simulées). */
  window = 0.04;

  constructor(private readonly onRemove: (index: number) => void) {
    this.canvas = h('canvas', { class: 'scope-canvas', 'aria-label': 'Écran de l\'oscilloscope' });
    this.legend = h('div', { class: 'scope-legend' });
    this.el = h('div', { class: 'scope', hidden: true },
      h('div', { class: 'scope-head' }, svgIcon(icon('scope')), h('strong', null, 'Oscilloscope'), this.legend),
      h('div', { class: 'scope-screen' }, this.canvas),
    );
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
    this.lastT = -Infinity;
  }

  /** Enregistre un échantillon (décimé pour garder ~2000 points par fenêtre). */
  record(t: number, v0: number, v1: number): void {
    if (t < this.lastT) this.clear();
    if (t - this.lastT < this.window / 2000) return;
    this.lastT = t;
    this.t[this.head] = t;
    this.values[0][this.head] = v0;
    this.values[1][this.head] = v1;
    this.head = (this.head + 1) % CAPACITY;
    this.count = Math.min(CAPACITY, this.count + 1);
  }

  setLegend(infos: (ChannelInfo | null)[]): void {
    this.legend.replaceChildren(
      ...infos.flatMap((info, i) =>
        info
          ? [h('span', { class: 'scope-chip', style: `--chip: ${COLORS[i]}` },
            `Voie ${i + 1} : ${info.channel.q === 'v' ? 'U' : 'I'}(${info.label})`,
            h('button', { class: 'scope-chip-x', title: 'Retirer la voie', 'aria-label': `Retirer la voie ${i + 1}`, onclick: () => this.onRemove(i) }, '×'),
          )]
          : [],
      ),
    );
    this.el.hidden = !infos.some(Boolean);
  }

  render(now: number, channels: (ScopeChannel | null)[]): void {
    if (this.el.hidden) return;
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    if (W < 10 || H < 10) return;
    const g = fitCanvas(this.canvas, W, H);
    g.fillStyle = '#04110b';
    g.fillRect(0, 0, W, H);

    // Graticule 10 × 8
    g.strokeStyle = 'rgba(74, 222, 128, 0.16)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < DIV_X; i++) {
      const x = Math.round((W * i) / DIV_X) + 0.5;
      g.moveTo(x, 0);
      g.lineTo(x, H);
    }
    for (let j = 1; j < DIV_Y; j++) {
      const y = Math.round((H * j) / DIV_Y) + 0.5;
      g.moveTo(0, y);
      g.lineTo(W, y);
    }
    g.stroke();
    g.strokeStyle = 'rgba(74, 222, 128, 0.35)';
    g.beginPath();
    g.moveTo(0, Math.round(H / 2) + 0.5);
    g.lineTo(W, Math.round(H / 2) + 0.5);
    g.stroke();

    const t0 = now - this.window;
    const info: [string, string][] = [];
    for (let c = 0; c < 2; c++) {
      const channel = channels[c];
      if (!channel) continue;
      // Calibre automatique : le signal occupe au plus ±3,8 divisions (sur ±4).
      let max = 0;
      let vmin = Infinity;
      let vmax = -Infinity;
      for (let n = 0; n < this.count; n++) {
        const idx = (this.head - 1 - n + CAPACITY) % CAPACITY;
        if (this.t[idx] < t0) break;
        const v = this.values[c][idx];
        if (!Number.isFinite(v)) continue;
        max = Math.max(max, Math.abs(v));
        vmin = Math.min(vmin, v);
        vmax = Math.max(vmax, v);
      }
      const perDiv = niceCeil(Math.max(max, 1e-9) / 3.8);
      const unit = perDiv;
      g.strokeStyle = COLORS[c];
      g.lineWidth = 2;
      g.lineJoin = 'round';
      g.beginPath();
      let started = false;
      for (let n = Math.min(this.count, CAPACITY) - 1; n >= 0; n--) {
        const idx = (this.head - 1 - n + CAPACITY) % CAPACITY;
        const t = this.t[idx];
        if (t < t0) continue;
        const v = this.values[c][idx];
        if (!Number.isFinite(v)) continue;
        const x = ((t - t0) / this.window) * W;
        const y = H / 2 - (v / unit) * (H / DIV_Y);
        if (!started) {
          g.moveTo(x, y);
          started = true;
        } else g.lineTo(x, y);
      }
      g.stroke();
      const q = channel.q === 'i' ? 'A' : 'V';
      if (Number.isFinite(vmin)) {
        info.push([COLORS[c], `Voie ${c + 1} : ${fmtSI(perDiv, q)}/div   max ${fmtSI(vmax, q)}   min ${fmtSI(vmin, q)}`]);
      }
    }
    g.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
    g.textBaseline = 'top';
    info.forEach(([color, text], i) => {
      g.fillStyle = color;
      g.fillText(text, 8, 6 + i * 15);
    });
    g.fillStyle = 'rgba(187, 247, 208, 0.8)';
    g.textAlign = 'right';
    g.fillText(`${fmtSI(this.window / DIV_X, 's')}/div`, W - 8, 6);
    g.textAlign = 'left';
  }
}
