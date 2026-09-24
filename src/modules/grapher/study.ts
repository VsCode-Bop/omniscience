/** Panneau « Étude » d'une fonction : expression, dérivée formelle, limites, points clés. */
import 'katex/dist/katex.min.css';
import katex from 'katex';
import { h } from '../../core/dom';
import { fmt } from '../../core/math/format';
import { findExtrema, findRoots, findSingularities, limitAtInfinity, type LimitResult } from './analysis';
import type { CompiledRow } from './expr';
import { piLabel } from './ticks';
import type { Viewport } from './viewport';

/** Nombre au format LaTeX français (virgule décimale sans espace parasite). */
function texNum(v: number): string {
  // Multiples simples de π (asymptotes de tan, etc.)
  for (const den of [1, 2, 3, 4, 6]) {
    const k = (v * den) / Math.PI;
    if (Math.abs(k - Math.round(k)) < 1e-9 && Math.round(k) !== 0 && Math.abs(v) > 1e-9) {
      return piLabel(Math.round(k), den).replace('π', '\\pi').replace('\u2212', '-').replace(/(.*)\/(\d+)/, '\\frac{$1}{$2}');
    }
  }
  return fmt(v, 5).replace(/,/g, '{,}').replace('\u2212', '-').replace(/ × 10(.*)$/, (_, e: string) => `\\times 10^{${toPlainExponent(e)}}`);
}

function toPlainExponent(sup: string): string {
  const map: Record<string, string> = { '⁻': '-', '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
  return sup.replace(/./g, (c) => map[c] ?? c);
}

function limitTex(res: LimitResult): string {
  switch (res.kind) {
    case 'value': return texNum(res.value);
    case '+inf': return '+\\infty';
    case '-inf': return '-\\infty';
    case 'none': return '\\text{pas de limite}';
    case 'undefined': return '\\text{non définie}';
    case 'unknown': return '\\text{?}';
  }
}

/** Asymptote oblique y = ax + b en ±∞ : a = lim f(x)/x, b = lim (f(x) − ax). */
function obliqueAsymptote(f: (x: number) => number, dir: 1 | -1): { a: number; b: number } | null {
  const a = limitAtInfinity((x) => f(x) / x, dir);
  if (a.kind !== 'value' || a.value === 0) return null;
  const b = limitAtInfinity((x) => f(x) - a.value * x, dir);
  return b.kind === 'value' ? { a: a.value, b: b.value } : null;
}

function texLine(a: number, b: number): string {
  const ax = a === 1 ? 'x' : a === -1 ? '-x' : `${texNum(a)}x`;
  if (b === 0) return `y = ${ax}`;
  return `y = ${ax} ${b > 0 ? '+' : '-'} ${texNum(Math.abs(b))}`;
}

function tex(src: string, display = false): HTMLElement {
  const el = h('span', { class: 'tex' });
  katex.render(src, el, { throwOnError: false, displayMode: display });
  return el;
}

export function renderStudy(container: HTMLElement, c: CompiledRow, vp: Viewport): void {
  container.replaceChildren();
  if (c.kind !== 'function' || !c.fn) return;
  const f = c.fn;
  const v = c.variable === 'theta' ? '\\theta' : (c.variable ?? 'x');
  const name = c.name ?? 'f';
  const item = (label: string, ...content: (Node | string)[]) =>
    h('div', { class: 'study-item' }, h('span', { class: 'study-label' }, label), h('div', { class: 'study-value' }, ...content));

  if (c.tex) container.append(item('Expression', tex(`${name}(${v}) = ${c.tex}`)));
  container.append(
    item('Dérivée', c.derivTex ? tex(`${name}'(${v}) = ${c.derivTex}`) : h('span', { class: 'muted' }, 'calculée numériquement (pas de forme formelle)')),
  );

  const lMinus = limitAtInfinity(f, -1);
  const lPlus = limitAtInfinity(f, 1);
  container.append(
    item('Limites',
      tex(`\\lim\\limits_{${v} \\to -\\infty} ${name}(${v}) = ${limitTex(lMinus)}`),
      tex(`\\lim\\limits_{${v} \\to +\\infty} ${name}(${v}) = ${limitTex(lPlus)}`),
    ),
  );

  // Asymptotes horizontales (limite finie) ou obliques (y = ax + b) en ±∞.
  const asym: string[] = [];
  const atInf = (dir: 1 | -1, lim: LimitResult): string | null => {
    if (lim.kind === 'value') return `y = ${texNum(lim.value)}`;
    if (lim.kind !== '+inf' && lim.kind !== '-inf') return null;
    const oblique = obliqueAsymptote(f, dir);
    return oblique ? texLine(oblique.a, oblique.b) : null;
  };
  const aPlus = atInf(1, lPlus);
  const aMinus = atInf(-1, lMinus);
  if (aPlus && aPlus === aMinus) asym.push(`${aPlus} \\text{ en } \\pm\\infty`);
  else {
    if (aMinus) asym.push(`${aMinus} \\text{ en } -\\infty`);
    if (aPlus) asym.push(`${aPlus} \\text{ en } +\\infty`);
  }

  const sing = findSingularities(f, vp.xmin, vp.xmax);
  const singItems = sing.map((s) => {
    const x0 = texNum(s.x);
    const parts: string[] = [];
    if (s.left.kind !== 'undefined') parts.push(`\\lim\\limits_{${v} \\to ${x0}^-} ${name}(${v}) = ${limitTex(s.left)}`);
    if (s.right.kind !== 'undefined') parts.push(`\\lim\\limits_{${v} \\to ${x0}^+} ${name}(${v}) = ${limitTex(s.right)}`);
    const vertical = [s.left, s.right].some((l) => l.kind === '+inf' || l.kind === '-inf');
    if (vertical) asym.push(`${v} = ${x0}`);
    return h('div', { class: 'study-sub' }, ...parts.map((p) => tex(p)));
  });
  if (asym.length) container.append(item('Asymptotes', ...asym.map((a) => tex(a))));
  if (singItems.length) container.append(item('Bornes & valeurs interdites', ...singItems));

  const window = `[${fmt(vp.xmin, 3)} ; ${fmt(vp.xmax, 3)}]`;
  const roots = findRoots(f, vp.xmin, vp.xmax);
  container.append(
    item(`Racines sur ${window}`, roots.length ? tex(roots.map((r) => `${v} = ${texNum(r)}`).join(' \\quad ')) : h('span', { class: 'muted' }, 'aucune')),
  );
  const ext = findExtrema(f, vp.xmin, vp.xmax, 800, c.dfn);
  container.append(
    item(`Extremums sur ${window}`,
      ...(ext.length
        ? ext.map((e) => tex(`\\text{${e.kind === 'max' ? 'maximum' : 'minimum'} local } ${texNum(e.y)} \\text{ en } ${v} = ${texNum(e.x)}`))
        : [h('span', { class: 'muted' }, 'aucun')]),
    ),
  );
  container.append(h('p', { class: 'study-note muted' }, 'Résultats obtenus numériquement : ce sont des conjectures à démontrer.'));
}
