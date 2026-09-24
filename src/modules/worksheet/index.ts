/**
 * Module « Générateur de fiches » : composition d'une fiche à partir d'une bibliothèque
 * d'exercices à valeurs aléatoires, versions A/B/C/D, corrigés, aperçu A4, impression
 * (PDF via le navigateur), export LaTeX et Markdown. La graine rend chaque fiche
 * reproductible : le lien de partage redonne exactement les mêmes énoncés.
 */
import './worksheet.css';
import { debounce, dismissable, h, svgIcon } from '../../core/dom';
import { downloadText } from '../../core/export/download';
import { icon } from '../../core/icons';
import type { ModuleContext, ModuleInstance } from '../../core/types';
import { toLatex, toMarkdown } from './export';
import { GENERATORS, GENERATOR_BY_ID, levelsHtml, matchesLevel, PRESETS, type LevelFilter } from './library';
import { isSeed, randomSeed, Rng } from './rng';
import {
  buildVersion, defaultState, MAX_EXERCISES, newSalt, pointsText, sanitize, specFromGenerator, stateFromPreset, totalPoints,
  VERSION_LETTERS, type Built, type ExerciseSpec, type SheetState,
} from './sheet';
import type { Difficulty, Generator } from './types';
import { inlineTex, renderPage, type ViewMode } from './view';

export function mount(container: HTMLElement, ctx: ModuleContext): ModuleInstance {
  return new WorksheetApp(container, ctx);
}

type PrintKind = ViewMode | 'all';

const DIFFICULTY_TITLES = ['Application directe', 'Entraînement', 'Approfondissement'];
const PAPER_W = 794; // 210 mm à 96 dpi
const isPresenting = () => document.documentElement.classList.contains('is-presenting');
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'fiche';

function parsePoints(v: string): number | undefined {
  const n = Number(v.trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.min(100, Math.round(n * 4) / 4) : undefined;
}

class WorksheetApp implements ModuleInstance {
  private state: SheetState;
  private mode: ViewMode = 'sheet';
  private version = 0;
  private built: Built[][] = [];
  private printKind: PrintKind | null = null;
  private printRoot: HTMLElement | null = null;
  private savedTitle = '';
  private closePopover: (() => void) | null = null;
  private collapsedForPresentation = false;
  private readonly root: HTMLElement;
  private readonly listEl: HTMLElement;
  private readonly summaryEl: HTMLElement;
  private readonly pagesEl: HTMLElement;
  private readonly previewEl: HTMLElement;
  private readonly versionBar: HTMLElement;
  private readonly modeBtns = new Map<ViewMode, HTMLButtonElement>();
  private readonly seedInput: HTMLInputElement;
  private readonly versionBtns: HTMLButtonElement[] = [];
  private readonly resizeObserver: ResizeObserver;
  private readonly renderSoon = debounce(() => this.renderPreview(), 140);

  constructor(container: HTMLElement, private readonly ctx: ModuleContext) {
    this.state = sanitize(ctx.initialState) ?? defaultState();

    // ─── Panneau de composition ───────────────────────────────────────────
    const titleIn = h('input', { class: 'input', type: 'text', value: this.state.title, maxlength: 160, placeholder: 'Fiche d\'exercices', 'aria-label': 'Titre de la fiche' });
    titleIn.addEventListener('input', () => {
      this.state.title = titleIn.value;
      this.changed(true);
    });
    const subIn = h('input', { class: 'input', type: 'text', value: this.state.subtitle, maxlength: 160, placeholder: 'Classe, date, chapitre…', 'aria-label': 'Sous-titre' });
    subIn.addEventListener('input', () => {
      this.state.subtitle = subIn.value;
      this.changed(true);
    });
    const option = (key: 'header' | 'themes', text: string) => {
      const input = h('input', { type: 'checkbox', class: 'switch', checked: this.state[key] });
      input.addEventListener('change', () => {
        this.state[key] = input.checked;
        this.changed();
      });
      return h('label', { class: 'option-row' }, h('span', null, text), input);
    };

    this.listEl = h('ol', { class: 'ws-list', 'aria-label': 'Exercices de la fiche' });
    this.summaryEl = h('span', { class: 'ws-summary' });

    this.seedInput = h('input', { class: 'input input-mono ws-seed', type: 'text', value: this.state.seed, maxlength: 16, spellcheck: false, 'aria-label': 'Graine du tirage' });
    this.seedInput.addEventListener('change', () => {
      const v = this.seedInput.value.trim();
      if (isSeed(v)) {
        this.state.seed = v;
        this.changed();
      } else {
        this.seedInput.value = this.state.seed;
      }
    });
    const versionSeg = h('div', { class: 'seg seg-block', role: 'radiogroup', 'aria-label': 'Nombre de versions' },
      ...[1, 2, 3, 4].map((n) => {
        const b = h('button', { class: 'seg-btn', role: 'radio', onclick: () => this.setVersions(n) }, n === 1 ? 'Une' : VERSION_LETTERS.slice(0, n).split('').join(' · '));
        this.versionBtns.push(b);
        return b;
      }),
    );

    const presetsBtn = h('button', { class: 'btn btn-sm', onclick: (e: Event) => this.openPresets(e.currentTarget as HTMLElement) }, svgIcon(icon('book'), 'icon icon-sm'), 'Modèles');
    const panel = h('aside', { class: 'panel ws-panel', 'aria-label': 'Composition de la fiche' },
      h('div', { class: 'panel-header' },
        h('h2', null, 'Composer la fiche'),
        h('div', { class: 'panel-header-actions popover-anchor' },
          presetsBtn,
          h('button', { class: 'btn btn-sm btn-primary ws-only-narrow', onclick: () => this.setPane('preview') }, 'Aperçu'),
        ),
      ),
      h('div', { class: 'panel-scroll' },
        h('section', { class: 'panel-section' },
          h('div', { class: 'section-title' }, 'Document'),
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Titre'), titleIn),
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Sous-titre'), subIn),
          h('div', { class: 'ws-options' }, option('header', 'Cartouche nom, prénom, classe'), option('themes', 'Thème de chaque exercice')),
        ),
        h('section', { class: 'panel-section' },
          h('div', { class: 'section-title' }, h('span', null, 'Exercices'), this.summaryEl),
          this.listEl,
          h('div', { class: 'ws-add-row' },
            h('button', { class: 'btn btn-primary', onclick: () => this.openLibrary() }, svgIcon(icon('plus')), 'Ajouter un exercice'),
            h('button', { class: 'btn', title: 'Exercice rédigé librement, formules entre $…$', onclick: () => this.addFree() }, svgIcon(icon('worksheet')), 'Texte libre'),
          ),
        ),
        h('section', { class: 'panel-section' },
          h('div', { class: 'section-title' }, 'Tirage aléatoire'),
          h('div', { class: 'ws-seed-row' },
            h('label', { class: 'field ws-seed-field' }, h('span', { class: 'field-label' }, 'Graine'), this.seedInput),
            h('button', { class: 'btn', onclick: () => this.reroll() }, svgIcon(icon('rotate')), 'Nouveaux nombres'),
          ),
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Versions'), versionSeg),
          h('p', { class: 'hint' }, 'Chaque version reprend les mêmes exercices avec d\'autres valeurs, pour limiter la copie entre voisins. La graine rend la fiche reproductible : le lien de partage redonne exactement les mêmes énoncés.'),
        ),
      ),
    );

    // ─── Aperçu ───────────────────────────────────────────────────────────
    const modes: [ViewMode, string][] = [['sheet', 'Énoncé'], ['answers', 'Corrigé'], ['both', 'Les deux']];
    const modeSeg = h('div', { class: 'seg ws-mode', role: 'radiogroup', 'aria-label': 'Affichage' },
      ...modes.map(([m, text]) => {
        const b = h('button', { class: 'seg-btn', role: 'radio', onclick: () => this.setMode(m) }, text);
        this.modeBtns.set(m, b);
        return b;
      }),
    );
    this.versionBar = h('div', { class: 'seg ws-versions', role: 'tablist', 'aria-label': 'Version affichée' });
    const exportBtn = h('button', { class: 'btn btn-sm', onclick: (e: Event) => this.openExport(e.currentTarget as HTMLElement) }, svgIcon(icon('download'), 'icon icon-sm'), h('span', { class: 'ws-hide-sm' }, 'Exporter'), svgIcon(icon('chevronDown'), 'icon icon-sm'));
    const toolbar = h('div', { class: 'ws-toolbar' },
      h('button', { class: 'btn btn-ghost btn-sm ws-only-narrow', onclick: () => this.setPane('compose') }, svgIcon(icon('chevronLeft'), 'icon icon-sm'), 'Composer'),
      modeSeg,
      this.versionBar,
      h('div', { class: 'ws-spacer' }),
      h('button', { class: 'btn btn-ghost btn-sm', title: 'Tirer de nouvelles valeurs pour tous les exercices', onclick: () => this.reroll() }, svgIcon(icon('rotate'), 'icon icon-sm'), h('span', { class: 'ws-hide-sm' }, 'Nouveaux nombres')),
      h('div', { class: 'popover-anchor' }, exportBtn),
      h('button', { class: 'btn btn-sm btn-primary', title: 'Imprimer ou enregistrer en PDF', onclick: () => this.print() }, svgIcon(icon('worksheet'), 'icon icon-sm'), h('span', null, 'Imprimer'), h('span', { class: 'ws-hide-sm ws-pdf' }, '/ PDF')),
    );
    this.pagesEl = h('div', { class: 'ws-pages' });
    this.previewEl = h('div', { class: 'ws-preview' }, this.pagesEl);
    const main = h('section', { class: 'ws-main', 'aria-label': 'Aperçu de la fiche' }, toolbar, this.previewEl);

    this.root = h('div', { class: 'workspace ws', 'data-pane': 'compose' }, panel, main);
    container.appendChild(this.root);

    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(this.previewEl);
    window.addEventListener('beforeprint', this.onBeforePrint);
    window.addEventListener('afterprint', this.onAfterPrint);

    this.syncControls();
    this.renderList();
    this.renderPreview();
    if (isPresenting()) this.refresh();
  }

  // ─── État ─────────────────────────────────────────────────────────────────

  private changed(soon = false): void {
    this.ctx.notifyStateChange();
    if (soon) this.renderSoon();
    else this.renderPreview();
  }

  private syncControls(): void {
    this.seedInput.value = this.state.seed;
    this.versionBtns.forEach((b, i) => {
      b.classList.toggle('is-active', i + 1 === this.state.versions);
      b.setAttribute('aria-checked', String(i + 1 === this.state.versions));
    });
    for (const [m, b] of this.modeBtns) {
      b.classList.toggle('is-active', m === this.mode);
      b.setAttribute('aria-checked', String(m === this.mode));
    }
    if (this.version >= this.state.versions) this.version = 0;
    this.versionBar.replaceChildren(...VERSION_LETTERS.slice(0, this.state.versions).split('').map((L, i) => h('button', {
      class: `seg-btn${i === this.version ? ' is-active' : ''}`,
      role: 'tab',
      'aria-selected': String(i === this.version),
      title: `Version ${L}`,
      onclick: () => {
        this.version = i;
        this.syncControls();
        this.renderPreview();
      },
    }, L)));
    this.versionBar.hidden = this.state.versions < 2;
  }

  private setMode(m: ViewMode): void {
    this.mode = m;
    this.syncControls();
    this.renderPreview();
  }

  private setVersions(n: number): void {
    this.state.versions = n;
    this.syncControls();
    this.changed();
  }

  private setPane(p: 'compose' | 'preview'): void {
    this.root.dataset.pane = p;
    if (p === 'preview') requestAnimationFrame(() => this.fit());
  }

  private reroll(): void {
    this.state.seed = randomSeed();
    this.syncControls();
    this.changed();
  }

  private loadPreset(i: number): void {
    this.state = stateFromPreset(PRESETS[i]);
    this.version = 0;
    const [title, sub] = this.root.querySelectorAll<HTMLInputElement>('.ws-panel .field .input');
    title.value = this.state.title;
    sub.value = this.state.subtitle;
    for (const input of this.root.querySelectorAll<HTMLInputElement>('.ws-options .switch')) input.checked = true;
    this.syncControls();
    this.renderList();
    this.changed();
    this.ctx.toast(`Modèle « ${PRESETS[i].title} » chargé.`, 'success');
  }

  private add(spec: ExerciseSpec): boolean {
    if (this.state.exercises.length >= MAX_EXERCISES) {
      this.ctx.toast(`Une fiche compte au plus ${MAX_EXERCISES} exercices.`, 'error');
      return false;
    }
    this.state.exercises.push(spec);
    this.renderList();
    this.changed();
    return true;
  }

  private addFree(): void {
    if (this.add({ g: 'libre', n: 1, d: 1, s: 0, title: 'Problème', text: 'Rédigez ici l\'énoncé. Les formules s\'écrivent entre dollars : $f(x) = x^2 - 3x + 1$.', answer: '' })) {
      requestAnimationFrame(() => this.listEl.lastElementChild?.querySelector<HTMLTextAreaElement>('textarea')?.focus());
    }
  }

  // ─── Liste des exercices ──────────────────────────────────────────────────

  private renderList(): void {
    const n = this.state.exercises.length;
    const total = totalPoints(this.state);
    this.summaryEl.textContent = `${n} exercice${n > 1 ? 's' : ''}${total ? ` · ${pointsText(total)}` : ''}`;
    this.listEl.replaceChildren(...this.state.exercises.map((spec, i) => this.cardEl(spec, i)));
    if (!n) this.listEl.append(h('li', { class: 'ws-list-empty' }, 'Aucun exercice. Ajoutez-en depuis la bibliothèque ou chargez un modèle de fiche.'));
  }

  private cardEl(spec: ExerciseSpec, i: number): HTMLElement {
    const gen = GENERATOR_BY_ID.get(spec.g);
    const last = this.state.exercises.length - 1;
    const act = (name: string, label: string, run: () => void, disabled = false, cls = '') =>
      h('button', { class: `btn btn-ghost btn-icon btn-sm ${cls}`, title: label, 'aria-label': label, disabled, onclick: run }, svgIcon(icon(name), 'icon icon-sm'));
    const move = (delta: number) => {
      const ex = this.state.exercises;
      [ex[i], ex[i + delta]] = [ex[i + delta], ex[i]];
      this.renderList();
      this.changed();
    };
    const actions = h('div', { class: 'ws-card-actions' },
      act('chevronDown', 'Monter', () => move(-1), i === 0, 'ws-up'),
      act('chevronDown', 'Descendre', () => move(1), i === last),
      gen ? act('rotate', 'Nouvelles valeurs pour cet exercice', () => {
        spec.s = newSalt();
        this.changed();
      }) : null,
      act('trash', 'Retirer l\'exercice', () => {
        this.state.exercises.splice(i, 1);
        this.renderList();
        this.changed();
      }, false, 'btn-danger'),
    );
    const pts = h('input', { class: 'input input-sm ws-pts', type: 'text', inputmode: 'decimal', value: spec.p ? String(spec.p).replace('.', ',') : '', placeholder: '—', 'aria-label': 'Barème (points)' });
    pts.addEventListener('change', () => {
      const p = parsePoints(pts.value);
      if (p) spec.p = p;
      else delete spec.p;
      pts.value = spec.p ? String(spec.p).replace('.', ',') : '';
      this.renderList();
      this.changed();
    });
    const ptsField = h('label', { class: 'ws-pts-field', title: 'Barème' }, pts, h('span', null, 'pts'));

    if (!gen) {
      const title = h('input', { class: 'input input-sm ws-free-title', type: 'text', value: spec.title ?? '', maxlength: 120, placeholder: 'Titre (facultatif)', 'aria-label': 'Titre de l\'exercice' });
      title.addEventListener('input', () => {
        spec.title = title.value;
        this.changed(true);
      });
      const area = (key: 'text' | 'answer', placeholder: string, rows: number) => {
        const ta = h('textarea', { class: 'input ws-textarea', rows, maxlength: 4000, placeholder, spellcheck: true, 'aria-label': key === 'text' ? 'Énoncé' : 'Corrigé' });
        ta.value = spec[key] ?? '';
        ta.addEventListener('input', () => {
          spec[key] = ta.value;
          this.changed(true);
        });
        return ta;
      };
      return h('li', { class: 'ws-card ws-card-free' },
        h('div', { class: 'ws-card-head' }, h('span', { class: 'ws-card-num' }, String(i + 1)), title, actions),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Énoncé'), area('text', 'Énoncé ; formules entre $…$, ligne vide = nouveau paragraphe', 5)),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Corrigé'), area('answer', 'Corrigé (facultatif)', 3)),
        h('div', { class: 'ws-card-controls' }, h('span', { class: 'ws-free-hint' }, 'Ex. : $\\dfrac{1}{2}$, $\\sqrt{2}$, $x^2$'), ptsField),
      );
    }

    const count = h('span', { class: 'ws-count' }, String(spec.n));
    const step = (delta: number) => {
      const v = Math.min(gen.count[1], Math.max(gen.count[0], spec.n + delta));
      if (v === spec.n) return;
      spec.n = v;
      count.textContent = String(v);
      minus.disabled = v <= gen.count[0];
      plus.disabled = v >= gen.count[1];
      this.changed();
    };
    const minus = h('button', { class: 'ws-step', 'aria-label': 'Moins de questions', disabled: spec.n <= gen.count[0], onclick: () => step(-1) }, svgIcon(icon('minus'), 'icon icon-sm'));
    const plus = h('button', { class: 'ws-step', 'aria-label': 'Plus de questions', disabled: spec.n >= gen.count[1], onclick: () => step(1) }, svgIcon(icon('plus'), 'icon icon-sm'));
    const diff = h('div', { class: 'seg seg-sm ws-diff', role: 'radiogroup', 'aria-label': 'Difficulté' },
      ...([1, 2, 3] as Difficulty[]).map((d) => {
        const b = h('button', { class: `seg-btn${d === spec.d ? ' is-active' : ''}`, role: 'radio', 'aria-checked': String(d === spec.d), title: DIFFICULTY_TITLES[d - 1] }, h('span', { class: 'ws-dots-diff', 'data-level': d }));
        b.addEventListener('click', () => {
          spec.d = d;
          for (const other of diff.querySelectorAll('.seg-btn')) {
            other.classList.toggle('is-active', other === b);
            other.setAttribute('aria-checked', String(other === b));
          }
          diffLabel.textContent = DIFFICULTY_TITLES[d - 1];
          this.changed();
        });
        return b;
      }),
    );
    const diffLabel = h('span', { class: 'ws-diff-label' }, DIFFICULTY_TITLES[spec.d - 1]);
    const meta = h('small');
    meta.innerHTML = `${levelsHtml(gen.levels)} · ${gen.theme}`;
    return h('li', { class: `ws-card subject-${gen.subject}` },
      h('div', { class: 'ws-card-head' },
        h('span', { class: 'ws-card-num' }, String(i + 1)),
        h('div', { class: 'ws-card-title' }, h('strong', null, gen.title), meta),
        actions,
      ),
      h('div', { class: 'ws-card-controls' },
        h('div', { class: 'ws-stepper', title: 'Nombre de questions' }, minus, count, plus, h('span', { class: 'ws-count-label' }, gen.countLabel ?? 'questions')),
        h('div', { class: 'ws-diff-wrap' }, diff, diffLabel),
        ptsField,
      ),
    );
  }

  // ─── Aperçu ───────────────────────────────────────────────────────────────

  private renderPreview(): void {
    this.built = Array.from({ length: this.state.versions }, (_, v) => buildVersion(this.state, v));
    const scroll = this.previewEl.scrollTop;
    if (!this.state.exercises.length) {
      this.pagesEl.replaceChildren(h('div', { class: 'ws-page ws-page-empty' },
        h('div', { class: 'ws-empty' },
          svgIcon(icon('worksheet'), 'icon ws-empty-icon'),
          h('h2', null, 'Une fiche vide'),
          h('p', null, 'Ajoutez des exercices depuis la bibliothèque : valeurs tirées au hasard, corrigés rédigés, versions A et B pour limiter la copie.'),
          h('div', { class: 'ws-empty-actions' },
            h('button', { class: 'btn btn-primary', onclick: () => this.openLibrary() }, svgIcon(icon('plus')), 'Ouvrir la bibliothèque'),
            h('button', { class: 'btn', onclick: () => this.loadPreset(0) }, 'Charger un modèle'),
          ),
        ),
      ));
    } else {
      this.pagesEl.replaceChildren(renderPage(this.state, this.built[this.version], this.version, this.mode));
    }
    this.previewEl.scrollTop = scroll;
    this.fit();
  }

  private fit(): void {
    const narrow = this.previewEl.clientWidth < 700;
    const avail = this.previewEl.clientWidth - (narrow ? 20 : 64);
    const z = Math.max(0.3, Math.min(isPresenting() ? 1.6 : 1, avail / PAPER_W));
    this.pagesEl.style.zoom = String(Math.round(z * 1000) / 1000);
  }

  // ─── Impression et exports ────────────────────────────────────────────────

  private print(kind: PrintKind = this.mode): void {
    if (!this.state.exercises.length) {
      this.ctx.toast('La fiche est vide : ajoutez d\'abord des exercices.', 'error');
      return;
    }
    this.printKind = kind;
    window.print();
  }

  /** Avant toute impression (bouton, Ctrl+P ou menu du navigateur) : pages A4 seules. */
  private readonly onBeforePrint = () => {
    if (!this.root.isConnected || !this.state.exercises.length) return;
    const kind = this.printKind ?? this.mode;
    this.printKind = null;
    if (this.printRoot) this.printRoot.remove();
    else this.savedTitle = document.title;
    const root = h('div', { class: 'ws-print-root' });
    const built = Array.from({ length: this.state.versions }, (_, v) => buildVersion(this.state, v));
    const pages = (mode: ViewMode) => built.forEach((b, v) => root.append(renderPage(this.state, b, v, mode)));
    if (kind === 'all') {
      pages('sheet');
      pages('answers');
    } else {
      pages(kind);
    }
    document.body.append(root);
    this.printRoot = root;
    document.documentElement.classList.add('ws-printing');
    document.title = `${this.state.title || 'Fiche'}${kind === 'answers' ? ' — corrigé' : ''}`;
  };

  private readonly onAfterPrint = () => {
    if (!this.printRoot) return;
    this.printRoot.remove();
    this.printRoot = null;
    document.documentElement.classList.remove('ws-printing');
    document.title = this.savedTitle;
  };

  private allVersions(): Built[][] {
    return Array.from({ length: this.state.versions }, (_, v) => buildVersion(this.state, v));
  }

  private exportFile(kind: 'tex' | 'md'): void {
    if (!this.state.exercises.length) {
      this.ctx.toast('La fiche est vide.', 'error');
      return;
    }
    const versions = this.allVersions();
    const name = `${slug(this.state.title)}-${this.state.seed}`;
    if (kind === 'tex') downloadText(toLatex(this.state, versions), `${name}.tex`, 'application/x-tex');
    else downloadText(toMarkdown(this.state, versions), `${name}.md`, 'text/markdown');
  }

  private async copyLatex(): Promise<void> {
    try {
      await navigator.clipboard.writeText(toLatex(this.state, this.allVersions()));
      this.ctx.toast('Code LaTeX copié dans le presse-papiers.', 'success');
    } catch {
      this.ctx.toast('Copie impossible : utilisez l\'export .tex.', 'error');
    }
  }

  // ─── Menus ────────────────────────────────────────────────────────────────

  private popover(anchor: HTMLElement, build: (close: () => void) => HTMLElement, align: 'left' | 'right' = 'right'): void {
    const wasOpenHere = this.closePopover && anchor.parentElement?.querySelector('.menu');
    this.closePopover?.();
    if (wasOpenHere) return;
    const close = () => this.closePopover?.();
    const menu = build(close);
    menu.classList.add('menu');
    if (align === 'left') menu.classList.add('menu-left');
    anchor.parentElement!.append(menu);
    this.closePopover = dismissable(menu, () => {
      menu.remove();
      this.closePopover = null;
    }, anchor);
  }

  private openExport(anchor: HTMLElement): void {
    const item = (ic: string, title: string, sub: string, run: () => void, close: () => void) =>
      h('button', { class: 'menu-item', role: 'menuitem', onclick: () => { close(); run(); } }, svgIcon(icon(ic)), h('strong', null, title), h('small', null, sub));
    const n = this.state.versions;
    const vs = n > 1 ? `les ${n} versions` : 'la fiche';
    this.popover(anchor, (close) => h('div', { role: 'menu', class: 'ws-export-menu' },
      h('div', { class: 'menu-label' }, 'Imprimer ou enregistrer en PDF'),
      item('worksheet', 'Fiches élèves', `Énoncés de ${vs}`, () => this.print('sheet'), close),
      item('check', 'Corrigés', `Corrigés de ${vs}`, () => this.print('answers'), close),
      item('copy', 'Fiches puis corrigés', 'Tout le dossier en un seul document', () => this.print('all'), close),
      h('div', { class: 'menu-label' }, 'Fichiers modifiables'),
      item('download', 'Document LaTeX (.tex)', 'Énoncés et corrigés, figures TikZ, pdfLaTeX', () => this.exportFile('tex'), close),
      item('download', 'Markdown (.md)', 'ENT, Pandoc, Obsidian, Typora…', () => this.exportFile('md'), close),
      item('copy', 'Copier le code LaTeX', 'Pour Overleaf ou un document existant', () => void this.copyLatex(), close),
      h('p', { class: 'ws-menu-hint' }, 'Pour un PDF, choisissez « Enregistrer au format PDF » comme imprimante.'),
    ), 'right');
  }

  private openPresets(anchor: HTMLElement): void {
    const group = (subject: 'maths' | 'physique', title: string, close: () => void) => [
      h('div', { class: 'menu-label' }, title),
      ...PRESETS.map((p, i) => [p, i] as const).filter(([p]) => p.subject === subject).map(([p, i]) => {
        const small = h('small');
        small.textContent = `${p.subtitle} · ${p.exercises.length} exercices`;
        return h('button', { class: 'menu-item', role: 'menuitem', onclick: () => { close(); this.loadPreset(i); } },
          svgIcon(icon(subject === 'maths' ? 'graph' : 'circuit')), h('strong', null, p.title), small);
      }),
    ];
    this.popover(anchor, (close) => h('div', { role: 'menu', class: 'ws-presets-menu' },
      ...group('maths', 'Mathématiques', close),
      ...group('physique', 'Physique-chimie', close),
      h('p', { class: 'ws-menu-hint' }, 'Le modèle remplace la fiche en cours (valeurs tirées au hasard).'),
    ), 'right');
  }

  // ─── Bibliothèque ─────────────────────────────────────────────────────────

  private openLibrary(): void {
    this.closePopover?.();
    const dialog = h('dialog', { class: 'dialog ws-lib', 'aria-labelledby': 'ws-lib-title' });
    let subject: 'all' | 'maths' | 'physique' = 'all';
    let level: LevelFilter = 'all';
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Rechercher : fractions, dérivée, Ohm…', 'aria-label': 'Rechercher un exercice' });
    const footCount = h('span', { class: 'ws-lib-count' });
    const updateCount = () => {
      const n = this.state.exercises.length;
      footCount.textContent = `${n} exercice${n > 1 ? 's' : ''} dans la fiche`;
    };
    const addedCount = new Map<string, number>();
    const cards = new Map<Generator, HTMLElement>();

    const sample = (g: Generator): string => {
      try {
        const ex = g.generate(new Rng(`apercu-${g.id}`), g.count[0], 2);
        const src = ex.numbering === 'num' && ex.intro ? ex.intro : ex.items[0]?.q ?? ex.intro;
        return inlineTex(src.split('\n\n')[0]);
      } catch {
        return '';
      }
    };

    const cardFor = (g: Generator) => {
      const badge = h('span', { class: 'lib-added', hidden: true });
      const levels = h('span', { class: 'lib-levels' });
      levels.innerHTML = levelsHtml(g.levels);
      const sampleEl = h('div', { class: 'lib-sample' });
      sampleEl.innerHTML = sample(g);
      const card = h('button', {
        class: `lib-card subject-${g.subject}`,
        'data-search': `${g.title} ${g.theme} ${g.desc}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(),
        onclick: () => {
          if (!this.add(specFromGenerator(g))) return;
          const k = (addedCount.get(g.id) ?? 0) + 1;
          addedCount.set(g.id, k);
          badge.hidden = false;
          badge.textContent = k > 1 ? `Ajouté ×${k}` : 'Ajouté';
          card.classList.add('is-added');
          updateCount();
        },
      },
        h('div', { class: 'lib-card-top' }, h('span', { class: 'lib-subject' }, g.subject === 'maths' ? 'Maths' : 'Physique-chimie'), levels, badge),
        h('strong', { class: 'lib-title' }, g.title),
        h('p', { class: 'lib-desc' }, g.desc),
        sampleEl,
        h('span', { class: 'lib-cta' }, svgIcon(icon('plus'), 'icon icon-sm'), 'Ajouter'),
      );
      cards.set(g, card);
      return card;
    };

    const themes = [...new Set(GENERATORS.map((g) => `${g.subject}|${g.theme}`))];
    const sections = themes.map((key) => {
      const [subj, theme] = key.split('|');
      const gens = GENERATORS.filter((g) => g.subject === subj && g.theme === theme);
      return h('section', { class: 'lib-section', 'data-key': key },
        h('h3', null, h('span', { class: `lib-dot subject-${subj}` }), theme, h('small', null, subj === 'maths' ? 'Mathématiques' : 'Physique-chimie')),
        h('div', { class: 'lib-grid' }, ...gens.map(cardFor)),
      );
    });
    const empty = h('p', { class: 'lib-empty', hidden: true }, 'Aucun exercice ne correspond à cette recherche.');

    const apply = () => {
      const q = search.value.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      let any = false;
      for (const [g, card] of cards) {
        const ok = (subject === 'all' || g.subject === subject) && matchesLevel(g, level) && (!q || (card.dataset.search ?? '').includes(q));
        card.hidden = !ok;
      }
      for (const s of sections) {
        const visible = [...s.querySelectorAll<HTMLElement>('.lib-card')].some((c) => !c.hidden);
        s.hidden = !visible;
        any ||= visible;
      }
      empty.hidden = any;
    };
    search.addEventListener('input', apply);

    const segs = <T extends string>(opts: [T, string][], get: () => T, set: (v: T) => void, label: string) => {
      const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
      const sync = () => {
        for (const b of wrap.children) {
          const on = (b as HTMLElement).dataset.v === get();
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-checked', String(on));
        }
      };
      for (const [v, text] of opts) {
        const b = h('button', { class: 'seg-btn', role: 'radio', 'data-v': v, onclick: () => { set(v); sync(); apply(); } });
        b.innerHTML = `<span>${text}</span>`;
        wrap.append(b);
      }
      sync();
      return wrap;
    };

    const close = () => dialog.close();
    dialog.append(
      h('div', { class: 'dialog-head' },
        h('div', null,
          h('h2', { id: 'ws-lib-title' }, 'Bibliothèque d\'exercices'),
          h('p', null, `${GENERATORS.length} modèles à valeurs aléatoires, avec corrigés rédigés. Cliquez sur une carte pour l'ajouter à la fiche.`),
        ),
        h('button', { class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Fermer', onclick: close }, svgIcon(icon('x'))),
      ),
      h('div', { class: 'lib-filters' },
        h('div', { class: 'lib-search' }, svgIcon(icon('search'), 'icon icon-sm'), search),
        segs([['all', 'Tout'], ['maths', 'Maths'], ['physique', 'Physique-chimie']], () => subject, (v) => (subject = v), 'Discipline'),
        segs([['all', 'Tous niveaux'], ['college', 'Collège'], ['2de', '2<sup>de</sup>'], ['1re', '1<sup>re</sup>'], ['Tle', 'T<sup>le</sup>']], () => level, (v) => (level = v), 'Niveau'),
      ),
      h('div', { class: 'lib-body' }, ...sections, empty),
      h('div', { class: 'lib-foot' }, footCount, h('button', { class: 'btn btn-primary', onclick: close }, 'Terminé')),
    );
    updateCount();
    dialog.addEventListener('close', () => dialog.remove());
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) close();
    });
    document.body.append(dialog);
    dialog.showModal();
    search.focus();
  }

  // ─── Cycle de vie ─────────────────────────────────────────────────────────

  getState(): SheetState {
    return this.state;
  }

  refresh(): void {
    const presenting = isPresenting();
    if (presenting && !this.root.classList.contains('panel-collapsed')) {
      this.root.classList.add('panel-collapsed');
      this.collapsedForPresentation = true;
    } else if (!presenting && this.collapsedForPresentation) {
      this.root.classList.remove('panel-collapsed');
      this.collapsedForPresentation = false;
    }
    this.fit();
  }

  destroy(): void {
    this.closePopover?.();
    this.resizeObserver.disconnect();
    window.removeEventListener('beforeprint', this.onBeforePrint);
    window.removeEventListener('afterprint', this.onAfterPrint);
    this.onAfterPrint();
    this.root.remove();
  }
}
