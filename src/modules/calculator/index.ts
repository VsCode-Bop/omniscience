/**
 * Module « Calculatrice augmentée » : historique réutilisable, aperçu de la saisie en
 * écriture mathématique, calcul exact et approché, calcul formel, clavier virtuel
 * (tablette, TBI) et catalogue des fonctions.
 */
import './calculator.css';
import { h, svgIcon } from '../../core/dom';
import { icon } from '../../core/icons';
import type { ModuleContext, ModuleInstance } from '../../core/types';
import { Calculator, previewTex, type CalcResult } from './engine';

export function mount(container: HTMLElement, ctx: ModuleContext): ModuleInstance {
  return new CalculatorApp(container, ctx);
}

type KatexModule = typeof import('katex').default;

interface CalcState {
  v: 1;
  inputs: string[];
  keyboard: boolean;
}

interface Entry {
  input: string;
  result: CalcResult;
}

/** Touches du clavier virtuel : [libellé, texte inséré, décalage du curseur depuis la fin]. */
const KEYS: [string, string, number, string?][][] = [
  [['sin', 'sin()', 1], ['cos', 'cos()', 1], ['tan', 'tan()', 1], ['ln', 'ln()', 1], ['log', 'log()', 1], ['eˣ', 'exp()', 1]],
  [['√', 'sqrt()', 1], ['x²', '^2', 0], ['xʸ', '^', 0], ['(', '(', 0], [')', ')', 0], ['÷', '/', 0, 'op']],
  [['7', '7', 0, 'num'], ['8', '8', 0, 'num'], ['9', '9', 0, 'num'], ['×', '*', 0, 'op'], ['π', 'π', 0], ['x', 'x', 0]],
  [['4', '4', 0, 'num'], ['5', '5', 0, 'num'], ['6', '6', 0, 'num'], ['−', '-', 0, 'op'], [';', '; ', 0], ['=', ' = ', 0]],
  [['1', '1', 0, 'num'], ['2', '2', 0, 'num'], ['3', '3', 0, 'num'], ['+', '+', 0, 'op'], ['i', 'i', 0], ['→', ' → ', 0]],
  [['0', '0', 0, 'num'], [',', ',', 0, 'num'], ['×10ˣ', 'e', 0], ['ans', 'ans', 0], ['⌫', '', 0, 'del'], ['EXE', '', 0, 'exe']],
];

interface CatalogItem {
  code: string;
  insert: string;
  caret?: number;
  desc: string;
}

const CATALOG: [string, CatalogItem[]][] = [
  ['Calcul formel', [
    { code: 'developper(…)', insert: 'developper()', caret: 1, desc: 'Développer et réduire' },
    { code: 'factoriser(…)', insert: 'factoriser()', caret: 1, desc: 'Factoriser un polynôme ou un entier' },
    { code: 'resoudre(… = …)', insert: 'resoudre( = 0)', caret: 5, desc: 'Résoudre une équation (exacte si polynomiale)' },
    { code: 'deriver(…)', insert: 'deriver()', caret: 1, desc: 'Fonction dérivée' },
    { code: 'primitive(…)', insert: 'primitive()', caret: 1, desc: 'Primitive d\'un polynôme' },
    { code: 'integrale(f; a; b)', insert: 'integrale(; 0; 1)', caret: 7, desc: 'Intégrale de a à b' },
    { code: 'simplifier(…)', insert: 'simplifier()', caret: 1, desc: 'Simplifier une expression' },
  ]],
  ['Arithmétique', [
    { code: 'pgcd(a; b)', insert: 'pgcd(; )', caret: 3, desc: 'Plus grand commun diviseur' },
    { code: 'ppcm(a; b)', insert: 'ppcm(; )', caret: 3, desc: 'Plus petit commun multiple' },
    { code: 'facteurs(n)', insert: 'facteurs()', caret: 1, desc: 'Décomposition en facteurs premiers' },
    { code: 'premier(n)', insert: 'premier()', caret: 1, desc: 'Nombre premier ?' },
    { code: 'reste(a; b)', insert: 'reste(; )', caret: 3, desc: 'Reste de la division euclidienne' },
    { code: 'n!', insert: '!', caret: 0, desc: 'Factorielle' },
  ]],
  ['Probabilités & statistiques', [
    { code: 'binome(n; k)', insert: 'binome(; )', caret: 3, desc: 'Coefficient binomial (k parmi n)' },
    { code: 'arrangement(n; k)', insert: 'arrangement(; )', caret: 3, desc: 'Arrangements' },
    { code: 'moyenne([…])', insert: 'moyenne([])', caret: 2, desc: 'Moyenne d\'une liste' },
    { code: 'mediane([…])', insert: 'mediane([])', caret: 2, desc: 'Médiane d\'une liste' },
    { code: 'alea()', insert: 'alea()', caret: 0, desc: 'Nombre aléatoire dans [0 ; 1[' },
  ]],
  ['Fonctions', [
    { code: 'sqrt(x)  √', insert: 'sqrt()', caret: 1, desc: 'Racine carrée' },
    { code: 'ln(x)', insert: 'ln()', caret: 1, desc: 'Logarithme népérien' },
    { code: 'log(x)', insert: 'log()', caret: 1, desc: 'Logarithme décimal' },
    { code: 'exp(x)', insert: 'exp()', caret: 1, desc: 'Exponentielle' },
    { code: 'abs(x)', insert: 'abs()', caret: 1, desc: 'Valeur absolue' },
    { code: 'ent(x)', insert: 'ent()', caret: 1, desc: 'Partie entière' },
    { code: 'arcsin, arccos, arctan', insert: 'arctan()', caret: 1, desc: 'Fonctions trigonométriques réciproques' },
  ]],
  ['Matrices et complexes', [
    { code: '[[1; 2]; [3; 4]]', insert: '[[1,2],[3,4]]', caret: 0, desc: 'Matrice (virgules entre les coefficients)' },
    { code: 'det(A)', insert: 'det()', caret: 1, desc: 'Déterminant' },
    { code: 'inverse(A)  ou  A^-1', insert: 'inverse()', caret: 1, desc: 'Matrice inverse (exacte)' },
    { code: 'i', insert: 'i', caret: 0, desc: 'Unité imaginaire : (1 + 2i)(3 − i)' },
    { code: 'conjugue(z), abs(z), argument(z)', insert: 'conjugue()', caret: 1, desc: 'Conjugué, module, argument' },
  ]],
  ['Unités (physique)', [
    { code: '36 km/h to m/s', insert: '36 km/h to m/s', caret: 0, desc: 'Conversion d\'unités' },
    { code: '2 kWh to J', insert: '2 kWh to J', caret: 0, desc: 'Énergie' },
    { code: '5 mL + 2 cL', insert: '5 mL + 2 cL', caret: 0, desc: 'Somme de grandeurs' },
  ]],
];

const EXAMPLES = ['1/3 + 1/6', 'sqrt(8) + sqrt(18)', 'cos(pi/6)', 'factoriser(x^2 - 5x + 6)', 'resoudre(x^2 - x - 1 = 0)', 'deriver(x^2*ln(x))', '36 km/h to m/s'];

class CalculatorApp implements ModuleInstance {
  private state: CalcState;
  private calc = new Calculator();
  private entries: Entry[] = [];
  private katex: KatexModule | null = null;
  private cursor = -1;
  private draft = '';
  private readonly root: HTMLElement;
  private readonly historyEl: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly preview: HTMLElement;
  private readonly keyboard: HTMLElement;
  private readonly varsEl: HTMLElement;
  private readonly kbBtn: HTMLButtonElement;

  constructor(container: HTMLElement, private readonly ctx: ModuleContext) {
    const raw = (ctx.initialState && typeof ctx.initialState === 'object' ? ctx.initialState : {}) as Partial<CalcState>;
    this.state = {
      v: 1,
      inputs: Array.isArray(raw.inputs) ? raw.inputs.filter((s) => typeof s === 'string' && s.length < 400).slice(-60) : [],
      keyboard: typeof raw.keyboard === 'boolean' ? raw.keyboard : window.matchMedia('(pointer: coarse)').matches,
    };

    this.historyEl = h('div', { class: 'calc-history', role: 'log', 'aria-live': 'polite' });
    this.input = h('input', { class: 'calc-input', type: 'text', spellcheck: false, autocomplete: 'off', placeholder: 'Saisissez un calcul, par exemple 1/3 + 1/6 ou resoudre(x² − 2 = 0)', 'aria-label': 'Calcul' });
    this.preview = h('div', { class: 'calc-preview', 'aria-hidden': 'true' });
    this.kbBtn = h('button', { class: 'btn btn-ghost btn-icon', title: 'Clavier virtuel', 'aria-label': 'Afficher ou masquer le clavier virtuel', onclick: () => this.toggleKeyboard() }, svgIcon(icon('grid')));
    this.keyboard = h('div', { class: 'calc-keys', role: 'group', 'aria-label': 'Clavier virtuel' },
      ...KEYS.flat().map(([label, insert, back, kind]) => h('button', {
        class: `key${kind ? ` key-${kind}` : ''}`,
        type: 'button',
        onclick: () => (kind === 'exe' ? this.execute() : kind === 'del' ? this.backspace() : this.insert(insert, back)),
      }, label)),
    );
    const editor = h('div', { class: 'calc-editor' },
      this.preview,
      h('div', { class: 'calc-line' },
        this.input,
        this.kbBtn,
        h('button', { class: 'btn btn-primary calc-exe', onclick: () => this.execute() }, 'EXE'),
      ),
      this.keyboard,
    );
    const toolbar = h('div', { class: 'calc-toolbar' },
      h('span', { class: 'calc-title' }, 'Historique'),
      h('button', { class: 'btn btn-ghost btn-sm', title: 'Copier tout l\'historique en LaTeX', onclick: () => this.copyAll() }, svgIcon(icon('copy'), 'icon icon-sm'), 'LaTeX'),
      h('button', { class: 'btn btn-ghost btn-sm', title: 'Effacer l\'historique', onclick: () => this.clearHistory() }, svgIcon(icon('trash'), 'icon icon-sm'), 'Effacer'),
    );
    const main = h('div', { class: 'calc-main' }, toolbar, this.historyEl, editor);

    // Catalogue
    this.varsEl = h('div', { class: 'calc-vars' });
    const search = h('input', { class: 'input input-sm', type: 'search', placeholder: 'Rechercher une fonction…', 'aria-label': 'Rechercher une fonction' });
    const groups = CATALOG.map(([title, items]) => h('section', { class: 'cat-group' },
      h('h3', null, title),
      ...items.map((it) => h('button', { class: 'cat-item', 'data-search': `${it.code} ${it.desc}`.toLowerCase(), onclick: () => this.insert(it.insert, it.caret ?? 0) },
        h('code', null, it.code), h('span', null, it.desc))),
    ));
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      for (const g of groups) {
        let any = false;
        for (const el of g.querySelectorAll<HTMLElement>('.cat-item')) {
          const ok = !q || (el.dataset.search ?? '').includes(q);
          el.hidden = !ok;
          any ||= ok;
        }
        g.hidden = !any;
      }
    });
    const panel = h('aside', { class: 'panel calc-panel', 'aria-label': 'Catalogue' },
      h('div', { class: 'panel-header' }, h('h2', null, 'Catalogue')),
      h('div', { class: 'panel-scroll' },
        h('div', { class: 'cat-search' }, search),
        h('section', { class: 'cat-group' }, h('h3', null, 'Variables et fonctions'), this.varsEl),
        ...groups,
        h('p', { class: 'hint cat-hint' }, 'Virgule ou point décimal ; séparez les arguments par « ; ». Affectation : a = 5 ou 5 → a. Fonction : f(x) = x² + 1.'),
      ),
    );

    this.root = h('div', { class: 'workspace calc' }, main, panel);
    container.appendChild(this.root);

    this.input.addEventListener('input', () => {
      this.cursor = -1;
      this.renderPreview();
    });
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    this.syncKeyboard();

    // Rejouer l'historique partagé.
    for (const s of this.state.inputs) this.entries.push({ input: s, result: this.calc.run(s) });
    this.renderHistory();
    this.renderVars();
    void import('katex').then(async (mod) => {
      await import('katex/dist/katex.min.css');
      this.katex = mod.default;
      this.renderHistory();
      this.renderPreview();
    });
    requestAnimationFrame(() => this.input.focus({ preventScroll: true }));
  }

  // ─── Saisie ───────────────────────────────────────────────────────────────

  private insert(text: string, back: number): void {
    const el = this.input;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    const caret = start + text.length - back;
    el.focus({ preventScroll: true });
    el.setSelectionRange(caret, caret);
    this.renderPreview();
  }

  private backspace(): void {
    const el = this.input;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    if (start === end && start > 0) {
      el.value = el.value.slice(0, start - 1) + el.value.slice(end);
      el.setSelectionRange(start - 1, start - 1);
    } else {
      el.value = el.value.slice(0, start) + el.value.slice(end);
      el.setSelectionRange(start, start);
    }
    el.focus({ preventScroll: true });
    this.renderPreview();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.execute();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (!this.entries.length) return;
      e.preventDefault();
      if (this.cursor === -1) this.draft = this.input.value;
      const next = e.key === 'ArrowUp' ? (this.cursor === -1 ? this.entries.length - 1 : Math.max(0, this.cursor - 1)) : this.cursor === -1 ? -1 : this.cursor + 1;
      this.cursor = next >= this.entries.length ? -1 : next;
      this.input.value = this.cursor === -1 ? this.draft : this.entries[this.cursor].input;
      this.renderPreview();
    } else if (e.key === 'Escape') {
      this.input.value = '';
      this.renderPreview();
    }
  }

  private execute(): void {
    const s = this.input.value.trim();
    if (!s) return;
    const result = this.calc.run(s);
    this.entries.push({ input: s, result });
    this.state.inputs.push(s);
    if (this.state.inputs.length > 60) this.state.inputs.shift();
    this.input.value = '';
    this.cursor = -1;
    this.renderPreview();
    this.renderHistory();
    this.renderVars();
    this.ctx.notifyStateChange();
    this.historyEl.scrollTop = this.historyEl.scrollHeight;
  }

  private toggleKeyboard(): void {
    this.state.keyboard = !this.state.keyboard;
    this.syncKeyboard();
    this.ctx.notifyStateChange();
  }

  private syncKeyboard(): void {
    this.keyboard.hidden = !this.state.keyboard;
    this.kbBtn.classList.toggle('is-active', this.state.keyboard);
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────

  private tex(el: HTMLElement, tex: string, fallback: string): void {
    if (this.katex && tex) {
      try {
        this.katex.render(`\\displaystyle ${tex}`, el, { throwOnError: true, output: 'html' });
        return;
      } catch {
        /* repli sur le texte */
      }
    }
    el.textContent = fallback;
  }

  private renderPreview(): void {
    const s = this.input.value.trim();
    this.preview.classList.toggle('is-empty', !s);
    if (!s) {
      this.preview.replaceChildren();
      return;
    }
    let tex = '';
    try {
      tex = previewTex(s, this.calc);
    } catch {
      tex = '';
    }
    this.preview.classList.toggle('is-invalid', !tex);
    this.tex(this.preview, tex, s);
  }

  private renderHistory(): void {
    if (!this.entries.length) {
      this.historyEl.replaceChildren(h('div', { class: 'calc-empty' },
        h('p', null, 'Calcul exact et approché, calcul formel, unités, complexes et matrices.'),
        h('div', { class: 'calc-examples' }, ...EXAMPLES.map((ex) => h('button', { class: 'chip', onclick: () => { this.input.value = ex; this.execute(); } }, ex))),
      ));
      return;
    }
    this.historyEl.replaceChildren(...this.entries.map((e, i) => this.entryEl(e, i)));
  }

  private entryEl(e: Entry, index: number): HTMLElement {
    const r = e.result;
    const inEl = h('div', { class: 'calc-in' });
    this.tex(inEl, ('inputTex' in r && r.inputTex) || '', e.input);
    const out = h('div', { class: 'calc-out' });
    let note = '';
    if (r.kind === 'error') {
      out.classList.add('is-error');
      out.textContent = r.message;
    } else if (r.kind === 'value') {
      const exact = h('span', { class: 'calc-exact' });
      if (r.exact) this.tex(exact, r.exact.tex, r.exact.text);
      const approx = h('span', { class: 'calc-approx' });
      this.tex(approx, r.approxTex, r.approx);
      if (r.exact && !r.exactIsApprox) out.append(exact, h('span', { class: 'calc-approx-sign' }, '≈'), approx);
      else if (r.exact) out.append(exact);
      else out.append(approx);
    } else {
      this.tex(out, r.tex, r.text);
      note = r.kind === 'symbolic' ? r.note ?? '' : '';
    }
    const actions = h('div', { class: 'calc-actions' },
      h('button', { class: 'btn btn-ghost btn-icon btn-sm', title: 'Reprendre la saisie', 'aria-label': 'Reprendre la saisie', onclick: () => { this.input.value = e.input; this.renderPreview(); this.input.focus(); } }, svgIcon(icon('undo'), 'icon icon-sm')),
      h('button', { class: 'btn btn-ghost btn-icon btn-sm', title: 'Copier en LaTeX', 'aria-label': 'Copier en LaTeX', onclick: () => this.copy(this.entryTex(e)) }, svgIcon(icon('copy'), 'icon icon-sm')),
      h('button', { class: 'btn btn-ghost btn-icon btn-sm', title: 'Supprimer', 'aria-label': 'Supprimer', onclick: () => this.remove(index) }, svgIcon(icon('x'), 'icon icon-sm')),
    );
    return h('div', { class: `calc-entry${r.kind === 'error' ? ' has-error' : ''}` },
      h('div', { class: 'calc-row' }, inEl, actions),
      out,
      note ? h('div', { class: 'calc-note' }, note) : null,
    );
  }

  private entryTex(e: Entry): string {
    const r = e.result;
    const lhs = ('inputTex' in r && r.inputTex) || e.input;
    if (r.kind === 'value') return `${lhs} = ${r.exact?.tex ?? ''}${r.exact && !r.exactIsApprox ? ' \\approx ' : ''}${!r.exact || !r.exactIsApprox ? r.approxTex : ''}`;
    if (r.kind === 'error') return `% ${e.input} : ${r.message}`;
    return r.kind === 'assign' ? r.tex : `${lhs} = ${r.tex}`;
  }

  private copy(text: string): void {
    void navigator.clipboard?.writeText(text).then(() => this.ctx.toast('LaTeX copié', 'success'));
  }

  private copyAll(): void {
    if (!this.entries.length) return;
    this.copy(`\\begin{align*}\n${this.entries.filter((e) => e.result.kind !== 'error').map((e) => `  & ${this.entryTex(e)}`).join(' \\\\\n')}\n\\end{align*}`);
  }

  private remove(index: number): void {
    this.entries.splice(index, 1);
    this.state.inputs.splice(index, 1);
    this.renderHistory();
    this.ctx.notifyStateChange();
  }

  private clearHistory(): void {
    this.entries = [];
    this.state.inputs = [];
    this.calc = new Calculator();
    this.renderHistory();
    this.renderVars();
    this.ctx.notifyStateChange();
  }

  private renderVars(): void {
    const vars = this.calc.variables();
    if (!vars.length) {
      this.varsEl.replaceChildren(h('p', { class: 'hint' }, 'Aucune. Exemple : a = 5 puis a² + 1.'));
      return;
    }
    this.varsEl.replaceChildren(...vars.map((v) => h('div', { class: 'var-item' },
      h('button', { class: 'cat-item', onclick: () => this.insert(v.name, 0) }, h('code', null, v.text)),
      h('button', { class: 'btn btn-ghost btn-icon btn-sm', title: 'Supprimer', 'aria-label': `Supprimer ${v.name}`, onclick: () => { this.calc.remove(v.name); this.renderVars(); } }, svgIcon(icon('x'), 'icon icon-sm')),
    )));
  }

  // ─── Cycle de vie ─────────────────────────────────────────────────────────

  getState(): CalcState {
    return this.state;
  }

  refresh(): void {
    this.renderHistory();
  }

  destroy(): void {
    this.root.remove();
  }
}
