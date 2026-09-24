/**
 * Texte « riche » des exercices : texte ordinaire + formules entre $…$, converti en
 * HTML (KaTeX), en LaTeX et en Markdown. Le texte peut venir d'un lien partagé : il est
 * toujours échappé, et les formules passent par KaTeX (commandes non sûres désactivées).
 */

export interface Seg {
  math: boolean;
  s: string;
}

/** Découpe en segments texte / formule ; « \$ » désigne un dollar littéral. */
export function segments(src: string): Seg[] {
  const out: Seg[] = [];
  let buf = '';
  let math = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\' && src[i + 1] === '$') {
      buf += math ? '\\$' : '$';
      i++;
      continue;
    }
    if (c === '$') {
      if (buf) out.push({ math, s: buf });
      buf = '';
      math = !math;
      continue;
    }
    buf += c;
  }
  if (math) out.push({ math: false, s: `$${buf}` });
  else if (buf) out.push({ math: false, s: buf });
  return out;
}

/** Espace insécable entre une formule et l'unité ou la ponctuation haute qui la suit. */
const UNIT_AFTER_MATH = /^ (?=(?:cm|mm|km|m|dm|g|kg|mg|t|mL|cL|dL|L|N|V|A|mA|W|kW|J|kWh|Wh|s|h|min|mol|Ω)\b|[€%°³²;:!?])/;

function glueUnits(segs: Seg[]): Seg[] {
  return segs.map((g, i) => (!g.math && i > 0 && segs[i - 1].math ? { math: false, s: g.s.replace(UNIT_AFTER_MATH, '\u00a0') } : g));
}

// ─── LaTeX ─────────────────────────────────────────────────────────────────

const LATEX_TEXT: Record<string, string> = {
  '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '%': '\\%', '&': '\\&', '#': '\\#', '_': '\\_',
  '~': '\\textasciitilde{}', '^': '\\textasciicircum{}', $: '\\$', '×': '$\\times$', '≈': '$\\approx$',
  '→': '$\\to$', '≤': '$\\leqslant$', '≥': '$\\geqslant$', '≠': '$\\neq$', '−': '-', 'π': '$\\pi$',
  ' ': '\\,', ' ': '~', '°': '\\textdegree{}', '²': '\\textsuperscript{2}', '³': '\\textsuperscript{3}',
};

export function latexText(s: string): string {
  return s.replace(/[\\{}%&#_~^$×≈→≤≥≠−π  °²³]/g, (c) => LATEX_TEXT[c]);
}

/** Texte riche → LaTeX (paragraphes séparés par une ligne vide, retours à la ligne \\). */
export function richLatex(src: string): string {
  return src
    .trim()
    .split(/\n\s*\n/)
    .map((para) => para.split('\n').map((line) => glueUnits(segments(line)).map((g) => (g.math ? `$${g.s}$` : latexText(g.s))).join('')).filter((l) => l.trim()).join(' \\\\\n'))
    .filter(Boolean)
    .join('\n\n');
}

// ─── Markdown ──────────────────────────────────────────────────────────────

export function richMarkdown(src: string): string {
  return src
    .trim()
    .split(/\n\s*\n/)
    .map((para) => para.split('\n').map((line) => segments(line).map((g) => (g.math ? `$${g.s}$` : g.s.replace(/([*_`[\]<>])/g, '\\$1'))).join('')).join('  \n'))
    .join('\n\n');
}

// ─── HTML ──────────────────────────────────────────────────────────────────

export interface KatexLike {
  renderToString(tex: string, options?: Record<string, unknown>): string;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Espaces insécables de la typographie française devant ; : ! ? et dans les guillemets. */
function frenchSpacing(s: string): string {
  return s.replace(/ ([;:!?»])/g, ' $1').replace(/« /g, '« ');
}

const cache = new Map<string, string>();

function mathHtml(tex: string, katex: KatexLike): string {
  let html = cache.get(tex);
  if (html === undefined) {
    try {
      html = katex.renderToString(tex, { throwOnError: true, strict: 'ignore', trust: false, maxSize: 20, maxExpand: 200 });
    } catch {
      html = `<code class="ws-tex-error" title="Formule illisible">${escapeHtml(tex)}</code>`;
    }
    if (cache.size > 4000) cache.clear();
    cache.set(tex, html);
  }
  return html;
}

/** Une ligne de texte riche → HTML en ligne ; une valeur et son unité restent insécables. */
export function richInline(src: string, katex: KatexLike): string {
  return src
    .split('\n')
    .map((line) => {
      const segs = glueUnits(segments(line));
      let out = '';
      for (let i = 0; i < segs.length; i++) {
        const g = segs[i];
        if (!g.math) {
          out += frenchSpacing(escapeHtml(g.s));
          continue;
        }
        const next = segs[i + 1];
        const unit = next && !next.math ? /^\u00a0\S+/.exec(next.s) : null;
        if (unit) {
          out += `<span class="nb">${mathHtml(g.s, katex)}${escapeHtml(unit[0])}</span>`;
          segs[i + 1] = { math: false, s: next.s.slice(unit[0].length) };
        } else {
          out += mathHtml(g.s, katex);
        }
      }
      return out;
    })
    .join('<br>');
}

/** Texte riche → paragraphes HTML. */
export function richHtml(src: string, katex: KatexLike): string {
  return src
    .trim()
    .split(/\n\s*\n/)
    .filter((p) => p.trim())
    .map((p) => `<p>${richInline(p, katex)}</p>`)
    .join('');
}
