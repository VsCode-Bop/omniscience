/** Ligne d'expression du panneau latéral (saisie, curseur, options, étude). */
import { h, svgIcon } from '../../core/dom';
import { icon } from '../../core/icons';
import { fmt } from '../../core/math/format';
import type { CompiledRow, RowKind } from './expr';
import { PALETTE_SIZE, type RowState } from './state';

export interface PanelHost {
  setSource(id: string, src: string): void;
  commitSource(id: string): void;
  patchRow(id: string, patch: Partial<RowState>): void;
  setSlider(id: string, value: number): void;
  toggleAnimation(id: string): void;
  isAnimating(id: string): boolean;
  addRow(afterId?: string): void;
  deleteRow(id: string): void;
  focusSibling(id: string, delta: 1 | -1): void;
  renderStudy(id: string, el: HTMLElement): void;
  integralValue(id: string): number;
  parseNumber(text: string): number;
}

const KIND_LABELS: Record<RowKind, string> = {
  empty: '',
  function: 'Fonction',
  polar: 'Courbe polaire r(θ)',
  parametric: 'Courbe paramétrée',
  point: 'Point',
  vline: 'Droite verticale',
  param: 'Curseur',
  constant: 'Constante',
  error: '',
};

const numberInput = (value: number | string, title: string, onCommit: (v: string) => void) => {
  const el = h('input', { class: 'input input-num', type: 'text', inputmode: 'decimal', value: String(value), title, 'aria-label': title });
  el.addEventListener('change', () => onCommit(el.value));
  return el;
};

export class RowView {
  readonly el: HTMLElement;
  readonly input: HTMLInputElement;
  private readonly dot: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly sliderBox: HTMLElement;
  private readonly optionsBox: HTMLElement;
  private readonly studyBox: HTMLElement;
  private readonly optionsBtn: HTMLButtonElement;
  private compiled: CompiledRow | null = null;
  private expanded = false;

  constructor(
    private row: RowState,
    private readonly host: PanelHost,
  ) {
    this.dot = h('button', {
      class: 'expr-dot',
      title: 'Afficher / masquer',
      'aria-label': 'Afficher ou masquer la courbe',
      onclick: () => host.patchRow(this.row.id, { hidden: !this.row.hidden }),
    });
    this.input = h('input', {
      class: 'input input-math expr-input',
      type: 'text',
      value: row.src,
      spellcheck: 'false',
      autocomplete: 'off',
      autocapitalize: 'off',
      placeholder: 'ex. f(x) = x^2 − 1',
      'aria-label': 'Expression',
    });
    this.input.addEventListener('input', () => host.setSource(this.row.id, this.input.value));
    this.input.addEventListener('change', () => host.commitSource(this.row.id));
    this.input.addEventListener('keydown', (e) => this.onKey(e));

    this.optionsBtn = h('button', {
      class: 'btn btn-icon btn-small btn-ghost',
      title: 'Options (dérivée, tangente, intégrale…)',
      'aria-label': 'Options',
      'aria-expanded': 'false',
      onclick: () => this.toggleOptions(),
    }, svgIcon(icon('settings')));

    this.status = h('div', { class: 'expr-status' });
    this.sliderBox = h('div', { class: 'expr-slider' });
    this.optionsBox = h('div', { class: 'expr-options', hidden: true });
    this.studyBox = h('div', { class: 'expr-study', hidden: true });

    this.el = h('div', { class: 'expr-row' },
      h('div', { class: 'expr-main' },
        this.dot,
        this.input,
        this.optionsBtn,
        h('button', {
          class: 'btn btn-icon btn-small btn-ghost btn-danger',
          title: 'Supprimer',
          'aria-label': 'Supprimer l\'expression',
          onclick: () => host.deleteRow(this.row.id),
        }, svgIcon(icon('x'))),
      ),
      this.status,
      this.sliderBox,
      this.optionsBox,
      this.studyBox,
    );
  }

  get id(): string {
    return this.row.id;
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.host.commitSource(this.row.id);
      this.host.focusSibling(this.row.id, 1);
    } else if (e.key === 'ArrowDown') {
      this.host.focusSibling(this.row.id, 1);
    } else if (e.key === 'ArrowUp') {
      this.host.focusSibling(this.row.id, -1);
    } else if (e.key === 'Backspace' && this.input.value === '') {
      e.preventDefault();
      this.host.focusSibling(this.row.id, -1);
      this.host.deleteRow(this.row.id);
    }
  }

  private toggleOptions(): void {
    this.expanded = !this.expanded;
    this.optionsBtn.setAttribute('aria-expanded', String(this.expanded));
    this.optionsBtn.classList.toggle('is-active', this.expanded);
    this.renderOptions();
  }

  /** Met à jour l'affichage après recompilation (sans recréer le champ de saisie). */
  update(row: RowState, compiled: CompiledRow): void {
    const kindChanged = this.compiled?.kind !== compiled.kind || this.compiled?.name !== compiled.name;
    this.row = row;
    this.compiled = compiled;
    if (this.input.value !== row.src && document.activeElement !== this.input) this.input.value = row.src;
    this.el.dataset.kind = compiled.kind;
    this.el.style.setProperty('--row-color', `var(--c${row.color + 1})`);
    this.el.classList.toggle('is-hidden', !!row.hidden);
    this.input.classList.toggle('is-invalid', compiled.kind === 'error');
    this.dot.hidden = compiled.kind === 'param' || compiled.kind === 'constant' || compiled.kind === 'empty';

    // Ligne d'état
    this.status.replaceChildren();
    this.status.className = 'expr-status';
    if (compiled.kind === 'error') {
      this.status.classList.add('is-error');
      this.status.textContent = compiled.error ?? 'Expression invalide';
    } else if (compiled.missing.length) {
      this.status.classList.add('is-hint');
      this.status.textContent = `Curseurs créés à la validation (Entrée) : ${compiled.missing.join(', ')}`;
    } else if (compiled.kind === 'constant') {
      this.status.textContent = `${compiled.name} ≈ ${fmt(compiled.valueFn?.() ?? Number.NaN, 6)}`;
    } else if (compiled.kind !== 'param' && compiled.kind !== 'empty') {
      const label = compiled.kind === 'function' && compiled.name ? `Fonction ${compiled.name}` : KIND_LABELS[compiled.kind];
      this.status.textContent = label;
      if (row.integral && compiled.kind === 'function') {
        const v = this.host.integralValue(row.id);
        this.status.append(h('span', { class: 'expr-integral' }, ` · intégrale ≈ ${Number.isFinite(v) ? fmt(v, 6) : 'non définie'}`));
      }
    }

    this.renderSlider();
    if (kindChanged || this.expanded) this.renderOptions();
    this.renderStudy();
  }

  refreshStudy(): void {
    this.renderStudy();
  }

  syncSliderValue(value: number): void {
    const range = this.sliderBox.querySelector<HTMLInputElement>('input[type=range]');
    if (range) range.value = String(value);
    if (document.activeElement !== this.input) this.input.value = this.row.src;
    const play = this.sliderBox.querySelector('.slider-play');
    if (play) play.replaceChildren(svgIcon(icon(this.host.isAnimating(this.row.id) ? 'pause' : 'play')));
  }

  private renderSlider(): void {
    const c = this.compiled;
    if (!c || c.kind !== 'param' || !this.row.slider) {
      this.sliderBox.hidden = true;
      this.sliderBox.replaceChildren();
      return;
    }
    const { min, max, step } = this.row.slider;
    const value = c.value ?? 0;
    const existing = this.sliderBox.querySelector<HTMLInputElement>('input[type=range]');
    if (existing && existing.min === String(min) && existing.max === String(max) && existing.step === String(step)) {
      if (document.activeElement !== existing) existing.value = String(value);
      this.sliderBox.hidden = false;
      return;
    }
    const range = h('input', { type: 'range', min, max, step, value, 'aria-label': `Valeur de ${c.name}` });
    range.addEventListener('input', () => this.host.setSlider(this.row.id, Number(range.value)));
    const playing = this.host.isAnimating(this.row.id);
    this.sliderBox.replaceChildren(
      numberInput(min, 'Minimum', (v) => {
        const n = this.host.parseNumber(v);
        if (Number.isFinite(n) && n < max) this.host.patchRow(this.row.id, { slider: { min: n, max, step } });
      }),
      range,
      numberInput(max, 'Maximum', (v) => {
        const n = this.host.parseNumber(v);
        if (Number.isFinite(n) && n > min) this.host.patchRow(this.row.id, { slider: { min, max: n, step } });
      }),
      h('button', {
        class: 'btn btn-icon btn-small slider-play',
        title: 'Animer le curseur',
        'aria-label': 'Animer le curseur',
        onclick: () => this.host.toggleAnimation(this.row.id),
      }, svgIcon(icon(playing ? 'pause' : 'play'))),
    );
    this.sliderBox.hidden = false;
  }

  private renderOptions(): void {
    const c = this.compiled;
    this.optionsBox.hidden = !this.expanded || !c;
    if (!this.expanded || !c) return;
    const row = this.row;
    const patch = (p: Partial<RowState>) => this.host.patchRow(row.id, p);
    const check = (label: string, checked: boolean, onChange: (v: boolean) => void, ...extra: Node[]) => {
      const box = h('input', { type: 'checkbox', checked });
      box.addEventListener('change', () => onChange(box.checked));
      return h('label', { class: 'check' }, box, h('span', null, label), ...extra);
    };

    const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Couleur' },
      ...Array.from({ length: PALETTE_SIZE }, (_, i) =>
        h('button', {
          class: `swatch${i === row.color ? ' is-active' : ''}`,
          style: `--swatch: var(--c${i + 1})`,
          role: 'radio',
          'aria-checked': String(i === row.color),
          'aria-label': `Couleur ${i + 1}`,
          onclick: () => patch({ color: i }),
        }),
      ),
    );

    const items: Node[] = [];
    if (c.kind === 'function') {
      const name = c.name ?? 'f';
      items.push(
        check(`Courbe de la dérivée ${name}'`, !!row.deriv, (v) => patch({ deriv: v || undefined })),
        check('Tangente en x =', row.tangent !== undefined, (v) => patch({ tangent: v ? (row.tangent ?? 1) : undefined }),
          numberInput(fmtInput(row.tangent ?? 1), 'Abscisse du point de tangence', (t) => {
            const n = this.host.parseNumber(t);
            if (Number.isFinite(n)) patch({ tangent: n });
          }),
        ),
        check('Intégrale de', !!row.integral, (v) => patch({ integral: v ? (row.integral ?? [0, 1]) : undefined }),
          numberInput(fmtInput(row.integral?.[0] ?? 0), 'Borne inférieure', (t) => {
            const n = this.host.parseNumber(t);
            if (Number.isFinite(n)) patch({ integral: [n, row.integral?.[1] ?? 1] });
          }),
          h('span', null, 'à'),
          numberInput(fmtInput(row.integral?.[1] ?? 1), 'Borne supérieure', (t) => {
            const n = this.host.parseNumber(t);
            if (Number.isFinite(n)) patch({ integral: [row.integral?.[0] ?? 0, n] });
          }),
        ),
        check('Points remarquables (racines, extremums, intersections)', !!row.points, (v) => patch({ points: v || undefined })),
        check('Étude : dérivée formelle, limites, asymptotes', !!row.study, (v) => patch({ study: v || undefined })),
      );
    }
    if (c.kind === 'polar' || c.kind === 'parametric') {
      const v = c.kind === 'polar' ? 'θ' : 't';
      const [t0, t1] = row.range ?? [0, 2 * Math.PI];
      items.push(
        h('div', { class: 'check' },
          h('span', null, `${v} de`),
          numberInput(fmtInput(t0), `${v} minimum`, (t) => {
            const n = this.host.parseNumber(t);
            if (Number.isFinite(n)) patch({ range: [n, row.range?.[1] ?? 2 * Math.PI] });
          }),
          h('span', null, 'à'),
          numberInput(fmtInput(t1), `${v} maximum`, (t) => {
            const n = this.host.parseNumber(t);
            if (Number.isFinite(n)) patch({ range: [row.range?.[0] ?? 0, n] });
          }),
        ),
      );
    }
    if (c.kind === 'param') {
      items.push(h('div', { class: 'check' },
        h('span', null, 'Pas du curseur'),
        numberInput(String(row.slider?.step ?? 0.1), 'Pas', (t) => {
          const n = this.host.parseNumber(t);
          if (Number.isFinite(n) && n > 0 && row.slider) patch({ slider: { ...row.slider, step: n } });
        }),
      ));
    }
    this.optionsBox.replaceChildren(...(c.kind === 'param' || c.kind === 'constant' ? [] : [swatches]), ...items);
  }

  private renderStudy(): void {
    const show = !!this.row.study && this.compiled?.kind === 'function' && !this.row.hidden;
    this.studyBox.hidden = !show;
    if (show) this.host.renderStudy(this.row.id, this.studyBox);
  }
}

/** Valeur lisible dans un champ (π reconnu). */
function fmtInput(v: number): string {
  for (const [k, s] of [[1, 'pi'], [2, '2pi'], [0.5, 'pi/2'], [0.25, 'pi/4'], [-1, '-pi'], [-0.5, '-pi/2']] as const) {
    if (Math.abs(v - k * Math.PI) < 1e-12) return s;
  }
  return String(Math.round(v * 1e6) / 1e6);
}
