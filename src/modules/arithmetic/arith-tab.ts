/**
 * Onglet « Arithmétique » : décomposition en facteurs premiers (divisions successives
 * et arbre), PGCD par l'algorithme d'Euclide (avec pavage par des carrés et
 * coefficients de Bézout), crible d'Ératosthène animé.
 */
import { h, svgIcon } from '../../core/dom';
import { disc, line, MONO_FONT, type Painter } from '../../core/graphics/painter';
import { icon } from '../../core/icons';
import { html, section, segmented, statGrid } from '../../core/widgets';
import {
  divisorCount, divisors, divisorSum, euclidSteps, extendedEuclid, factorize, fmtBig, gcd, isPrime, lcm, parseBigInt, sieve,
} from './numbers';
import { power, row, text, type Box } from './typeset';

export interface ArithState {
  tool: 'factor' | 'gcd' | 'sieve';
  n: string;
  a: string;
  b: string;
  N: number;
}

export function defaultArith(): ArithState {
  return { tool: 'factor', n: '360', a: '84', b: '36', N: 100 };
}

export function sanitizeArith(raw: unknown): ArithState {
  const d = defaultArith();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<ArithState>;
  const str = (v: unknown, def: string) => (typeof v === 'string' && v.length <= 60 ? v : def);
  return {
    tool: r.tool === 'gcd' || r.tool === 'sieve' ? r.tool : 'factor',
    n: str(r.n, d.n),
    a: str(r.a, d.a),
    b: str(r.b, d.b),
    N: [100, 200, 300, 500].includes(r.N as number) ? (r.N as number) : 100,
  };
}

export interface ArithPalette {
  bg: string;
  text: string;
  muted: string;
  line: string;
  accent: string;
  surface: string;
  curves: string[];
}

export interface ViewHost {
  invalidate(): void;
  notify(): void;
}

export class ArithTab {
  readonly panel: HTMLElement;
  private readonly body: HTMLElement;
  private readonly results: HTMLElement;
  /** Crible : indice du dernier nombre premier traité (-1 : rien de barré). */
  private sieveStep = -1;
  private timer = 0;

  constructor(private s: ArithState, private readonly host: ViewHost) {
    this.body = h('div');
    this.results = h('div');
    const tools = segmented<ArithState['tool']>([['factor', 'Décomposition'], ['gcd', 'PGCD'], ['sieve', 'Crible']], s.tool, (v) => {
      this.s.tool = v;
      tools.set(v);
      this.stop();
      this.build();
      this.host.invalidate();
      this.host.notify();
    });
    this.panel = h('div', { class: 'tab-panel' }, h('section', { class: 'panel-section' }, tools.el), this.body, this.results);
    this.build();
  }

  getState(): ArithState {
    return this.s;
  }

  destroy(): void {
    this.stop();
  }

  // ─── Panneau ──────────────────────────────────────────────────────────────

  private bigInput(label: string, key: 'n' | 'a' | 'b'): HTMLElement {
    const input = h('input', { class: 'input big-input', type: 'text', inputmode: 'numeric', spellcheck: false, 'aria-label': label });
    input.value = this.s[key];
    input.addEventListener('input', () => {
      this.s[key] = input.value.slice(0, 60);
      input.classList.toggle('is-invalid', !!input.value.trim() && parseBigInt(input.value) === null);
      this.renderResults();
      this.host.invalidate();
      this.host.notify();
    });
    return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input);
  }

  private presets(items: [string, () => void][]): HTMLElement {
    return h('div', { class: 'presets' }, ...items.map(([label, fn]) => h('button', { class: 'chip', onclick: () => { fn(); this.build(); this.host.invalidate(); this.host.notify(); } }, label)));
  }

  private build(): void {
    const s = this.s;
    if (s.tool === 'factor') {
      this.body.replaceChildren(section('Nombre à décomposer',
        this.bigInput('Entier naturel n', 'n'),
        this.presets([
          ['360', () => (s.n = '360')],
          ['1 001', () => (s.n = '1001')],
          ['2 024', () => (s.n = '2024')],
          ['9 699 690', () => (s.n = '9699690')],
          ['2³² + 1', () => (s.n = '4294967297')],
          ['2⁶¹ − 1', () => (s.n = String(2n ** 61n - 1n))],
        ]),
      ));
    } else if (s.tool === 'gcd') {
      this.body.replaceChildren(section('Deux entiers',
        h('div', { class: 'pair-grid' }, this.bigInput('a', 'a'), this.bigInput('b', 'b')),
        this.presets([
          ['84 et 36', () => ((s.a = '84'), (s.b = '36'))],
          ['240 et 46', () => ((s.a = '240'), (s.b = '46'))],
          ['1071 et 462', () => ((s.a = '1071'), (s.b = '462'))],
          ['Fibonacci', () => ((s.a = '10946'), (s.b = '6765'))],
          ['Premiers entre eux', () => ((s.a = '35'), (s.b = '12'))],
        ]),
      ));
    } else {
      const Nsel = segmented([['100', '100'], ['200', '200'], ['300', '300'], ['500', '500']], String(s.N), (v) => {
        s.N = Number(v);
        Nsel.set(v);
        this.sieveStep = -1;
        this.stop();
        this.renderResults();
        this.host.invalidate();
        this.host.notify();
      });
      const play = h('button', { class: 'btn btn-primary sieve-play', onclick: () => this.togglePlay() });
      this.body.replaceChildren(section('Crible d\'Ératosthène',
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Nombres de 1 à N'), Nsel.el),
        h('div', { class: 'sieve-actions' },
          play,
          h('button', { class: 'btn', onclick: () => this.stepSieve() }, svgIcon(icon('chevronRight'), 'icon icon-sm'), 'Étape'),
          h('button', { class: 'btn', onclick: () => this.finishSieve() }, 'Tout cribler'),
          h('button', { class: 'btn btn-icon', title: 'Recommencer', 'aria-label': 'Recommencer', onclick: () => { this.stop(); this.sieveStep = -1; this.renderResults(); this.host.invalidate(); } }, svgIcon(icon('reset'))),
        ),
        html('p', 'hint', 'À chaque étape, le plus petit nombre non barré est premier : on barre ses multiples à partir de son carré. On peut s\'arrêter dès que <i>p</i>² &gt; <i>N</i>.'),
      ));
      this.syncPlay();
    }
    this.renderResults();
  }

  private renderResults(): void {
    const s = this.s;
    if (s.tool === 'factor') {
      const n = parseBigInt(s.n);
      if (n === null || n < 1n) {
        this.results.replaceChildren(section('Résultat', html('p', 'muted', 'Saisissez un entier naturel non nul (jusqu\'à 40 chiffres).')));
        return;
      }
      const f = factorize(n);
      const count = divisorCount(f);
      const sum = divisorSum(f);
      const proper = sum - n;
      const divs = count <= 240n ? divisors(f) : [];
      const kind = n === 1n ? '—' : proper === n ? 'parfait' : proper > n ? 'abondant' : 'déficient';
      this.results.replaceChildren(
        section('Résultat',
          h('div', { class: 'result-card' },
            html('div', 'result-law', n === 1n ? '1 n\'a aucun facteur premier' : isPrime(n) ? 'Nombre premier' : 'Décomposition en facteurs premiers'),
            html('div', 'result-main result-mono', `${fmtBig(n)}${n > 1n ? ` = ${f.map(([p, e]) => `${fmtBig(p)}${e > 1 ? `<sup>${e}</sup>` : ''}`).join(' × ')}` : ''}`),
          ),
          statGrid([
            ['Nombre de diviseurs', fmtBig(count)],
            ['Somme des diviseurs', fmtBig(sum)],
            ['Facteurs premiers distincts', String(f.length)],
            ['Nombre', kind],
          ]),
        ),
        divs.length ? section(`Diviseurs (${divs.length})`, html('div', 'div-list', divs.map((d) => `<span>${fmtBig(d)}</span>`).join(''))) : section('Diviseurs', html('p', 'muted', `${fmtBig(count)} diviseurs : trop nombreux pour être listés.`)),
      );
    } else if (s.tool === 'gcd') {
      const a = parseBigInt(s.a);
      const b = parseBigInt(s.b);
      if (a === null || b === null || (a === 0n && b === 0n)) {
        this.results.replaceChildren(section('Résultat', html('p', 'muted', 'Saisissez deux entiers non tous deux nuls.')));
        return;
      }
      const d = gcd(a, b);
      const { u, v } = extendedEuclid(a, b);
      const par = (x: bigint) => (x < 0n ? `(${fmtBig(x)})` : fmtBig(x));
      this.results.replaceChildren(section('Résultat',
        h('div', { class: 'result-card' },
          html('div', 'result-law', d === 1n ? `${fmtBig(a)} et ${fmtBig(b)} sont premiers entre eux` : 'Plus grand commun diviseur'),
          html('div', 'result-main result-mono', `PGCD = ${fmtBig(d)}`),
          html('div', 'result-pct', `PPCM = ${fmtBig(lcm(a, b))}`),
        ),
        statGrid([
          ['Étapes de l\'algorithme', String(euclidSteps(a, b).length)],
          ['Coefficients de Bézout', `<i>u</i> = ${fmtBig(u)} ; <i>v</i> = ${fmtBig(v)}`],
        ]),
        html('p', 'bezout', `${par(a)} × ${par(u)} + ${par(b)} × ${par(v)} = ${fmtBig(d)}`),
      ));
    } else {
      const primes = this.primesUpTo(this.s.N);
      const known = this.sieveDone() ? primes : primes.filter((p) => p <= (this.sievePrimes()[this.sieveStep] ?? 0));
      this.results.replaceChildren(section('Nombres premiers trouvés',
        statGrid([
          ['Premiers ≤ N', this.sieveDone() ? String(primes.length) : '…'],
          ['Étape', this.sieveDone() ? 'terminé' : this.sieveStep < 0 ? 'départ' : `multiples de ${this.sievePrimes()[this.sieveStep]}`],
        ]),
        html('div', 'div-list', known.map((p) => `<span>${p}</span>`).join('') || '<span class="muted">aucun pour l\'instant</span>'),
      ));
    }
  }

  // ─── Crible ───────────────────────────────────────────────────────────────

  private primesUpTo(n: number): number[] {
    const spf = sieve(n);
    const out: number[] = [];
    for (let i = 2; i <= n; i++) if (spf[i] === i) out.push(i);
    return out;
  }

  /** Nombres premiers dont on barre les multiples (p² ≤ N). */
  private sievePrimes(): number[] {
    return this.primesUpTo(Math.floor(Math.sqrt(this.s.N)));
  }

  private sieveDone(): boolean {
    return this.sieveStep >= this.sievePrimes().length - 1;
  }

  private stepSieve(): void {
    if (this.sieveDone()) {
      this.stop();
      return;
    }
    this.sieveStep++;
    if (this.sieveDone()) this.stop();
    this.renderResults();
    this.host.invalidate();
  }

  private finishSieve(): void {
    this.stop();
    this.sieveStep = this.sievePrimes().length - 1;
    this.renderResults();
    this.host.invalidate();
  }

  private togglePlay(): void {
    if (this.timer) this.stop();
    else {
      if (this.sieveDone()) this.sieveStep = -1;
      this.timer = window.setInterval(() => this.stepSieve(), 1100);
      this.stepSieve();
    }
    this.syncPlay();
  }

  private stop(): void {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = 0;
    this.syncPlay();
  }

  private syncPlay(): void {
    const b = this.panel.querySelector('.sieve-play');
    b?.replaceChildren(svgIcon(icon(this.timer ? 'pause' : 'play'), 'icon icon-sm'), this.timer ? 'Pause' : 'Animer');
  }

  // ─── Dessin ───────────────────────────────────────────────────────────────

  draw(p: Painter, w: number, hgt: number, pal: ArithPalette, k: number): void {
    if (this.s.tool === 'factor') this.drawFactor(p, w, hgt, pal, k);
    else if (this.s.tool === 'gcd') this.drawGcd(p, w, hgt, pal, k);
    else this.drawSieve(p, w, hgt, pal, k);
  }

  private message(p: Painter, w: number, hgt: number, pal: ArithPalette, k: number, msg: string): void {
    p.text(msg, w / 2, hgt / 2, { color: pal.muted, size: 15 * k, align: 'center', baseline: 'middle' });
  }

  private drawFactor(p: Painter, w: number, hgt: number, pal: ArithPalette, k: number): void {
    const n = parseBigInt(this.s.n);
    if (n === null || n < 2n) {
      this.message(p, w, hgt, pal, k, n === 1n ? '1 n\'est pas premier et n\'a pas de facteur premier.' : 'Saisissez un entier supérieur ou égal à 2.');
      return;
    }
    const f = factorize(n);
    const list = f.flatMap(([q, e]) => Array<bigint>(e).fill(q));
    // Équation « n = 2³ × 3² × 5 », réduite si elle est trop longue.
    const equation = (size: number) => {
      const items: Box[] = [text(`${fmtBig(n)} = `, size, 'mono')];
      f.forEach(([q, e], i) => {
        if (i) items.push(text(' × ', size, 'mono'));
        items.push(power(fmtBig(q), e, size));
      });
      return row(items);
    };
    let eq = equation(30 * k);
    if (eq.w > w - 60 * k) eq = equation((30 * k * (w - 60 * k)) / eq.w);
    const top = 72 * k;
    eq.draw(p, (w - eq.w) / 2, top, pal.text);
    p.text(isPrime(n) ? 'nombre premier' : `${list.length} facteurs premiers (avec multiplicité)`, w / 2, top + 36 * k, { color: pal.muted, size: 13 * k, align: 'center', baseline: 'middle' });

    // Divisions successives (à gauche)
    const areaTop = top + 76 * k;
    const areaH = hgt - areaTop - 30 * k;
    const rowsN = list.length + 1;
    const rh = Math.max(16 * k, Math.min(34 * k, areaH / rowsN));
    const fs = Math.min(19 * k, rh * 0.62);
    const values: bigint[] = [n];
    for (const q of list) values.push(values[values.length - 1] / q);
    const numW = fmtBig(n).length * fs * 0.6;
    const leftW = numW + 90 * k;
    const tableX = Math.max(30 * k, w * 0.18 - leftW / 2);
    const barX = tableX + numW + 16 * k;
    p.text('Divisions successives', tableX, areaTop - 14 * k, { color: pal.muted, size: 12.5 * k, weight: 600, baseline: 'bottom' });
    values.forEach((v, i) => {
      const y = areaTop + i * rh + rh / 2;
      p.text(fmtBig(v), barX - 14 * k, y, { color: i === values.length - 1 ? pal.muted : pal.text, size: fs, family: MONO_FONT, align: 'right', baseline: 'middle' });
      if (i < list.length) p.text(fmtBig(list[i]), barX + 14 * k, y, { color: pal.accent, size: fs, family: MONO_FONT, weight: 600, baseline: 'middle' });
    });
    line(p, barX, areaTop, barX, areaTop + rowsN * rh, { color: pal.text, width: 1.5 * k, cap: 'butt' });
    line(p, barX, areaTop + list.length * rh, barX + 60 * k, areaTop + list.length * rh, { color: pal.line, width: 1, cap: 'butt' });

    // Arbre de facteurs (à droite)
    const treeX0 = barX + 150 * k;
    const treeW = w - treeX0 - 40 * k;
    if (treeW < 160 * k) return;
    const steps = list.length;
    const dy = Math.max(22 * k, Math.min(64 * k, (areaH - 20 * k) / Math.max(1, steps)));
    const dx = Math.max(20 * k, Math.min(90 * k, (treeW - 120 * k) / Math.max(1, steps)));
    const tfs = Math.min(18 * k, dy * 0.42);
    p.text('Arbre de facteurs', treeX0, areaTop - 14 * k, { color: pal.muted, size: 12.5 * k, weight: 600, baseline: 'bottom' });
    const nodeX = (i: number) => treeX0 + 80 * k + i * dx;
    const nodeY = (i: number) => areaTop + 12 * k + i * dy;
    for (let i = 0; i < steps; i++) {
      const x = nodeX(i);
      const y = nodeY(i);
      const last = i === steps - 1;
      if (!last) {
        line(p, x, y + tfs * 0.7, nodeX(i + 1), nodeY(i + 1) - tfs * 0.7, { color: pal.line, width: 1.4 * k });
        const lx = x - dx * 0.95;
        const ly = nodeY(i + 1);
        line(p, x, y + tfs * 0.7, lx, ly - tfs * 0.8, { color: pal.line, width: 1.4 * k });
        drawPrime(p, lx, ly, list[i], tfs, pal, k);
      }
      if (last) drawPrime(p, x, y, values[i], tfs, pal, k);
      else p.text(fmtBig(values[i]), x, y, { color: pal.text, size: tfs, family: MONO_FONT, align: 'center', baseline: 'middle', halo: pal.bg });
    }
  }

  private drawGcd(p: Painter, w: number, hgt: number, pal: ArithPalette, k: number): void {
    const a0 = parseBigInt(this.s.a);
    const b0 = parseBigInt(this.s.b);
    if (a0 === null || b0 === null || (a0 === 0n && b0 === 0n)) {
      this.message(p, w, hgt, pal, k, 'Saisissez deux entiers non tous deux nuls.');
      return;
    }
    const d = gcd(a0, b0);
    const steps = euclidSteps(a0, b0);
    const top = 72 * k;
    p.text(`PGCD(${fmtBig(a0)} ; ${fmtBig(b0)}) = ${fmtBig(d)}`, w / 2, top, { color: pal.text, size: 28 * k, family: MONO_FONT, align: 'center', baseline: 'middle' });
    p.text('Algorithme d\'Euclide : le PGCD est le dernier reste non nul.', w / 2, top + 34 * k, { color: pal.muted, size: 13 * k, align: 'center', baseline: 'middle' });

    // Égalités de division euclidienne
    const areaTop = top + 84 * k;
    const areaH = hgt - areaTop - 30 * k;
    const rh = Math.max(16 * k, Math.min(34 * k, areaH / Math.max(1, steps.length)));
    const fs = Math.min(18 * k, rh * 0.62);
    const lines = steps.map((s) => [fmtBig(s.a), fmtBig(s.b), fmtBig(s.q), fmtBig(s.r)]);
    const widths = [0, 1, 2, 3].map((j) => Math.max(...lines.map((l) => l[j].length)) * fs * 0.6);
    const x0 = 40 * k;
    const lastNonZero = steps.length - 2;
    lines.forEach(([a, b, q, r], i) => {
      const y = areaTop + i * rh + rh / 2;
      let x = x0;
      const put = (str: string, width: number, color = pal.text, weight?: number) => {
        p.text(str, x + width, y, { color, size: fs, family: MONO_FONT, align: 'right', baseline: 'middle', weight });
        x += width;
      };
      const sym = (str: string) => {
        p.text(str, x + fs * 0.9, y, { color: pal.muted, size: fs, family: MONO_FONT, align: 'center', baseline: 'middle' });
        x += fs * 1.8;
      };
      put(a, widths[0], i > 0 ? pal.muted : pal.text);
      sym('=');
      put(b, widths[1], i > 0 ? pal.muted : pal.text);
      sym('×');
      put(q, widths[2]);
      sym('+');
      const key = i === lastNonZero || (steps.length === 1 && i === 0);
      put(r, widths[3], key ? pal.accent : steps[i].r === 0n ? pal.muted : pal.text, key ? 700 : undefined);
    });
    const tableRight = x0 + widths.reduce((s, v) => s + v, 0) + 3 * fs * 1.8;

    // Pavage du rectangle a × b par des carrés (interprétation géométrique d'Euclide)
    const A = a0 < 0n ? -a0 : a0;
    const B = b0 < 0n ? -b0 : b0;
    const big = A > B ? A : B;
    const small = A > B ? B : A;
    const areaX = tableRight + 60 * k;
    const availW = w - areaX - 40 * k;
    const availH = areaH;
    if (availW < 140 * k || small === 0n) return;
    const ratio = Number(big) / Number(small);
    if (!Number.isFinite(ratio) || ratio > 60) return;
    const unit = Math.min(availW / Number(big), availH / Number(small));
    const rw = Number(big) * unit;
    const rhh = Number(small) * unit;
    const rx = areaX + (availW - rw) / 2;
    const ry = areaTop + (availH - rhh) / 2;
    p.text(`Rectangle ${fmtBig(big)} × ${fmtBig(small)} pavé par des carrés`, areaX + availW / 2, ry - 14 * k, { color: pal.muted, size: 12.5 * k, weight: 600, align: 'center', baseline: 'bottom' });
    // Découpage : on retire des carrés du plus grand côté possible.
    let x = rx;
    let y = ry;
    let W = Number(big);
    let H = Number(small);
    let level = 0;
    while (W > 0 && H > 0 && level < 40) {
      const side = Math.min(W, H);
      const count = Math.floor(Math.max(W, H) / side);
      const color = pal.curves[level % pal.curves.length];
      const px = side * unit;
      if (px < 1.2) break;
      for (let i = 0; i < count; i++) {
        const sx = W >= H ? x + i * px : x;
        const sy = W >= H ? y : y + i * px;
        p.beginPath();
        p.rect(sx, sy, px, px);
        p.fill(color, side === Number(d) ? 0.55 : 0.22);
        p.beginPath();
        p.rect(sx, sy, px, px);
        p.stroke({ color, width: 1.2 * k });
        if (px > 34 * k && i === 0) p.text(fmtBig(BigInt(side)), sx + px / 2, sy + px / 2, { color: pal.text, size: Math.min(15 * k, px / 3.5), family: MONO_FONT, align: 'center', baseline: 'middle' });
      }
      if (W >= H) {
        x += count * px;
        W -= count * side;
      } else {
        y += count * px;
        H -= count * side;
      }
      level++;
    }
    p.beginPath();
    p.rect(rx, ry, rw, rhh);
    p.stroke({ color: pal.text, width: 1.6 * k });
  }

  private drawSieve(p: Painter, w: number, hgt: number, pal: ArithPalette, k: number): void {
    const N = this.s.N;
    const colsN = N <= 200 ? 10 : 20;
    const rowsN = Math.ceil(N / colsN);
    const top = 70 * k;
    const cell = Math.min((w - 80 * k) / colsN, (hgt - top - 40 * k) / rowsN);
    const gx = (w - cell * colsN) / 2;
    const spf = sieve(N);
    const crossers = this.sievePrimes();
    const done = this.sieveDone();
    const current = crossers[this.sieveStep] ?? 0;
    const colorOf = (q: number) => pal.curves[crossers.indexOf(q) % pal.curves.length];
    p.text(done ? `Il y a ${this.primesUpTo(N).length} nombres premiers inférieurs ou égaux à ${N}.` : current ? `On barre les multiples de ${current} à partir de ${current}² = ${current * current}.` : 'Crible d\'Ératosthène : on part de 2, premier nombre premier.', w / 2, top - 28 * k, { color: pal.text, size: 15 * k, weight: 600, align: 'center', baseline: 'middle' });
    const fs = Math.min(21 * k, cell * 0.32);
    for (let i = 1; i <= N; i++) {
      const c = (i - 1) % colsN;
      const r = Math.floor((i - 1) / colsN);
      const x = gx + c * cell;
      const y = top + r * cell;
      const pad = cell * 0.08;
      const q = spf[i];
      // Barré si son plus petit facteur premier a déjà été traité et i n'est pas ce facteur.
      const crossed = i > 1 && q !== i && crossers.includes(q) && crossers.indexOf(q) <= this.sieveStep;
      const prime = i > 1 && q === i && (done || i <= current);
      const cc = crossed ? colorOf(q) ?? pal.muted : '';
      p.beginPath();
      p.rect(x + pad, y + pad, cell - 2 * pad, cell - 2 * pad);
      if (prime) p.fill(i === current ? pal.accent : colorOf(i) ?? pal.accent, i === current ? 1 : 0.9);
      else if (crossed) p.fill(cc, 0.1);
      else p.fill(pal.surface);
      const color = prime ? '#fff' : crossed || i === 1 ? pal.muted : pal.text;
      p.text(String(i), x + cell / 2, y + cell / 2, { color, size: fs, family: MONO_FONT, align: 'center', baseline: 'middle', weight: prime ? 700 : 500 });
      if (crossed) line(p, x + cell * 0.26, y + cell * 0.7, x + cell * 0.74, y + cell * 0.3, { color: cc, width: 1.6 * k, cap: 'round', alpha: 0.85 });
    }
    // Légende des couleurs
    let lx = gx;
    const ly = top + rowsN * cell + 20 * k;
    crossers.forEach((q, i) => {
      if (i > this.sieveStep) return;
      disc(p, lx + 5 * k, ly, 5 * k, colorOf(q));
      p.text(`multiples de ${q}`, lx + 14 * k, ly, { color: pal.muted, size: 12 * k, baseline: 'middle' });
      lx += 120 * k;
    });
  }
}

function drawPrime(p: Painter, x: number, y: number, v: bigint, size: number, pal: ArithPalette, k: number): void {
  const label = fmtBig(v);
  const r = Math.max(size * 0.95, label.length * size * 0.34 + 6 * k);
  disc(p, x, y, r, pal.accent, undefined);
  p.text(label, x, y, { color: '#fff', size: size * 0.92, family: MONO_FONT, weight: 700, align: 'center', baseline: 'middle' });
}
