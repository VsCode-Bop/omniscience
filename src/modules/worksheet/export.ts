/**
 * Exports texte d'une fiche : document LaTeX complet (compilable avec pdfLaTeX, figures
 * en TikZ) et Markdown (formules $…$, figures SVG intégrées). Énoncés de chaque version,
 * puis corrigés.
 */
import { latexText, richLatex, richMarkdown } from './rich';
import { pointsText, VERSION_LETTERS, type Built, type SheetState } from './sheet';
import { needsRecall, type Exercise } from './types';

export type ExportPart = 'sheet' | 'answers' | 'both';

const heading = (state: SheetState, b: Built, i: number) =>
  `Exercice ${i + 1}${state.themes && b.title ? ` — ${b.title}` : ''}`;

// ─── LaTeX ─────────────────────────────────────────────────────────────────

const PREAMBLE = String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[french]{babel}
\usepackage{lmodern}
\usepackage{amsmath,amssymb}
\usepackage[a4paper,margin=1.8cm]{geometry}
\usepackage{enumitem}
\usepackage{multicol}
\usepackage{tikz}
\usepackage{array}
\usepackage{xcolor}
\setlength{\parindent}{0pt}
\setlength{\parskip}{4pt}
\setlist[enumerate]{itemsep=7pt,topsep=4pt}
\setlength{\multicolsep}{4pt}
\newcommand{\exercice}[2]{\par\bigskip\noindent{\large\bfseries #1}\hfill{\small #2}\par\nopagebreak\smallskip}
\newcommand{\entete}[3]{\noindent{\LARGE\bfseries #1}\hfill{\large\bfseries #3}\par\smallskip\noindent{\large #2}\par\medskip\hrule\medskip}
\newcommand{\cartouche}{\noindent Nom : \makebox[5.2cm]{\dotfill}\quad Prénom : \makebox[4.4cm]{\dotfill}\quad Classe : \makebox[2cm]{\dotfill}\par\medskip}`;

function latexTable(rows: string[][]): string {
  const cols = Math.max(...rows.map((r) => r.length));
  const spec = `|l|${'c|'.repeat(cols - 1)}`;
  const body = rows.map((r, i) => `${r.map((c) => richLatex(c)).join(' & ')} \\\\ \\hline${i === 0 ? '\\hline' : ''}`).join('\n');
  return `\\begin{center}\n\\begin{tabular}{${spec}}\n\\hline\n${body}\n\\end{tabular}\n\\end{center}`;
}

const figLatex = (tikz: string) => `\\begin{center}\n${tikz}\n\\end{center}`;

function latexList(ex: Exercise, answers: boolean): string {
  const label = ex.numbering === 'num' ? 'label=\\arabic*.' : 'label=\\alph*)';
  const items = ex.items.map((it) => {
    const recall = answers && needsRecall(it) ? `{\\color{gray}${richLatex(it.q)}}\\\\\n` : '';
    const body = answers ? recall + richLatex(it.a) : richLatex(it.q) + (it.fig ? `\n${figLatex(it.fig.tikz)}` : '');
    return `  \\item ${body}`;
  });
  if (ex.numbering === 'none') return items.map((s) => s.replace(/^ {2}\\item /, '')).join('\n\n');
  const list = `\\begin{enumerate}[${label}]\n${items.join('\n')}\n\\end{enumerate}`;
  const cols = answers ? Math.min(ex.cols, 2) : ex.cols;
  return cols > 1 && !ex.items.some((it) => it.fig && !answers) ? `\\begin{multicols}{${cols}}\n${list}\n\\end{multicols}` : list;
}

function latexExercise(state: SheetState, b: Built, i: number, answers: boolean): string {
  const out = [`\\exercice{${latexText(heading(state, b, i))}}{${latexText(pointsText(b.spec.p) ? `(${pointsText(b.spec.p)})` : '')}}`];
  if (answers) {
    if (b.ex.answer !== undefined) out.push(richLatex(b.ex.answer) || '\\emph{Corrigé non rédigé.}');
    if (b.ex.items.length) out.push(latexList(b.ex, true));
    return out.join('\n');
  }
  if (b.ex.intro.trim()) out.push(richLatex(b.ex.intro));
  if (b.ex.table) out.push(latexTable(b.ex.table));
  if (b.ex.fig) out.push(figLatex(b.ex.fig.tikz));
  if (b.ex.items.length) out.push(latexList(b.ex, false));
  return out.join('\n');
}

function latexSheet(state: SheetState, built: Built[], version: number, answers: boolean): string {
  const tag = state.versions > 1 ? `Version ${VERSION_LETTERS[version]}` : '';
  const title = answers ? `Corrigé — ${state.title}` : state.title;
  return [
    `\\entete{${latexText(title)}}{${latexText(state.subtitle)}}{${tag}}`,
    !answers && state.header ? '\\cartouche' : '',
    ...built.map((b, i) => latexExercise(state, b, i, answers)),
  ].filter(Boolean).join('\n\n');
}

export function toLatex(state: SheetState, versions: Built[][], part: ExportPart = 'both'): string {
  const pages: string[] = [];
  if (part !== 'answers') versions.forEach((b, v) => pages.push(latexSheet(state, b, v, false)));
  if (part !== 'sheet') versions.forEach((b, v) => pages.push(latexSheet(state, b, v, true)));
  return [
    `% ${state.title} — fiche générée avec OmniScience (graine ${state.seed})`,
    PREAMBLE,
    '\\begin{document}',
    pages.join('\n\n\\newpage\n\n'),
    '\\end{document}',
    '',
  ].join('\n');
}

// ─── Markdown ──────────────────────────────────────────────────────────────

function svgDataUri(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return `data:image/svg+xml;base64,${btoa(bin)}`;
}

function mdTable(rows: string[][]): string {
  const line = (r: string[]) => `| ${r.map((c) => richMarkdown(c).replace(/\|/g, '\\|')).join(' | ')} |`;
  return [line(rows[0]), `|${rows[0].map(() => ' --- ').join('|')}|`, ...rows.slice(1).map(line)].join('\n');
}

function mdLabel(ex: Exercise, i: number): string {
  return ex.numbering === 'num' ? `${i + 1}.` : ex.numbering === 'alpha' ? `${String.fromCharCode(97 + i)})` : '';
}

function mdExercise(state: SheetState, b: Built, i: number, answers: boolean): string {
  const pts = pointsText(b.spec.p);
  const out = [`## ${heading(state, b, i)}${pts ? ` *(${pts})*` : ''}`];
  if (answers) {
    if (b.ex.answer !== undefined) out.push(richMarkdown(b.ex.answer) || '*Corrigé non rédigé.*');
  } else {
    if (b.ex.intro.trim()) out.push(richMarkdown(b.ex.intro));
    if (b.ex.table) out.push(mdTable(b.ex.table));
    if (b.ex.fig) out.push(`![Figure](${svgDataUri(b.ex.fig.svg)})`);
  }
  if (b.ex.items.length) {
    out.push(b.ex.items.map((it, k) => {
      const recall = answers && needsRecall(it) ? `*${richMarkdown(it.q)}*  \n` : '';
      const body = (recall + richMarkdown(answers ? it.a : it.q)).replace(/\n/g, '\n  ');
      const fig = !answers && it.fig ? `\n\n  ![Figure](${svgDataUri(it.fig.svg)})` : '';
      return `- **${mdLabel(b.ex, k)}** ${body}${fig}`;
    }).join('\n'));
  }
  return out.join('\n\n');
}

function mdSheet(state: SheetState, built: Built[], version: number, answers: boolean): string {
  const tag = state.versions > 1 ? ` — version ${VERSION_LETTERS[version]}` : '';
  return [
    `# ${answers ? 'Corrigé — ' : ''}${state.title}${tag}`,
    state.subtitle ? `*${state.subtitle}*` : '',
    !answers && state.header ? 'Nom : ……………………… Prénom : ……………………… Classe : ………' : '',
    ...built.map((b, i) => mdExercise(state, b, i, answers)),
  ].filter(Boolean).join('\n\n');
}

export function toMarkdown(state: SheetState, versions: Built[][], part: ExportPart = 'both'): string {
  const pages: string[] = [];
  if (part !== 'answers') versions.forEach((b, v) => pages.push(mdSheet(state, b, v, false)));
  if (part !== 'sheet') versions.forEach((b, v) => pages.push(mdSheet(state, b, v, true)));
  return `${pages.join('\n\n---\n\n')}\n`;
}
