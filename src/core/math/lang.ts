/**
 * Langage commun des expressions saisies dans OmniScience (grapheuse, suites…) :
 * fonctions usuelles, constantes, écritures françaises (virgule décimale, ln, log),
 * produits implicites et traduction des erreurs de mathjs.
 *
 * Les modules transpilent ensuite l'arbre syntaxique en fonction JavaScript native :
 * seuls des jetons issus des listes blanches ci-dessous sont émis dans le code généré.
 */
import { gamma } from './numeric';

const nthRoot = (x: number, n: number) => (x < 0 && Math.abs(n % 2) === 1 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n));

/** Fonctions disponibles dans les expressions. */
export const BUILTINS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan,
  sec: (x) => 1 / Math.cos(x), csc: (x) => 1 / Math.sin(x), cot: (x) => 1 / Math.tan(x),
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
  sech: (x) => 1 / Math.cosh(x), csch: (x) => 1 / Math.sinh(x), coth: (x) => 1 / Math.tanh(x),
  exp: Math.exp,
  ln: Math.log,
  log: (x, b) => (b === undefined ? Math.log10(x) : Math.log(x) / Math.log(b)),
  log10: Math.log10, log2: Math.log2,
  sqrt: Math.sqrt, cbrt: Math.cbrt, nthRoot, square: (x) => x * x, cube: (x) => x * x * x,
  abs: Math.abs, sign: Math.sign,
  floor: Math.floor, ent: Math.floor, ceil: Math.ceil, round: Math.round, trunc: Math.trunc, fix: Math.trunc,
  min: Math.min, max: Math.max, hypot: Math.hypot, pow: Math.pow,
  mod: (a, b) => ((a % b) + b) % b,
  gamma, factorial: (x) => gamma(x + 1), fact: (x) => gamma(x + 1),
};

/** Constantes nommées → code JavaScript. */
export const CONSTANTS: Record<string, string> = {
  pi: 'Math.PI', e: 'Math.E', tau: '(2*Math.PI)', Infinity: 'Infinity', phi: '((1+Math.sqrt(5))/2)',
};

/** Noms de plusieurs lettres gardés tels quels (sinon « ab » est lu comme a·b). */
export const GREEK = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi',
  'omicron', 'rho', 'sigma', 'upsilon', 'chi', 'psi', 'omega',
]);

export const KEYWORDS = new Set(['mod', 'and', 'or', 'not', 'xor']);

/** Opérateurs binaires mathjs → JavaScript. */
export const BINARY: Record<string, string> = {
  add: '+', subtract: '-', multiply: '*', divide: '/', dotMultiply: '*', dotDivide: '/',
};
export const COMPARE: Record<string, string> = {
  smaller: '<', larger: '>', smallerEq: '<=', largerEq: '>=', equal: '===', unequal: '!==',
};

export class ExprError extends Error {}

/** Symboles typographiques → syntaxe ASCII comprise par mathjs. */
export function normalizeSource(src: string): string {
  return src
    .replace(/θ/g, 'theta')
    .replace(/π/g, 'pi')
    .replace(/√\s*([a-zA-Z0-9_.]+)/g, 'sqrt($1)')
    .replace(/√/g, 'sqrt')
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/∞/g, 'Infinity')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/≠/g, '!=')
    .replace(/([a-zA-Z]\w*)''(?=\s*\()/g, '$1__d2')
    .replace(/([a-zA-Z]\w*)'(?=\s*\()/g, '$1__d1')
    .trim();
}

/** Virgule décimale française (« 0,5 ») → point, sans toucher aux séparateurs d'arguments. */
export function decimalComma(src: string): string {
  return src.replace(/(\d),(\d)/g, '$1.$2');
}

/**
 * Produits implicites « à la Desmos », AVANT l'analyse syntaxique pour respecter les
 * priorités : « ax^2 » doit donner a·x² et non (ax)². Un identifiant de plusieurs lettres
 * inconnu est découpé en lettres ; devant une parenthèse, on isole une fonction connue
 * en suffixe : « xsin(x) » → x·sin(x).
 */
export function splitImplicitWith(src: string, keep: (id: string) => boolean, isFunction: (id: string) => boolean = (id) => id in BUILTINS): string {
  const kept = (id: string) => keep(id) || id in CONSTANTS || id in BUILTINS || GREEK.has(id) || KEYWORDS.has(id);
  return src.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (id: string, offset: number) => {
    if (kept(id) || !/^[a-zA-Z]{2,}$/.test(id)) return id;
    if (/^\s*\(/.test(src.slice(offset + id.length))) {
      for (let k = 1; k < id.length; k++) {
        const suffix = id.slice(k);
        if (isFunction(suffix)) return `${id.slice(0, k).split('').join('*')}*${suffix}`;
      }
      return id; // fonction inconnue : signalée plus loin
    }
    return id.split('').join('*');
  });
}

export function translateParseError(message: string): string {
  const table: [RegExp, string][] = [
    [/Unexpected end of expression/i, 'expression incomplète'],
    [/Parenthesis \) expected/i, 'parenthèse fermante manquante'],
    [/Value expected/i, 'valeur attendue'],
    [/Unexpected operator (.*?) \(/i, 'opérateur « $1 » inattendu'],
    [/Unexpected type of argument/i, 'argument invalide'],
    [/Syntax error in part "(.*?)"/i, 'syntaxe incorrecte près de « $1 »'],
  ];
  for (const [re, fr] of table) {
    const m = re.exec(message);
    if (m) return fr.replace('$1', m[1] ?? '');
  }
  return message;
}

/** Conventions françaises dans le LaTeX produit par mathjs. */
export function frenchTex(tex: string): string {
  return tex
    .replace(/\\log_\{10\}/g, '\\log')
    .replace(/\\mathrm\{([a-zA-Z])\}/g, '$1')
    .replace(/\\cdot(?=\s*[^\d\s])/g, '\\,')
    .replace(/(\d)\.(\d)/g, '$1{,}$2')
    .replace(/\\text\{if \}/g, '\\text{si }')
    .replace(/\\text\{otherwise\}/g, '\\text{sinon}');
}

/** Nombre au format LaTeX français. */
export function numTex(v: number): string {
  if (!Number.isFinite(v)) return '\\text{?}';
  const s = String(Math.round(v * 1e10) / 1e10);
  return s.replace('.', '{,}');
}

/** Vue « lâche » des nœuds mathjs (les types fournis ne permettent pas le filtrage par .type). */
export interface AnyNode {
  type: string;
  name?: string;
  value?: unknown;
  fn?: AnyNode | string;
  op?: string;
  args?: AnyNode[];
  content?: AnyNode;
  condition?: AnyNode;
  trueExpr?: AnyNode;
  falseExpr?: AnyNode;
  traverse(cb: (node: AnyNode, path: string, parent: AnyNode | null) => void): void;
  transform(cb: (node: AnyNode, path: string, parent: AnyNode | null) => AnyNode): AnyNode;
  clone(): AnyNode;
  toTex(opts?: object): string;
}

export const fnName = (n: AnyNode): string => (typeof n.fn === 'string' ? n.fn : (n.fn?.name ?? ''));
