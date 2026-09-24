/**
 * Ligne d'expression du panneau : affichage en notation mathématique (KaTeX), édition
 * au clic, curseur pour les paramètres, options (dérivée, tangente, intégrale…) et étude.
 */
import { bindRange, h, svgIcon, syncRange } from '../../core/dom';
import { icon } from '../../core/icons';
import { fmt } from '../../core/math/format';
import type { CompiledRow } from './expr';
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
  /** Rend du LaTeX ; false si KaTeX n'est pas encore chargé. */
  renderTex(el: HTMLElement, tex: string): boolean;
}

const smallInput = (value: string, label: string, onCommit: (v: string) => void, cls = 'input mini-input') => {
  const el = h('input', { class: cls, type: 'text', inputmode: 'decimal', value, title: label, 'aria-label': label, spellcheck: 'false' });
  el.addEventListener('change', () => onCommit(el.value));
  el.addEventListener('keydown', (e) => e.key === 'Enter' && el.blur());
  return el;
};

/** Valeur lisible dans un champ (π reconnu). */
function fmtInput(v: number): string {
  for (const [k, s] of [[1, 'pi'], [2, '2pi'], [0.5, 'pi/2'], [0.25, 'pi/4'], [-1, '-pi'], [-0.5, '-pi/2']] as const) {
    if (Math.abs(v - k * Math.PI) < 1e-12) return s;
  }
  return String(Math.round(v * 1e6) / 1e6);
}

export class RowView {
  readonly el: HTMLElement;
  readonly input: HTMLInputElement;
  private readonly num: HTMLElement;
  private readonly dot: HTMLButtonElement;
  private readonly tex: HTMLElement;
  private readonly status: HTMLElement;
  private readonly sliderBox: HTMLElement;
  private readonly optionsBox: HTMLElement;
  private readonly studyBox: HTMLElement;
  private readonly optionsBtn: HTMLButtonElement;
  private compiled: CompiledRow | null = null;
  private expanded = false;
  private editing = false;
  private renderedTex = '';

  constructor(
    private row: RowState,
    private readonly host: PanelHost,
  ) {
    this.num = h('span', { class: 'expr-num' });
    this.dot = h('button', {
      class: 'expr-dot',
      title: 'Afficher / masquer',
      'aria-label': 'Afficher ou masquer la courbe',
      onclick: () => host.patchRow(this.row.id, { hidden: !this.row.hidden }),
    });
    this.input = h('input', {
      class: 'expr-input',
      type: 'text',
      value: row.src,
      spellcheck: 'false',
      autocomplete: 'off',
      autocapitalize: 'off',
      placeholder: 'Saisir une expression, ex. f(x) = x² − 1',
      'aria-label': 'Expression',
    });
    this.input.addEventListener('input', () => host.setSource(this.row.id, this.input.value));
    this.input.addEventListener('change', () => host.commitSource(this.row.id));
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    this.input.addEventListener('focus', () => this.setEditing(true));
    this.input.addEventListener('blur', () => this.setEditing(false));

    this.tex = h('div', { class: 'expr-tex', role: 'button', tabindex: '-1', title: 'Cliquer pour modifier' });
    this.tex.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.edit();
    });

    this.optionsBtn = h('button', {
      class: 'btn btn-ghost btn-icon btn-sm',
      title: 'Options (dérivée, tangente, intégrale, étude…)',
      'aria-label': 'Options',
      'aria-expanded': 'false',
      onclick: () => this.toggleOptions(),
    }, svgIcon(icon('sliders')));

    this.status = h('div', { class: 'expr-status' });
    this.sliderBox = h('div', { class: 'expr-slider', hidden: true });
    this.optionsBox = h('div', { class: 'expr-options', hidden: true });
    this.studyBox = h('div', { class: 'expr-study', hidden: true });

    this.el = h('div', { class: 'expr-row' },
      h('div', { class: 'expr-gutter' }, this.num, this.dot),
      h('div', { class: 'expr-body' },
        h('div', { class: 'expr-field' }, this.tex, this.input),
        this.status,
        this.sliderBox,
        this.optionsBox,
        this.studyBox,
      ),
      h('div', { class: 'expr-actions' },
        this.optionsBtn,
        h('button', {
          class: 'btn btn-ghost btn-icon btn-sm',
          title: 'Supprimer',
          'aria-label': 'Supprimer l\'expression',
          onclick: () => host.deleteRow(this.row.id),
        }, svgIcon(icon('x'))),
      ),
    );
  }

  get id(): string {
    return this.row.id;
  }

  /** Passe en édition (clic sur l'écriture mathématique). */
  edit(): void {
    this.setEditing(true);
    this.input.focus();
    const n = this.input.value.length;
    this.input.setSelectionRange(n, n);
  }

  private setEditing(on: boolean): void {
    if (this.editing === on) return;
    this.editing = on;
    this.el.classList.toggle('is-editing', on);
    if (!on) this.renderDisplay();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.host.commitSource(this.row.id);
      this.host.focusSibling(this.row.id, 1);
    } else if (e.key === 'Escape') {
      this.input.blur();
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
    this.el.classList.toggle('is-expanded', this.expanded);
    this.renderOptions();
  }

  /** Met à jour l'affichage après recompilation (sans recréer le champ de saisie). */
  update(row: RowState, compiled: CompiledRow, index: number): void {
    const kindChanged = this.compiled?.kind !== compiled.kind || this.compiled?.name !== compiled.name;
    this.row = row;
    this.compiled = compiled;
    this.num.textContent = String(index + 1);
    if (this.input.value !== row.src && document.activeElement !== this.input) this.input.value = row.src;
    this.el.dataset.kind = compiled.kind;
    this.el.style.setProperty('--row-color', compiled.kind === 'param' || compiled.kind === 'constant' ? 'var(--muted)' : `var(--c${row.color + 1})`);
    this.el.classList.toggle('is-hidden', !!row.hidden);
    this.el.classList.toggle('is-invalid', compiled.kind === 'error');
    this.dot.hidden = compiled.kind === 'param' || compiled.kind === 'constant' || compiled.kind === 'empty' || compiled.kind === 'error';

    this.renderStatus();
    this.renderDisplay();
    this.renderSlider();
    if (kindChanged || this.expanded) this.renderOptions();
    this.renderStudy();
  }

  refreshStudy(): void {
    this.renderStudy();
  }

  /** (Re)rend l'écriture mathématique, par ex. une fois KaTeX chargé. */
  renderDisplay(): void {
    const tex = this.compiled?.displayTex;
    const show = !!tex && !this.editing && this.compiled?.kind !== 'error';
    if (show && tex !== this.renderedTex) {
      if (this.host.renderTex(this.tex, tex)) this.renderedTex = tex;
    }
    this.el.classList.toggle('has-tex', show && this.renderedTex === tex);
  }

  syncSliderValue(value: number): void {
    const range = this.sliderBox.querySelector<HTMLInputElement>('input[type=range]');
    if (range) {
      range.value = String(value);
      syncRange(range);
    }
    if (document.activeElement !== this.input) this.input.value = this.row.src;
    this.renderDisplay();
    const play = this.sliderBox.querySelector('.slider-play');
    if (play) play.replaceChildren(svgIcon(icon(this.host.isAnimating(this.row.id) ? 'pause' : 'play')));
  }

  private renderStatus(): void {
    const c = this.compiled!;
    this.status.className = 'expr-status';
    this.status.replaceChildren();
    if (c.kind === 'error') {
      this.status.classList.add('is-error');
      this.status.append(svgIcon(icon('alert'), 'icon icon-sm'), c.error ?? 'Expression invalide');
    } else if (c.missing.length) {
      this.status.classList.add('is-hint');
      this.status.append(`Entrée : créer ${c.missing.length > 1 ? 'les curseurs' : 'le curseur'} ${c.missing.join(', ')}`);
    } else if (c.kind === 'constant') {
      this.status.append(`≈ ${fmt(c.valueFn?.() ?? Number.NaN, 6)}`);
    } else if (this.row.integral && c.kind === 'function') {
      const v = this.host.integralValue(this.row.id);
      this.status.append(h('span', { class: 'expr-integral' }, `Intégrale ≈ ${Number.isFinite(v) ? fmt(v, 6) : 'non définie'}`));
    }
    this.status.hidden = !this.status.childNodes.length;
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
      if (document.activeElement !== existing) {
        existing.value = String(value);
        syncRange(existing);
      }
      this.sliderBox.hidden = false;
      return;
    }
    const range = bindRange(h('input', { type: 'range', min, max, step, value, 'aria-label': `Valeur de ${c.name}` }));
    range.addEventListener('input', () => this.host.setSlider(this.row.id, Number(range.value)));
    this.sliderBox.replaceChildren(
      smallInput(String(min), 'Minimum', (v) => {
        const n = this.host.parseNumber(v);
        if (Number.isFinite(n) && n < max) this.host.patchRow(this.row.id, { slider: { min: n, max, step } });
      }, 'slider-bound'),
      range,
      smallInput(String(max), 'Maximum', (v) => {
        const n = this.host.parseNumber(v);
        if (Number.isFinite(n) && n > min) this.host.patchRow(this.row.id, { slider: { min, max: n, step } });
      }, 'slider-bound'),
      h('button', {
        class: 'btn btn-ghost btn-icon btn-sm slider-play',
        title: 'Animer le paramètre',
        'aria-label': 'Animer le paramètre',
        onclick: () => this.host.toggleAnimation(this.row.id),
      }, svgIcon(icon(this.host.isAnimating(this.row.id) ? 'pause' : 'play'))),
    );
    this.sliderBox.hidden = false;
  }

  private renderOptions(): void {
    const c = this.compiled;
    this.optionsBox.hidden = !this.expanded || !c;
    if (!this.expanded || !c) return;
    const row = this.row;
    const patch = (p: Partial<RowState>) => this.host.patchRow(row.id, p);
    const toggle = (checked: boolean, onChange: (v: boolean) => void) => {
      const box = h('input', { type: 'checkbox', class: 'switch', checked });
      box.addEventListener('change', () => onChange(box.checked));
      return box;
    };
    const opt = (label: Node | string, ...controls: Node[]) => h('label', { class: 'opt-row' }, h('span', { class: 'opt-label' }, label), ...controls);

    const items: Node[] = [];
    if (c.kind !== 'param' && c.kind !== 'constant' && c.kind !== 'error' && c.kind !== 'empty') {
      items.push(h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Couleur' },
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
      ));
    }
    if (c.kind === 'function') {
      const name = c.name ?? 'f';
      items.push(
        opt(`Courbe de la dérivée ${name}′`, toggle(!!row.deriv, (v) => patch({ deriv: v || undefined }))),
        opt('Tangente en x =',
          smallInput(fmtInput(row.tangent ?? 1), 'Abscisse du point de tangence', (t) => {
            const n = this.host.parseNumber(t);
            if (Number.isFinite(n)) patch({ tangent: n });
          }),
          toggle(row.tangent !== undefined, (v) => patch({ tangent: v ? (row.tangent ?? 1) : undefined })),
        ),
        opt(h('span', { class: 'opt-inline' }, 'Intégrale de',
          smallInput(fmtInput(row.integral?.[0] ?? 0), 'Borne inférieure', (t) => {
            const n = this.host.parseNumber(t);
            if (Number.isFinite(n)) patch({ integral: [n, row.integral?.[1] ?? 1] });
          }),
          'à',
          smallInput(fmtInput(row.integral?.[1] ?? 1), 'Borne supérieure', (t) => {
            const n = this.host.parseNumber(t);
            if (Number.isFinite(n)) patch({ integral: [row.integral?.[0] ?? 0, n] });
          }),
        ), toggle(!!row.integral, (v) => patch({ integral: v ? (row.integral ?? [0, 1]) : undefined }))),
        opt('Points remarquables', toggle(!!row.points, (v) => patch({ points: v || undefined }))),
        opt('Étude : dérivée, limites, asymptotes', toggle(!!row.study, (v) => patch({ study: v || undefined }))),
      );
    }
    if (c.kind === 'polar' || c.kind === 'parametric') {
      const v = c.kind === 'polar' ? 'θ' : 't';
      const [t0, t1] = row.range ?? [0, 2 * Math.PI];
      items.push(opt(h('span', { class: 'opt-inline' }, `${v} varie de`,
        smallInput(fmtInput(t0), `${v} minimum`, (t) => {
          const n = this.host.parseNumber(t);
          if (Number.isFinite(n)) patch({ range: [n, row.range?.[1] ?? 2 * Math.PI] });
        }),
        'à',
        smallInput(fmtInput(t1), `${v} maximum`, (t) => {
          const n = this.host.parseNumber(t);
          if (Number.isFinite(n)) patch({ range: [row.range?.[0] ?? 0, n] });
        }),
      )));
    }
    if (c.kind === 'param') {
      items.push(opt('Pas du curseur', smallInput(String(row.slider?.step ?? 0.1), 'Pas', (t) => {
        const n = this.host.parseNumber(t);
        if (Number.isFinite(n) && n > 0 && row.slider) patch({ slider: { ...row.slider, step: n } });
      })));
    }
    if (!items.length) items.push(h('p', { class: 'muted small' }, 'Aucune option pour ce type de ligne.'));
    this.optionsBox.replaceChildren(...items);
  }

  private renderStudy(): void {
    const show = !!this.row.study && this.compiled?.kind === 'function' && !this.row.hidden;
    this.studyBox.hidden = !show;
    if (show) this.host.renderStudy(this.row.id, this.studyBox);
  }
}
