/**
 * Rendu HTML d'une fiche au format A4 : aperçu à l'écran et impression (PDF).
 * Le papier reste blanc quel que soit le thème de l'application.
 */
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { h } from '../../core/dom';
import { richHtml, richInline } from './rich';
import { pointsText, totalPoints, VERSION_LETTERS, type Built, type SheetState } from './sheet';
import { needsRecall, type Exercise, type Item } from './types';

export type ViewMode = 'sheet' | 'answers' | 'both';

const html = (tag: keyof HTMLElementTagNameMap, cls: string, inner: string) => {
  const el = document.createElement(tag);
  el.className = cls;
  el.innerHTML = inner;
  return el;
};

export const inlineTex = (src: string) => richInline(src, katex);

function label(ex: Exercise, i: number): string {
  return ex.numbering === 'num' ? `${i + 1}.` : ex.numbering === 'alpha' ? `${String.fromCharCode(97 + i)})` : '';
}

function itemEl(ex: Exercise, it: Item, i: number, mode: ViewMode): HTMLElement {
  const li = h('li', { class: 'ws-item' });
  if (ex.numbering !== 'none') li.append(h('span', { class: 'ws-label' }, label(ex, i)));
  const body = h('div', { class: 'ws-item-body' });
  if (mode !== 'answers') {
    body.append(html('div', 'ws-q', richHtml(it.q, katex)));
    if (it.fig) body.append(html('div', 'ws-fig', it.fig.svg));
  } else if (needsRecall(it)) {
    body.append(html('div', 'ws-q ws-q-recall', richHtml(it.q, katex)));
  }
  if (mode !== 'sheet') body.append(html('div', mode === 'both' ? 'ws-a ws-a-inline' : 'ws-a', richHtml(it.a, katex)));
  li.append(body);
  return li;
}

function tableEl(rows: string[][]): HTMLElement {
  const table = h('table', { class: 'ws-table' });
  rows.forEach((row, r) => {
    const tr = h('tr');
    row.forEach((cell, c) => tr.append(html(r === 0 || c === 0 ? 'th' : 'td', '', inlineTex(cell))));
    table.append(tr);
  });
  return h('div', { class: 'ws-table-wrap' }, table);
}

function exerciseEl(state: SheetState, b: Built, i: number, mode: ViewMode): HTMLElement {
  const pts = pointsText(b.spec.p);
  const sec = h('section', { class: 'ws-ex', 'data-index': i },
    h('header', { class: 'ws-ex-head' },
      h('span', { class: 'ws-ex-num' }, `Exercice ${i + 1}`),
      state.themes && b.title ? h('span', { class: 'ws-ex-theme' }, b.title) : null,
      pts ? h('span', { class: 'ws-ex-pts' }, pts) : null,
    ),
  );
  if (b.error) {
    sec.append(h('p', { class: 'ws-error' }, `Cet exercice n'a pas pu être généré (${b.error}). Essayez « Nouvelles valeurs ».`));
    return sec;
  }
  const ex = b.ex;
  if (mode !== 'answers') {
    if (ex.intro.trim()) sec.append(html('div', 'ws-intro', richHtml(ex.intro, katex)));
    if (ex.table) sec.append(tableEl(ex.table));
    if (ex.fig) sec.append(html('div', 'ws-fig', ex.fig.svg));
    if (!ex.items.length && !ex.intro.trim()) sec.append(h('p', { class: 'ws-placeholder' }, 'Énoncé à rédiger dans le panneau de composition.'));
  }
  if (ex.answer !== undefined && mode !== 'sheet') {
    sec.append(ex.answer.trim() ? html('div', mode === 'both' ? 'ws-a ws-a-inline' : 'ws-a', richHtml(ex.answer, katex)) : h('p', { class: 'ws-placeholder' }, 'Corrigé non rédigé.'));
  }
  if (ex.items.length) {
    const cols = mode === 'sheet' ? ex.cols : Math.min(ex.cols, 2);
    const hasFig = ex.items.some((it) => it.fig);
    const ol = h('ol', { class: `ws-items cols-${cols}${hasFig && mode !== 'answers' ? ' has-fig' : ''}` });
    ex.items.forEach((it, k) => ol.append(itemEl(ex, it, k, mode)));
    sec.append(ol);
  }
  return sec;
}

/** Une page A4 : en-tête, cartouche, exercices. */
export function renderPage(state: SheetState, built: Built[], version: number, mode: ViewMode): HTMLElement {
  const total = totalPoints(state);
  const answers = mode === 'answers';
  const page = h('article', { class: `ws-page mode-${mode}`, 'aria-label': answers ? 'Corrigé' : 'Fiche' },
    h('header', { class: 'ws-head' },
      h('div', { class: 'ws-head-main' },
        answers ? h('div', { class: 'ws-kicker' }, 'Corrigé') : null,
        h('h1', { class: 'ws-title' }, state.title || 'Fiche d\'exercices'),
        state.subtitle ? h('p', { class: 'ws-subtitle' }, state.subtitle) : null,
      ),
      h('div', { class: 'ws-head-side' },
        state.versions > 1 ? h('span', { class: 'ws-version' }, `Version ${VERSION_LETTERS[version]}`) : null,
        total && !answers ? h('span', { class: 'ws-total' }, `Barème : ${pointsText(total)}`) : null,
      ),
    ),
  );
  if (state.header && !answers) {
    page.append(h('div', { class: 'ws-idcard' },
      h('span', null, 'Nom'), h('span', { class: 'ws-dots' }),
      h('span', null, 'Prénom'), h('span', { class: 'ws-dots' }),
      h('span', null, 'Classe'), h('span', { class: 'ws-dots ws-dots-short' }),
    ));
  }
  built.forEach((b, i) => page.append(exerciseEl(state, b, i, mode)));
  return page;
}
