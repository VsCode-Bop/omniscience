/**
 * Compilation des expressions saisies dans la grapheuse.
 *
 * 1. Classification de la ligne (fonction, polaire, paramétrique, point, curseur…).
 * 2. Analyse syntaxique par mathjs, puis réécriture de l'AST :
 *    - produits implicites « à la Desmos » : ax → a·x, x(x+1) → x·(x+1) ;
 *    - conventions françaises : ln = logarithme népérien, log = logarithme décimal.
 * 3. Transpilation de l'AST en fonction JavaScript native (new Function) : ~100× plus
 *    rapide que l'évaluateur de mathjs, indispensable pour échantillonner des milliers
 *    de points à chaque image. Seuls des jetons issus de listes blanches sont émis
 *    (aucune chaîne utilisateur n'est injectée telle quelle dans le code généré).
 * 4. Dérivée formelle via mathjs.derivative (repli sur la dérivée numérique).
 */
import {
  create,
  derivativeDependencies,
  parseDependencies,
  rationalizeDependencies,
  simplifyDependencies,
  type MathNode,
} from 'mathjs';
import { derivative as numericDerivative, gamma, type RealFn } from '../../core/math/numeric';

/**
 * Instance mathjs réduite aux fonctions utilisées (analyse syntaxique et calcul formel) :
 * le reste de la bibliothèque (matrices, unités, statistiques…) n'est pas embarqué.
 */
const math = create({ parseDependencies, derivativeDependencies, simplifyDependencies, rationalizeDependencies });
const { parse, simplify, rationalize, OperatorNode, FunctionNode, SymbolNode, ConstantNode } = math;
const symbolicDerivative = math.derivative;

export type Variable = 'x' | 't' | 'theta';
export type RowKind = 'empty' | 'function' | 'polar' | 'parametric' | 'point' | 'vline' | 'param' | 'constant' | 'error';

export interface RowSource {
  id: string;
  src: string;
}

export interface CompiledRow {
  id: string;
  kind: RowKind;
  /** Nom défini par la ligne : f, a, A… */
  name?: string;
  variable?: Variable;
  error?: string;
  /** Paramètres utilisés mais non définis (→ curseurs à créer). */
  missing: string[];
  fn?: RealFn;
  dfn?: RealFn;
  tex?: string;
  derivTex?: string;
  fx?: RealFn;
  fy?: RealFn;
  px?: () => number;
  py?: () => number;
  /** Valeur littérale d'un curseur (a = 2). */
  value?: number;
  valueFn?: () => number;
}

// ─── Bibliothèque de fonctions disponibles dans les expressions ──────────────

const nthRoot = (x: number, n: number) => (x < 0 && Math.abs(n % 2) === 1 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n));

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

const CONSTANTS: Record<string, string> = {
  pi: 'Math.PI', e: 'Math.E', tau: '(2*Math.PI)', Infinity: 'Infinity', phi: '((1+Math.sqrt(5))/2)',
};

const VARIABLES = new Set<string>(['x', 't', 'theta']);
const RESERVED = new Set<string>([...VARIABLES, 'y', 'r', ...Object.keys(CONSTANTS), ...Object.keys(BUILTINS)]);
/** Noms de plusieurs lettres gardés tels quels (sinon « ab » est lu comme a·b). */
const GREEK = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi',
  'omicron', 'rho', 'sigma', 'upsilon', 'chi', 'psi', 'omega',
]);

// ─── Pré-traitement et classification syntaxique ─────────────────────────────

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

type Shape =
  | { shape: 'empty' }
  | { shape: 'plain'; body: string }
  | { shape: 'tuple'; x: string; y: string }
  | { shape: 'define'; name: string; arg?: string; body: string };

/** Découpe « (a, b) » au niveau de profondeur 1 ; null si ce n'est pas un couple. */
function splitTuple(s: string): [string, string] | null {
  if (!s.startsWith('(') || !s.endsWith(')')) return null;
  let depth = 0;
  let comma = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') {
      depth--;
      if (depth === 0 && i !== s.length - 1) return null; // « (a)+(b) » n'est pas un couple
    } else if (c === ',' && depth === 1) {
      if (comma >= 0) return null;
      comma = i;
    }
  }
  return comma < 0 ? null : [s.slice(1, comma).trim(), s.slice(comma + 1, -1).trim()];
}

export function classify(raw: string): Shape {
  const s = normalizeSource(raw);
  if (!s) return { shape: 'empty' };
  const def = /^([a-zA-Z]\w*)\s*(?:\(\s*([a-zA-Z]\w*)\s*\))?\s*=(?!=)(.*)$/.exec(s);
  if (def) return { shape: 'define', name: def[1], arg: def[2], body: def[3].trim() };
  const tuple = splitTuple(s);
  if (tuple) return { shape: 'tuple', x: tuple[0], y: tuple[1] };
  return { shape: 'plain', body: s };
}

// ─── Manipulation de l'AST mathjs ────────────────────────────────────────────

/** Vue « lâche » des nœuds mathjs (les types fournis ne permettent pas le filtrage par .type). */
interface AnyNode {
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

const asAny = (n: MathNode) => n as unknown as AnyNode;
const asMath = (n: AnyNode) => n as unknown as MathNode;
const fnName = (n: AnyNode): string => (typeof n.fn === 'string' ? n.fn : (n.fn?.name ?? ''));

function translateParseError(message: string): string {
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

export class ExprError extends Error {}

const KEYWORDS = new Set(['mod', 'and', 'or', 'not', 'xor']);

/**
 * Produits implicites « à la Desmos », AVANT l'analyse syntaxique pour respecter les
 * priorités : « ax^2 » doit donner a·x² et non (ax)². Un identifiant de plusieurs lettres
 * inconnu est découpé en lettres ; devant une parenthèse, on isole une fonction connue
 * en suffixe : « xsin(x) » → x·sin(x).
 */
export function splitImplicit(src: string, known: ReadonlySet<string>): string {
  const keep = (id: string) =>
    known.has(id) || VARIABLES.has(id) || id in CONSTANTS || id in BUILTINS || GREEK.has(id) || KEYWORDS.has(id) || id === 'y' || id === 'r';
  return src.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (id: string, offset: number) => {
    if (keep(id) || !/^[a-zA-Z]{2,}$/.test(id)) return id;
    if (/^\s*\(/.test(src.slice(offset + id.length))) {
      for (let k = 1; k < id.length; k++) {
        const suffix = id.slice(k);
        if (suffix in BUILTINS || known.has(suffix)) return `${id.slice(0, k).split('').join('*')}*${suffix}`;
      }
      return id; // fonction inconnue : signalée plus loin
    }
    return id.split('').join('*');
  });
}

function parseBody(src: string, known: ReadonlySet<string>): AnyNode {
  if (!src.trim()) throw new ExprError('expression vide');
  try {
    return asAny(parse(splitImplicit(src, known)));
  } catch (err) {
    throw new ExprError(`Syntaxe : ${translateParseError((err as Error).message)}`);
  }
}

interface Scope {
  variable: Variable | null;
  functions: Set<string>;
  params: Set<string>;
}

/** Symbole connu tel quel (variable, constante, paramètre défini ou lettre grecque). */
function isKnownSymbol(name: string, scope: Scope): boolean {
  return VARIABLES.has(name) || name in CONSTANTS || scope.params.has(name) || GREEK.has(name) || name === 'y' || name === 'r';
}

/**
 * Réécriture des appels « x(…) », « a(…) » en produits x·(…), a·(…) lorsque le nom
 * n'est ni une fonction intégrée ni une fonction utilisateur.
 */
function rewrite(node: AnyNode, scope: Scope): AnyNode {
  return node.transform((n) => {
    if (n.type === 'FunctionNode') {
      const name = fnName(n);
      const args = (n.args ?? []).map((a) => rewrite(a, scope));
      const base = name.replace(/__d[12]$/, '');
      if (!(name in BUILTINS) && !scope.functions.has(base) && args.length === 1 && (isKnownSymbol(name, scope) || /^[a-zA-Z]$/.test(name))) {
        return asAny(new OperatorNode('*', 'multiply', [new SymbolNode(name), asMath(args[0])]));
      }
      return asAny(new FunctionNode(name, args.map(asMath)));
    }
    return n;
  });
}

interface SymbolUse {
  symbols: Set<string>;
  calls: Set<string>;
}

function collect(node: AnyNode): SymbolUse {
  const symbols = new Set<string>();
  const calls = new Set<string>();
  node.traverse((n, path, parent) => {
    if (n.type === 'SymbolNode') {
      if (path === 'fn' && parent?.type === 'FunctionNode') calls.add(n.name!);
      else symbols.add(n.name!);
    }
  });
  return { symbols, calls };
}

// ─── Transpilation AST → JavaScript ──────────────────────────────────────────

const BINARY: Record<string, string> = {
  add: '+', subtract: '-', multiply: '*', divide: '/', dotMultiply: '*', dotDivide: '/',
};
const COMPARE: Record<string, string> = {
  smaller: '<', larger: '>', smallerEq: '<=', largerEq: '>=', equal: '===', unequal: '!==',
};

function toJS(node: AnyNode, scope: Scope): string {
  const js = (n: AnyNode) => toJS(n, scope);
  switch (node.type) {
    case 'ConstantNode': {
      if (typeof node.value !== 'number') throw new ExprError('seuls les nombres sont acceptés');
      return `(${String(node.value)})`;
    }
    case 'SymbolNode': {
      const name = node.name!;
      if (name === scope.variable) return 'v';
      if (name in CONSTANTS) return CONSTANTS[name];
      if (VARIABLES.has(name)) throw new ExprError(`variable « ${name === 'theta' ? 'θ' : name} » inattendue ici`);
      if (name === 'y') throw new ExprError('les équations implicites en y ne sont pas encore prises en charge');
      if (name === 'r') throw new ExprError('« r » est réservé aux courbes polaires (r = …)');
      if (name in BUILTINS) throw new ExprError(`ajoutez des parenthèses : ${name}(…)`);
      return `P[${JSON.stringify(name)}]`;
    }
    case 'ParenthesisNode':
      return `(${js(node.content!)})`;
    case 'ConditionalNode':
      return `((${js(node.condition!)}) ? (${js(node.trueExpr!)}) : (${js(node.falseExpr!)}))`;
    case 'OperatorNode': {
      const f = fnName(node);
      const a = node.args ?? [];
      if (f in BINARY) return `(${js(a[0])}${BINARY[f]}${js(a[1])})`;
      if (f in COMPARE) return `((${js(a[0])}${COMPARE[f]}${js(a[1])}) ? 1 : 0)`;
      switch (f) {
        case 'pow': return `Math.pow(${js(a[0])},${js(a[1])})`;
        case 'unaryMinus': return `(-${js(a[0])})`;
        case 'unaryPlus': return `(+${js(a[0])})`;
        case 'mod': return `M.mod(${js(a[0])},${js(a[1])})`;
        case 'factorial': return `M.factorial(${js(a[0])})`;
        case 'and': return `((${js(a[0])}) && (${js(a[1])}) ? 1 : 0)`;
        case 'or': return `((${js(a[0])}) || (${js(a[1])}) ? 1 : 0)`;
        case 'not': return `((${js(a[0])}) ? 0 : 1)`;
      }
      throw new ExprError(`opérateur « ${node.op} » non pris en charge`);
    }
    case 'FunctionNode': {
      const name = fnName(node);
      const args = (node.args ?? []).map(js).join(',');
      if (name in BUILTINS) return `M[${JSON.stringify(name)}](${args})`;
      const base = name.replace(/__d[12]$/, '');
      if (scope.functions.has(base)) return `F[${JSON.stringify(name)}](${args})`;
      const hint = /^[a-zA-Z]+$/.test(name) && name.length > 3 ? ` — écrivez par ex. ${name[0]}*${name.slice(1)}(…)` : '';
      throw new ExprError(`fonction inconnue « ${name.replace(/__d1$/, "'").replace(/__d2$/, "''")} »${hint}`);
    }
  }
  throw new ExprError('expression non prise en charge');
}

type Tables = { M: typeof BUILTINS; F: Record<string, RealFn>; P: Record<string, number> };

function makeFn(code: string, t: Tables): RealFn {
  return new Function('M', 'F', 'P', `"use strict"; return function (v) { return ${code}; };`)(t.M, t.F, t.P) as RealFn;
}

// ─── Dialectes : conventions françaises ↔ mathjs ─────────────────────────────

function toMathjsDialect(node: AnyNode): AnyNode {
  return node.transform((n) => {
    if (n.type !== 'FunctionNode') return n;
    const name = fnName(n);
    const args = (n.args ?? []).map((a) => asMath(toMathjsDialect(a)));
    const map: Record<string, string> = { ln: 'log', arcsin: 'asin', arccos: 'acos', arctan: 'atan', ent: 'floor', fact: 'factorial' };
    if (name === 'log' && args.length === 1) return asAny(new FunctionNode('log10', args));
    return asAny(new FunctionNode(map[name] ?? name, args));
  });
}

function fromMathjsDialect(node: AnyNode): AnyNode {
  return node.transform((n) => {
    if (n.type !== 'FunctionNode') return n;
    const name = fnName(n);
    const args = (n.args ?? []).map((a) => asMath(fromMathjsDialect(a)));
    if (name === 'log' && args.length === 1) return asAny(new FunctionNode('ln', args));
    if (name === 'log10') return asAny(new FunctionNode('log', args));
    return asAny(new FunctionNode(name, args));
  });
}

/** LaTeX affichable, conventions françaises (ln, log décimal). */
export function texOf(node: AnyNode): string {
  return toMathjsDialect(node)
    .toTex({ parenthesis: 'auto', implicit: 'hide' })
    .replace(/\\log_\{10\}/g, '\\log')
    .replace(/\\mathrm\{([a-zA-Z])\}/g, '$1')
    .replace(/\\cdot(?=\s*[^\d\s])/g, '\\,');
}

/** Remplace les appels aux fonctions utilisateur par leur définition (pour dériver). */
function inlineFunctions(node: AnyNode, defs: Map<string, { variable: Variable; body: AnyNode }>, depth = 0): AnyNode {
  if (depth > 8) throw new ExprError('imbrication trop profonde');
  return node.transform((n) => {
    if (n.type !== 'FunctionNode') return n;
    const name = fnName(n);
    const def = defs.get(name);
    const args = (n.args ?? []).map((a) => inlineFunctions(a, defs, depth + 1));
    if (!def) {
      if (/__d[12]$/.test(name)) throw new ExprError('dérivée imbriquée');
      return asAny(new FunctionNode(name, args.map(asMath)));
    }
    const arg = args[0];
    const substituted = def.body.transform((m, path) => (m.type === 'SymbolNode' && path !== 'fn' && m.name === def.variable ? arg.clone() : m));
    return inlineFunctions(substituted, defs, depth + 1);
  });
}

// ─── Programme : ensemble des lignes compilées ───────────────────────────────

interface Pending {
  row: CompiledRow;
  body?: AnyNode;
  xNode?: AnyNode;
  yNode?: AnyNode;
}

export class Program {
  readonly P: Record<string, number> = {};
  readonly F: Record<string, RealFn> = {};
  readonly rows: CompiledRow[];
  private readonly constants: { name: string; fn: () => number }[] = [];

  constructor(sources: RowSource[]) {
    const tables: Tables = { M: BUILTINS, F: this.F, P: this.P };
    // Noms définis par l'ensemble des lignes (nécessaires au découpage des produits implicites).
    const known = new Set<string>();
    for (const s of sources) {
      const shape = classify(s.src);
      if (shape.shape === 'define') known.add(shape.name);
    }
    const pending: Pending[] = sources.map((s) => this.parseRow(s, known));

    // Noms définis (fonctions, curseurs, constantes) et conflits.
    const functions = new Set<string>();
    const params = new Set<string>();
    const seen = new Map<string, CompiledRow>();
    for (const p of pending) {
      const { row } = p;
      if (row.kind === 'error' || !row.name) continue;
      if (row.kind === 'function' || row.kind === 'param' || row.kind === 'constant') {
        if (RESERVED.has(row.name)) {
          fail(p, `« ${row.name} » est un nom réservé`);
          continue;
        }
        if (seen.has(row.name)) {
          fail(p, `« ${row.name} » est déjà défini`);
          continue;
        }
        seen.set(row.name, row);
        (row.kind === 'function' ? functions : params).add(row.name);
      }
    }

    // Réécriture des AST et dépendances.
    const deps = new Map<string, Set<string>>();
    const missing = new Set<string>();
    for (const p of pending) {
      const { row } = p;
      if (row.kind === 'error' || row.kind === 'empty') continue;
      const scope: Scope = { variable: row.variable ?? null, functions, params };
      try {
        const used = new Set<string>();
        for (const key of ['body', 'xNode', 'yNode'] as const) {
          const node = p[key];
          if (!node) continue;
          const rewritten = rewrite(node, scope);
          p[key] = rewritten;
          const { symbols, calls } = collect(rewritten);
          for (const s of symbols) {
            if (VARIABLES.has(s) || s in CONSTANTS || s in BUILTINS || s === 'y' || s === 'r') continue;
            used.add(s);
            if (!params.has(s)) {
              row.missing.push(s);
              missing.add(s);
            }
          }
          for (const c of calls) used.add(c.replace(/__d[12]$/, ''));
        }
        row.missing = [...new Set(row.missing)];
        if (row.name) deps.set(row.name, used);
      } catch (err) {
        fail(p, (err as Error).message);
      }
    }

    // Définitions circulaires (f(x) = g(x), g(x) = f(x) ; a = b, b = a…).
    const cyclic = findCycles(deps);
    for (const p of pending) if (p.row.name && cyclic.has(p.row.name)) fail(p, 'définition circulaire');

    // Valeur par défaut des paramètres manquants : l'aperçu reste visible pendant la saisie.
    for (const m of missing) this.P[m] = 1;

    // Génération du code.
    const defs = new Map<string, { variable: Variable; body: AnyNode }>();
    for (const p of pending) if (p.row.kind === 'function' && p.body && p.row.name) defs.set(p.row.name, { variable: p.row.variable!, body: p.body });

    for (const p of pending) {
      const { row } = p;
      if (row.kind === 'error' || row.kind === 'empty') continue;
      const scope: Scope = { variable: row.variable ?? null, functions, params };
      try {
        switch (row.kind) {
          case 'function':
          case 'polar': {
            row.fn = makeFn(toJS(p.body!, scope), tables);
            row.tex = safeTex(p.body!);
            this.attachDerivative(row, p.body!, scope, defs, tables);
            if (row.kind === 'function' && row.name) {
              const f = row.fn;
              const df = row.dfn!;
              this.F[row.name] = f;
              this.F[`${row.name}__d1`] = df;
              this.F[`${row.name}__d2`] = (x) => numericDerivative(df, x);
            }
            break;
          }
          case 'parametric':
            row.fx = makeFn(toJS(p.xNode!, scope), tables);
            row.fy = makeFn(toJS(p.yNode!, scope), tables);
            break;
          case 'point': {
            const fx = makeFn(toJS(p.xNode!, scope), tables);
            const fy = makeFn(toJS(p.yNode!, scope), tables);
            row.px = () => fx(0);
            row.py = () => fy(0);
            break;
          }
          case 'vline': {
            const fx = makeFn(toJS(p.body!, scope), tables);
            row.px = () => fx(0);
            break;
          }
          case 'param':
            this.P[row.name!] = row.value!;
            break;
          case 'constant': {
            const f = makeFn(toJS(p.body!, scope), tables);
            row.valueFn = () => f(0);
            this.constants.push({ name: row.name!, fn: row.valueFn });
            break;
          }
        }
      } catch (err) {
        fail(p, (err as Error).message);
      }
    }
    this.updateConstants();
    this.rows = pending.map((p) => p.row);
  }

  /** Met à jour un curseur sans recompiler. */
  setParam(name: string, value: number): void {
    this.P[name] = value;
    this.updateConstants();
  }

  private updateConstants(): void {
    // Plusieurs passes : une constante peut dépendre d'une autre définie plus bas.
    for (let pass = 0; pass <= this.constants.length; pass++) {
      for (const c of this.constants) this.P[c.name] = c.fn();
    }
  }

  private parseRow(source: RowSource, known: ReadonlySet<string>): Pending {
    const row: CompiledRow = { id: source.id, kind: 'empty', missing: [] };
    const p: Pending = { row };
    try {
      const shape = classify(source.src);
      switch (shape.shape) {
        case 'empty':
          return p;
        case 'tuple': {
          p.xNode = parseBody(shape.x, known);
          p.yNode = parseBody(shape.y, known);
          const uses = new Set([...collect(p.xNode).symbols, ...collect(p.yNode).symbols]);
          row.kind = uses.has('t') ? 'parametric' : 'point';
          row.variable = uses.has('t') ? 't' : undefined;
          return p;
        }
        case 'plain': {
          p.body = parseBody(shape.body, known);
          const { symbols } = collect(p.body);
          const polar = symbols.has('theta') && !symbols.has('x');
          row.kind = polar ? 'polar' : 'function';
          row.variable = polar ? 'theta' : 'x';
          return p;
        }
        case 'define': {
          const { name, arg, body } = shape;
          if (arg) {
            if (!VARIABLES.has(arg)) throw new ExprError(`variable « ${arg} » : utilisez x, t ou θ`);
            p.body = parseBody(body, known);
            if (name === 'r' && arg === 'theta') {
              row.kind = 'polar';
              row.variable = 'theta';
            } else {
              row.kind = 'function';
              row.name = name;
              row.variable = arg as Variable;
            }
            return p;
          }
          if (name === 'y') {
            p.body = parseBody(body, known);
            row.kind = 'function';
            row.variable = 'x';
            return p;
          }
          if (name === 'r') {
            p.body = parseBody(body, known);
            row.kind = 'polar';
            row.variable = 'theta';
            return p;
          }
          const tuple = splitTuple(normalizeSource(body));
          if (tuple) {
            p.xNode = parseBody(tuple[0], known);
            p.yNode = parseBody(tuple[1], known);
            const uses = new Set([...collect(p.xNode).symbols, ...collect(p.yNode).symbols]);
            row.kind = uses.has('t') ? 'parametric' : 'point';
            row.variable = uses.has('t') ? 't' : undefined;
            row.name = name;
            return p;
          }
          p.body = parseBody(body, known);
          if (name === 'x') {
            row.kind = 'vline';
            return p;
          }
          const { symbols } = collect(p.body);
          if (symbols.has('x')) {
            row.kind = 'function';
            row.name = name;
            row.variable = 'x';
            return p;
          }
          const literal = Number(body.replace(/\s+/g, ''));
          row.name = name;
          if (Number.isFinite(literal)) {
            row.kind = 'param';
            row.value = literal;
          } else {
            row.kind = 'constant';
          }
          return p;
        }
      }
    } catch (err) {
      row.kind = 'error';
      row.error = (err as Error).message;
    }
    return p;
  }

  private attachDerivative(
    row: CompiledRow,
    body: AnyNode,
    scope: Scope,
    defs: Map<string, { variable: Variable; body: AnyNode }>,
    tables: Tables,
  ): void {
    const f = row.fn!;
    try {
      const inlined = toMathjsDialect(inlineFunctions(body, defs));
      const d = fromMathjsDialect(quotientRule(inlined, row.variable!) ?? asAny(symbolicDerivative(asMath(inlined), row.variable!)));
      row.dfn = makeFn(toJS(d, scope), tables);
      row.derivTex = safeTex(d);
    } catch {
      row.dfn = (x) => numericDerivative(f, x);
      row.derivTex = undefined;
    }
  }
}

/**
 * Dérivée d'un quotient u/v présentée comme en classe : (u'v − uv')/v², numérateur
 * simplifié (réduit si c'est un polynôme), dénominateur laissé au carré — la forme
 * utile pour étudier le signe de f'. Retourne null si l'expression n'est pas un quotient.
 */
function quotientRule(node: AnyNode, variable: Variable): AnyNode | null {
  let n = node;
  while (n.type === 'ParenthesisNode') n = n.content!;
  if (n.type !== 'OperatorNode' || fnName(n) !== 'divide') return null;
  const [u, v] = n.args!.map(asMath);
  const dv = symbolicDerivative(v, variable);
  if (asAny(dv).type === 'ConstantNode' && asAny(dv).value === 0) return null; // dénominateur constant
  const du = symbolicDerivative(u, variable);
  let numerator: MathNode = simplify(
    new OperatorNode('-', 'subtract', [new OperatorNode('*', 'multiply', [du, v]), new OperatorNode('*', 'multiply', [u, dv])]),
  );
  try {
    numerator = rationalize(numerator);
  } catch {
    /* numérateur non polynomial (sin, exp…) : on garde la forme simplifiée */
  }
  return asAny(new OperatorNode('/', 'divide', [numerator, new OperatorNode('^', 'pow', [v, new ConstantNode(2)])]));
}

function fail(p: Pending, message: string): void {
  p.row.kind = 'error';
  p.row.error = message;
}

function safeTex(node: AnyNode): string | undefined {
  try {
    return texOf(node);
  } catch {
    return undefined;
  }
}

function findCycles(deps: Map<string, Set<string>>): Set<string> {
  const cyclic = new Set<string>();
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const visit = (n: string) => {
    state.set(n, 1);
    stack.push(n);
    for (const d of deps.get(n) ?? []) {
      if (!deps.has(d)) continue;
      if (state.get(d) === 1) {
        for (let i = stack.indexOf(d); i < stack.length; i++) cyclic.add(stack[i]);
      } else if (!state.has(d)) visit(d);
    }
    stack.pop();
    state.set(n, 2);
  };
  for (const n of deps.keys()) if (!state.has(n)) visit(n);
  return cyclic;
}

