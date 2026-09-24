/**
 * Carte d'une suite dans le panneau : type (explicite / récurrente), formule,
 * termes initiaux, premier rang et observations.
 */
import { h, svgIcon } from '../../core/dom';
import { icon } from '../../core/icons';
import { fmt } from '../../core/math/format';
import type { CompiledSeq, FixedPoint, Limit, Monotony, Nature, SeqDef } from './model';

export interface Observations {
  nature: Nature | null;
  monotony: Monotony;
  limit: Limit;
  fixed: FixedPoint[];
  sum: number;
  last: number;
}

export interface CardHost {
  patch(name: SeqDef['name'], patch: Partial<SeqDef>, recompile?: boolean): void;
  remove(name: SeqDef['name']): void;
  canRemove(): boolean;
  renderTex(el: HTMLElement, tex: string): boolean;
  color(index: number): string;
}

/** Terme en HTML : u<sub>n+1</sub> (police mathématique). */
export function termHTML(name: string, index: string | number): string {
  return `<i>${name}</i><sub>${String(index).replace(/-/g, '−')}</sub>`;
}

const html = (tag: string, cls: string, inner: string) => {
  const el = document.createElement(tag);
  el.className = cls;
  el.innerHTML = inner;
  return el;
};

export class SeqCard {
  readonly el: HTMLElement;
  private readonly dot: HTMLButtonElement;
  private readonly kindButtons: Record<SeqDef['kind'], HTMLButtonElement>;
  private readonly n0Select: HTMLSelectElement;
  private readonly initRows: HTMLElement;
  private readonly formulaLabel: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly tex: HTMLElement;
  private readonly error: HTMLElement;
  private readonly obs: HTMLElement;
  private readonly removeBtn: HTMLButtonElement;
  private def: SeqDef;
  private compiled: CompiledSeq | null = null;
  private editing = false;

  constructor(def: SeqDef, private readonly host: CardHost) {
    this.def = def;
    this.dot = h('button', { class: 'seq-dot', title: 'Afficher / masquer', 'aria-label': 'Afficher ou masquer la suite' });
    this.dot.addEventListener('click', () => this.host.patch(this.def.name, { hidden: !this.def.hidden }, false));
    const kindBtn = (kind: SeqDef['kind'], label: string, title: string) => {
      const b = h('button', { class: 'seg-btn', role: 'radio', title }, label);
      b.addEventListener('click', () => this.setKind(kind));
      return b;
    };
    this.kindButtons = {
      explicit: kindBtn('explicit', 'Explicite', 'Terme général uₙ = f(n)'),
      recursive: kindBtn('recursive', 'Récurrente', 'Relation de récurrence uₙ₊₁ = f(uₙ)'),
    };
    this.n0Select = h('select', { class: 'select select-sm seq-n0', title: 'Premier indice n₀', 'aria-label': 'Premier indice' },
      ...[0, 1, 2, 3, 4, 5].map((n) => h('option', { value: String(n) }, `n ≥ ${n}`)),
    );
    this.n0Select.addEventListener('change', () => this.host.patch(this.def.name, { n0: Number(this.n0Select.value) }));
    this.removeBtn = h('button', { class: 'btn btn-ghost btn-icon btn-sm', title: 'Supprimer la suite', 'aria-label': 'Supprimer la suite' }, svgIcon(icon('trash')));
    this.removeBtn.addEventListener('click', () => this.host.remove(this.def.name));

    this.initRows = h('div', { class: 'seq-inits' });
    this.formulaLabel = h('span', { class: 'seq-label' });
    this.input = h('input', { class: 'seq-input', type: 'text', spellcheck: false, autocomplete: 'off', 'aria-label': 'Formule de la suite' });
    this.tex = h('div', { class: 'seq-tex', tabindex: '-1' });
    this.tex.addEventListener('click', () => this.input.focus());
    this.input.addEventListener('focus', () => {
      this.editing = true;
      this.el.classList.add('is-editing');
    });
    this.input.addEventListener('blur', () => {
      this.editing = false;
      this.el.classList.remove('is-editing');
      this.renderDisplay();
    });
    this.input.addEventListener('input', () => this.host.patch(this.def.name, { expr: this.input.value }));
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') this.input.blur();
    });
    this.error = h('div', { class: 'seq-error', hidden: true });
    this.obs = h('div', { class: 'seq-obs' });

    this.el = h('div', { class: 'seq-card' },
      h('div', { class: 'seq-head' },
        this.dot,
        html('span', 'seq-name', `<i>${def.name}</i>`),
        h('div', { class: 'seg seg-sm', role: 'radiogroup', 'aria-label': 'Type de suite' }, this.kindButtons.explicit, this.kindButtons.recursive),
        h('span', { class: 'seq-spacer' }),
        this.n0Select,
        this.removeBtn,
      ),
      h('div', { class: 'seq-body' },
        this.initRows,
        h('div', { class: 'seq-line' }, this.formulaLabel, h('div', { class: 'seq-field' }, this.input, this.tex)),
        this.error,
      ),
      this.obs,
    );
    this.update(def, null, null);
  }

  private setKind(kind: SeqDef['kind']): void {
    if (kind === this.def.kind) return;
    // Formules d'exemple à la bascule, si la saisie est vide ou reprend l'exemple de l'autre type.
    const patch: Partial<SeqDef> = { kind };
    if (kind === 'recursive' && !this.def.init.length) patch.init = ['1'];
    this.host.patch(this.def.name, patch);
  }

  update(def: SeqDef, compiled: CompiledSeq | null, obs: Observations | null): void {
    this.def = def;
    this.compiled = compiled;
    const { name } = def;
    this.el.style.setProperty('--seq-color', this.host.color(def.color));
    this.el.classList.toggle('is-hidden', !!def.hidden);
    this.dot.setAttribute('aria-pressed', String(!def.hidden));
    for (const [kind, b] of Object.entries(this.kindButtons)) {
      b.classList.toggle('is-active', kind === def.kind);
      b.setAttribute('aria-checked', String(kind === def.kind));
    }
    this.n0Select.value = String(def.n0);
    this.removeBtn.hidden = !this.host.canRemove();

    // Termes initiaux (récurrente) : autant que l'ordre de la récurrence.
    const order = def.kind === 'recursive' ? Math.max(1, compiled?.order ?? 1) : 0;
    if (this.initRows.children.length !== order || this.initRows.dataset.n0 !== String(def.n0) || this.initRows.dataset.name !== name) {
      this.initRows.replaceChildren(...Array.from({ length: order }, (_, i) => {
        const input = h('input', { class: 'seq-init', type: 'text', spellcheck: false, autocomplete: 'off', 'aria-label': `Terme initial ${name}${def.n0 + i}` });
        input.value = def.init[i] ?? '1';
        input.addEventListener('input', () => {
          const init = [...this.def.init];
          while (init.length <= i) init.push('1');
          init[i] = input.value;
          this.host.patch(this.def.name, { init });
        });
        return h('div', { class: 'seq-line' }, html('span', 'seq-label', `${termHTML(name, def.n0 + i)} =`), input);
      }));
      this.initRows.dataset.n0 = String(def.n0);
      this.initRows.dataset.name = name;
    }
    this.formulaLabel.innerHTML = `${termHTML(name, def.kind === 'recursive' ? 'n+1' : 'n')} =`;
    if (document.activeElement !== this.input) this.input.value = def.expr;
    this.input.placeholder = def.kind === 'recursive' ? 'ex. 0,5u + 3' : 'ex. 3 + 2n';

    const err = compiled?.error;
    this.error.hidden = !err;
    this.error.textContent = err ?? '';
    this.el.classList.toggle('is-invalid', !!err);
    this.renderDisplay();
    this.renderObservations(obs);
  }

  renderDisplay(): void {
    const rhs = this.compiled?.rhsTex;
    const ok = !this.editing && !!rhs && !this.compiled?.error && this.def.expr.trim() !== '' && this.host.renderTex(this.tex, rhs);
    this.el.classList.toggle('has-tex', ok);
  }

  private renderObservations(o: Observations | null): void {
    const { name, n0 } = this.def;
    if (!o || this.compiled?.error || !this.def.expr.trim()) {
      this.obs.replaceChildren();
      this.obs.hidden = true;
      return;
    }
    this.obs.hidden = false;
    const chips: HTMLElement[] = [];
    const chip = (text: string, cls = '') => chips.push(html('span', `obs-chip ${cls}`, text));
    const n = o.nature;
    if (n?.kind === 'constant') chip(`Constante : ${fmt(n.value, 6)}`, 'is-key');
    else if (n?.kind === 'arithmetic') chip(`Arithmétique · <i>r</i> = ${fmt(n.r, 6)}`, 'is-key');
    else if (n?.kind === 'geometric') chip(`Géométrique · <i>q</i> = ${fmt(n.q, 6)}`, 'is-key');
    else if (n?.kind === 'arith-geo') chip('Arithmético-géométrique', 'is-key');
    const m = o.monotony;
    if (m.kind === 'increasing' || m.kind === 'decreasing') {
      const word = m.kind === 'increasing' ? 'Croissante' : 'Décroissante';
      chip(m.from > n0 ? `${word} dès <i>n</i> = ${m.from}` : word);
    } else if (m.kind === 'none' && n?.kind !== 'constant') chip('Non monotone');

    const lines: HTMLElement[] = [];
    const line = (label: string, value: string) => lines.push(h('div', { class: 'obs-line' }, html('span', 'obs-label', label), html('span', 'obs-value', value)));
    const l = o.limit;
    const u = `${termHTML(name, 'n')}`;
    if (l.kind === 'converges') line('Conjecture', `${u} → ${fmt(l.limit, 8)}`);
    else if (l.kind === 'infinite') line('Conjecture', `${u} → ${l.sign > 0 ? '+∞' : '−∞'}`);
    else if (l.kind === 'cycle') line('Conjecture', `cycle de période ${l.values.length} : ${l.values.map((v) => fmt(v, 5)).join(' ; ')}`);
    else line('Conjecture', '<span class="muted">pas de tendance nette</span>');

    if (n?.kind === 'arith-geo') {
      line('Point fixe', `ℓ = ${fmt(n.l, 8)} : ${termHTML('v', 'n')} = ${termHTML(name, 'n')} ${n.l < 0 ? '+' : '−'} ${fmt(Math.abs(n.l), 8)} est géométrique de raison ${fmt(n.a, 6)}`);
    } else if (o.fixed.length) {
      line(o.fixed.length > 1 ? 'Points fixes' : 'Point fixe', o.fixed.map((f) => {
        const kind = Math.abs(f.slope) < 1 - 1e-9 ? 'attractif' : Math.abs(f.slope) > 1 + 1e-9 ? 'répulsif' : 'indifférent';
        return `ℓ = ${fmt(f.x, 7)} <span class="muted">(${kind})</span>`;
      }).join('<br>'));
    }
    line('Somme', `${termHTML(name, n0)} + ⋯ + ${termHTML(name, o.last)} = ${fmt(o.sum, 8)}`);
    this.obs.replaceChildren(h('div', { class: 'obs-chips' }, ...chips), ...lines);
  }
}
