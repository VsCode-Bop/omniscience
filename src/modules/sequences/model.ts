/**
 * Moteur du module « Suites numériques » : compilation des définitions, calcul des
 * termes, observations (nature, monotonie, conjecture de limite, points fixes), seuil.
 *
 * Syntaxe acceptée pour désigner un terme : uₙ, u_n, u(n), un, u (seul) ; uₙ₋₁, u_{n-1},
 * u(n-1) ; v(n), vₙ… pour une autre suite. Une suite récurrente est définie par
 * uₙ₊₁ = f(uₙ, n) — ou f(uₙ, uₙ₋₁, n) pour une récurrence d'ordre 2 (Fibonacci).
 */
import { create, parseDependencies, type MathNode } from 'mathjs';
import {
  BINARY,
  BUILTINS,
  COMPARE,
  CONSTANTS,
  ExprError,
  fnName,
  frenchTex,
  GREEK,
  normalizeSource,
  translateParseError,
  splitImplicitWith,
  type AnyNode,
} from '../../core/math/lang';
import { brentRoot, derivative } from '../../core/math/numeric';

const math = create({ parseDependencies });
const { parse, FunctionNode, SymbolNode, OperatorNode } = math;
const asAny = (n: MathNode) => n as unknown as AnyNode;
const asMath = (n: AnyNode) => n as unknown as MathNode;

export const SEQ_NAMES = ['u', 'v', 'w'] as const;
export type SeqName = (typeof SEQ_NAMES)[number];
const SEQ_SET = new Set<string>(SEQ_NAMES);

export interface SeqDef {
  name: SeqName;
  kind: 'explicit' | 'recursive';
  /** Explicite : f(n). Récurrente : expression de uₙ₊₁. */
  expr: string;
  /** Premier indice n₀. */
  n0: number;
  /** Termes initiaux (expressions) : u(n₀), puis u(n₀ + 1) pour une récurrence d'ordre 2. */
  init: string[];
  color: number;
  hidden?: boolean;
}

type Getter = (k: number) => number;
type Tables = { M: typeof BUILTINS; P: Record<string, number> };
type StepFn = (n: number, S: Record<string, Getter>) => number;

export interface CompiledSeq {
  def: SeqDef;
  error?: string;
  /** 0 : explicite ; 1 ou 2 : ordre de la récurrence. */
  order: number;
  /** Écriture de la définition (LaTeX) et de son membre de droite seul. */
  tex?: string;
  rhsTex?: string;
  initTex: string[];
  /** Relation autonome uₙ₊₁ = g(uₙ) (ni n ni autre suite) : toile d'araignée possible. */
  autonomous: boolean;
  step?: StepFn;
  inits: (() => number)[];
  /** Formule transcrite en Python (algorithme de seuil), si possible. */
  python?: { expr: string; inits: string[] };
}

// ─── Pré-traitement de la notation des suites ────────────────────────────────

const SUB: Record<string, string> = {
  'ₙ': 'n', '₊': '+', '₋': '-', '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', 'ₖ': 'k',
};

export function normalizeSequenceSource(src: string): string {
  let s = normalizeSource(src)
    .replace(/(\d),(\d)/g, '$1.$2') // virgule décimale
    .replace(/;/g, ','); // séparateur d'arguments « à la française »
  // Indices Unicode : uₙ₊₁ → u(n+1)
  s = s.replace(/([uvw])([ₙₖ₊₋₀-₉]+)/g, (_, name: string, sub: string) => `${name}(${[...sub].map((c) => SUB[c] ?? c).join('')})`);
  // u_{n+1}, u_(n+1) → u(n+1) ; u_n, u_0 → u(n), u(0)
  s = s.replace(/([uvw])_\{([^}]*)\}/g, '$1($2)').replace(/([uvw])_\(/g, '$1(').replace(/([uvw])_([a-z0-9]+)/g, '$1($2)');
  // un, vn, wn (lettres isolées) → u(n)
  s = s.replace(/(?<![A-Za-z_])([uvw])n(?![A-Za-z0-9_(])/g, '$1(n)');
  return s;
}

function parseExpr(src: string): AnyNode {
  const s = normalizeSequenceSource(src);
  if (!s) throw new ExprError('expression vide');
  const split = splitImplicitWith(s, (id) => SEQ_SET.has(id) || id === 'n', (id) => id in BUILTINS || SEQ_SET.has(id));
  try {
    return asAny(parse(split));
  } catch (err) {
    throw new ExprError(`Syntaxe : ${translateParseError((err as Error).message)}`);
  }
}

const containsSequence = (node: AnyNode) => {
  let found = false;
  node.traverse((n) => {
    if ((n.type === 'SymbolNode' || n.type === 'FunctionNode') && SEQ_SET.has(n.type === 'SymbolNode' ? n.name! : fnName(n))) found = true;
  });
  return found;
};
const containsN = (node: AnyNode) => {
  let found = false;
  node.traverse((n) => {
    if (n.type === 'SymbolNode' && n.name === 'n') found = true;
  });
  return found;
};

/**
 * u(…) désigne un terme si l'argument est un indice : expression en n sans autre suite,
 * ou entier littéral (u(0)). Sinon c'est un produit : « u(1 − u) » = uₙ × (1 − uₙ).
 */
function isIndex(arg: AnyNode): boolean {
  if (containsSequence(arg)) return false;
  if (containsN(arg)) return true;
  let a = arg;
  while (a.type === 'ParenthesisNode') a = a.content!;
  return a.type === 'ConstantNode' && Number.isInteger(a.value);
}

/** u seul → u(n) ; a(n+1) → a·(n+1) pour un paramètre ; appels de suites conservés. */
function rewrite(node: AnyNode): AnyNode {
  return node.transform((n, path) => {
    if (n.type === 'SymbolNode' && path !== 'fn' && SEQ_SET.has(n.name!)) {
      return asAny(new FunctionNode(n.name!, [new SymbolNode('n')]));
    }
    if (n.type === 'FunctionNode') {
      const name = fnName(n);
      const args = (n.args ?? []).map(rewrite);
      if (SEQ_SET.has(name) && args.length === 1 && !isIndex(args[0])) {
        return asAny(new OperatorNode('*', 'multiply', [new FunctionNode(name, [new SymbolNode('n')]), asMath(args[0])], true));
      }
      if (!(name in BUILTINS) && !SEQ_SET.has(name) && args.length === 1 && /^[a-zA-Z]$|^[a-z]+$/.test(name) && (name.length === 1 || GREEK.has(name))) {
        return asAny(new OperatorNode('*', 'multiply', [new SymbolNode(name), asMath(args[0])]));
      }
      return asAny(new FunctionNode(name, args.map(asMath)));
    }
    return n;
  });
}

interface Uses {
  params: Set<string>;
  usesN: boolean;
  /** Appels de suites : nom et décalage constant par rapport à n (null si quelconque). */
  refs: { name: string; offset: number | null }[];
}

function uses(node: AnyNode): Uses {
  const params = new Set<string>();
  const refs: Uses['refs'] = [];
  node.traverse((n, path, parent) => {
    if (n.type === 'SymbolNode') {
      if (path === 'fn' && parent?.type === 'FunctionNode') return;
      const name = n.name!;
      if (name !== 'n' && !(name in CONSTANTS) && !SEQ_SET.has(name) && !(name in BUILTINS)) params.add(name);
    }
    if (n.type === 'FunctionNode' && SEQ_SET.has(fnName(n))) refs.push({ name: fnName(n), offset: indexOffset(n.args?.[0]) });
  });
  // n utilisé hors des indices : uₙ₊₁ = uₙ + 2n dépend de n, uₙ₊₁ = 0,5uₙ non.
  const outside = node.transform((n) => (n.type === 'FunctionNode' && SEQ_SET.has(fnName(n)) ? asAny(new SymbolNode('__terme')) : n));
  return { params, usesN: containsN(outside), refs };
}

/** Décalage d'un indice de la forme n + k ou n − k (k entier), sinon null. */
function indexOffset(arg: AnyNode | undefined): number | null {
  if (!arg) return null;
  let a = arg;
  while (a.type === 'ParenthesisNode') a = a.content!;
  if (a.type === 'SymbolNode' && a.name === 'n') return 0;
  if (a.type === 'OperatorNode' && (fnName(a) === 'add' || fnName(a) === 'subtract')) {
    const [l, r] = a.args!;
    if (l.type === 'SymbolNode' && l.name === 'n' && r.type === 'ConstantNode' && Number.isInteger(r.value)) {
      return fnName(a) === 'add' ? Number(r.value) : -Number(r.value);
    }
  }
  return null;
}

function toJS(node: AnyNode): string {
  switch (node.type) {
    case 'ConstantNode':
      if (typeof node.value !== 'number') throw new ExprError('seuls les nombres sont acceptés');
      return `(${String(node.value)})`;
    case 'SymbolNode': {
      const name = node.name!;
      if (name === 'n') return 'n';
      if (name in CONSTANTS) return CONSTANTS[name];
      if (name in BUILTINS) throw new ExprError(`ajoutez des parenthèses : ${name}(…)`);
      return `P[${JSON.stringify(name)}]`;
    }
    case 'ParenthesisNode':
      return `(${toJS(node.content!)})`;
    case 'ConditionalNode':
      return `((${toJS(node.condition!)}) ? (${toJS(node.trueExpr!)}) : (${toJS(node.falseExpr!)}))`;
    case 'OperatorNode': {
      const f = fnName(node);
      const a = node.args ?? [];
      if (f in BINARY) return `(${toJS(a[0])}${BINARY[f]}${toJS(a[1])})`;
      if (f in COMPARE) return `((${toJS(a[0])}${COMPARE[f]}${toJS(a[1])}) ? 1 : 0)`;
      switch (f) {
        case 'pow': return `Math.pow(${toJS(a[0])},${toJS(a[1])})`;
        case 'unaryMinus': return `(-${toJS(a[0])})`;
        case 'unaryPlus': return `(+${toJS(a[0])})`;
        case 'mod': return `M.mod(${toJS(a[0])},${toJS(a[1])})`;
        case 'factorial': return `M.factorial(${toJS(a[0])})`;
        case 'and': return `((${toJS(a[0])}) && (${toJS(a[1])}) ? 1 : 0)`;
        case 'or': return `((${toJS(a[0])}) || (${toJS(a[1])}) ? 1 : 0)`;
        case 'not': return `((${toJS(a[0])}) ? 0 : 1)`;
      }
      throw new ExprError(`opérateur « ${node.op} » non pris en charge`);
    }
    case 'FunctionNode': {
      const name = fnName(node);
      const args = (node.args ?? []).map(toJS);
      if (SEQ_SET.has(name)) {
        if (args.length !== 1) throw new ExprError(`${name}(…) attend un seul indice`);
        return `S[${JSON.stringify(name)}](${args[0]})`;
      }
      if (name in BUILTINS) return `M[${JSON.stringify(name)}](${args.join(',')})`;
      throw new ExprError(`fonction inconnue « ${name} »`);
    }
  }
  throw new ExprError('expression non prise en charge');
}

function makeStep(code: string, t: Tables): StepFn {
  return new Function('M', 'P', `"use strict"; return function (n, S) { return ${code}; };`)(t.M, t.P) as StepFn;
}

// ─── Écriture mathématique ───────────────────────────────────────────────────

function indexTex(offset: number): string {
  return offset === 0 ? 'n' : offset > 0 ? `n+${offset}` : `n-${-offset}`;
}

export function termTex(name: string, index: string | number): string {
  return `${name}_{${index}}`;
}

const SUBSCRIPT: Record<string, string> = {
  n: 'ₙ', k: 'ₖ', '+': '₊', '-': '₋', '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
};

/** Terme en texte brut avec indice Unicode : termText('u', 12) → u₁₂. */
export function termText(name: string, index: string | number): string {
  return name + [...String(index)].map((c) => SUBSCRIPT[c] ?? c).join('');
}

const TEX_FUNCS = new Set(['ln', 'sin', 'cos', 'tan', 'sinh', 'cosh', 'tanh', 'arcsin', 'arccos', 'arctan', 'exp']);

/** LaTeX d'une expression : u(n+1) → u_{n+1}, conventions françaises. */
function texOf(node: AnyNode): string {
  const handler = (n: AnyNode, options: object): string | undefined => {
    if (n.type === 'FunctionNode' && SEQ_SET.has(fnName(n))) {
      const arg = n.args![0];
      const off = indexOffset(arg);
      return termTex(fnName(n), off !== null ? indexTex(off) : arg.toTex(options));
    }
    if (n.type === 'FunctionNode') {
      const args = n.args!.map((a) => a.toTex(options));
      const name = fnName(n);
      if (name === 'sqrt' && args.length === 1) return `\\sqrt{${args[0]}}`;
      if (name === 'abs' && args.length === 1) return `\\left|${args[0]}\\right|`;
      if ((name === 'floor' || name === 'ent') && args.length === 1) return `\\left\\lfloor${args[0]}\\right\\rfloor`;
      if (name === 'exp' && args.length === 1) return `\\mathrm{e}^{${args[0]}}`;
      if (name === 'log' && args.length === 1) return `\\log\\left(${args[0]}\\right)`;
      if (TEX_FUNCS.has(name)) return `\\${name}\\left(${args.join(',')}\\right)`;
    }
    return undefined;
  };
  return frenchTex(node.toTex({ parenthesis: 'auto', implicit: 'hide', handler }))
    .replace(/(\d)~\s*/g, '$1')
    .replace(/~\s*/g, '\\,')
    .replace(/\{\s+/g, '{');
}

// ─── Python (algorithme de seuil) ────────────────────────────────────────────

const PY_FUNCS: Record<string, string> = {
  sqrt: 'sqrt', exp: 'exp', ln: 'log', sin: 'sin', cos: 'cos', tan: 'tan', abs: 'abs', floor: 'floor', ent: 'floor', ceil: 'ceil',
  round: 'round', atan: 'atan', arctan: 'atan', asin: 'asin', acos: 'acos',
};

/** Traduction en Python ; `self` : nom de la variable Python du terme courant. */
function toPython(node: AnyNode, P: Record<string, number>, self: string, prev: string | null): string {
  const py = (n: AnyNode) => toPython(n, P, self, prev);
  switch (node.type) {
    case 'ConstantNode':
      return String(node.value);
    case 'SymbolNode': {
      const name = node.name!;
      if (name === 'n') return 'n';
      if (name === 'pi') return 'pi';
      if (name === 'e') return 'e';
      if (name in P) return name;
      throw new ExprError('symbole');
    }
    case 'ParenthesisNode':
      return `(${py(node.content!)})`;
    case 'ConditionalNode':
      return `(${py(node.trueExpr!)} if ${py(node.condition!)} else ${py(node.falseExpr!)})`;
    case 'OperatorNode': {
      const f = fnName(node);
      const a = node.args ?? [];
      const ops: Record<string, string> = { ...BINARY, pow: '**', mod: '%', smaller: '<', larger: '>', smallerEq: '<=', largerEq: '>=', equal: '==', unequal: '!=' };
      if (f === 'unaryMinus') return `-${py(a[0])}`;
      if (f === 'unaryPlus') return py(a[0]);
      if (f in ops) return `${py(a[0])} ${ops[f]} ${py(a[1])}`;
      throw new ExprError('opérateur');
    }
    case 'FunctionNode': {
      const name = fnName(node);
      if (SEQ_SET.has(name)) {
        if (name !== self) throw new ExprError('autre suite');
        const off = indexOffset(node.args?.[0]);
        if (off === 0) return self;
        if (off === -1 && prev) return prev;
        throw new ExprError('indice');
      }
      if (name === 'log' && node.args!.length === 1) return `log10(${py(node.args![0])})`;
      if (name in PY_FUNCS) return `${PY_FUNCS[name]}(${node.args!.map(py).join(', ')})`;
      throw new ExprError('fonction');
    }
  }
  throw new ExprError('nœud');
}

// ─── Programme ───────────────────────────────────────────────────────────────

export class SequenceProgram {
  readonly P: Record<string, number> = {};
  readonly seqs: CompiledSeq[];
  /** Paramètres libres (a, q, r…) → curseurs. */
  readonly params: string[];
  private memo = new Map<string, Map<number, number>>();

  constructor(defs: SeqDef[], params: Record<string, number> = {}) {
    const tables: Tables = { M: BUILTINS, P: this.P };
    const allParams = new Set<string>();
    const nodes = new Map<CompiledSeq, AnyNode>();
    this.seqs = defs.map((def) => {
      const out: CompiledSeq = { def, order: def.kind === 'explicit' ? 0 : 1, initTex: [], inits: [], autonomous: false };
      try {
        const node = rewrite(parseExpr(def.expr));
        const use = uses(node);
        use.params.forEach((p) => allParams.add(p));
        for (const r of use.refs) {
          if (!defs.some((d) => d.name === r.name)) throw new ExprError(`la suite ${r.name} n'est pas définie`);
        }
        const self = use.refs.filter((r) => r.name === def.name);
        out.rhsTex = texOf(node);
        if (def.kind === 'explicit') {
          if (self.length) throw new ExprError(`${def.name} dépend d'elle-même : choisissez « Récurrente »`);
          out.tex = `${termTex(def.name, 'n')}=${texOf(node)}`;
        } else {
          if (self.some((r) => r.offset !== null && r.offset > 0)) throw new ExprError(`${termText(def.name, 'n+1')} ne peut dépendre que des termes précédents`);
          out.order = self.some((r) => r.offset !== null && r.offset <= -1) ? 2 : 1;
          if (self.some((r) => r.offset !== null && r.offset < -1)) throw new ExprError('récurrence d\'ordre supérieur à 2 non prise en charge');
          out.tex = `${termTex(def.name, 'n+1')}=${texOf(node)}`;
          out.autonomous = out.order === 1 && !use.usesN && use.refs.every((r) => r.name === def.name && r.offset === 0);
        }
        out.step = makeStep(toJS(node), tables);
        // Termes initiaux
        if (def.kind === 'recursive') {
          for (let i = 0; i < out.order; i++) {
            const src = def.init[i]?.trim() || '1';
            const initNode = rewrite(parseExpr(src));
            const iu = uses(initNode);
            if (iu.refs.length || iu.usesN) throw new ExprError(`${termText(def.name, def.n0 + i)} : valeur numérique attendue`);
            iu.params.forEach((p) => allParams.add(p));
            const f = makeStep(toJS(initNode), tables);
            out.inits.push(() => f(0, {}));
            out.initTex.push(`${termTex(def.name, def.n0 + i)}=${texOf(initNode)}`);
          }
        }
        nodes.set(out, node);
      } catch (err) {
        out.error = (err as Error).message;
        out.step = undefined;
      }
      return out;
    });
    this.params = [...allParams].sort();
    for (const p of this.params) this.P[p] = params[p] ?? 1;
    for (const [seq, node] of nodes) seq.python = pythonOf(node, seq.def, seq.order, this.P);
  }

  setParam(name: string, value: number): void {
    this.P[name] = value;
    this.memo.clear();
  }

  private getters(): Record<string, Getter> {
    const S: Record<string, Getter> = {};
    for (const seq of this.seqs) S[seq.def.name] = (k) => this.term(seq, k, S);
    return S;
  }

  private term(seq: CompiledSeq, k: number, S: Record<string, Getter>): number {
    const { def } = seq;
    if (!seq.step || !Number.isInteger(k) || k < def.n0) return Number.NaN;
    let memo = this.memo.get(def.name);
    if (!memo) this.memo.set(def.name, (memo = new Map()));
    const known = memo.get(k);
    if (known !== undefined) {
      if (Number.isNaN(known) && pending.has(`${def.name}:${k}`)) throw new ExprError('définition circulaire');
      return known;
    }
    const key = `${def.name}:${k}`;
    pending.add(key);
    memo.set(k, Number.NaN);
    try {
      let v: number;
      if (seq.order === 0) v = seq.step(k, S);
      else if (k - def.n0 < seq.order) v = seq.inits[k - def.n0]();
      else v = seq.step(k - 1, S);
      memo.set(k, v);
      return v;
    } finally {
      pending.delete(key);
    }
  }

  /** Termes u(n₀)…u(nMax) de chaque suite (NaN si non définis). */
  compute(nMax: number): Map<SeqName, number[]> {
    this.memo.clear();
    const S = this.getters();
    const out = new Map<SeqName, number[]>();
    for (const seq of this.seqs) out.set(seq.def.name, []);
    // Calcul dans l'ordre croissant des indices : la récursion reste peu profonde.
    const maxN = Math.max(0, Math.min(nMax, 100000));
    for (let k = 0; k <= maxN; k++) {
      for (const seq of this.seqs) {
        if (k < seq.def.n0) continue;
        let v = Number.NaN;
        if (!seq.error) {
          try {
            v = this.term(seq, k, S);
          } catch (err) {
            seq.error = (err as Error).message;
            seq.step = undefined;
          }
        }
        out.get(seq.def.name)!.push(v);
      }
    }
    return out;
  }

  /** Relation autonome g telle que uₙ₊₁ = g(uₙ) (toile d'araignée, points fixes). */
  mapOf(name: SeqName): ((x: number) => number) | null {
    const seq = this.seqs.find((s) => s.def.name === name);
    if (!seq?.step || !seq.autonomous) return null;
    const step = seq.step;
    return (x: number) => step(0, { [name]: () => x });
  }

  /** Plus petit n ≥ n₀ tel que uₙ vérifie la condition (recherche jusqu'à `limit`). */
  threshold(name: SeqName, op: ThresholdOp, A: number, limit = 100000): { n: number; value: number } | null {
    const seq = this.seqs.find((s) => s.def.name === name);
    if (!seq?.step) return null;
    this.memo.clear();
    const S = this.getters();
    const test = OPS[op];
    for (let k = seq.def.n0; k <= limit; k++) {
      let v: number;
      try {
        v = this.term(seq, k, S);
      } catch {
        return null;
      }
      if (test(v, A)) return { n: k, value: v };
      if (!Number.isFinite(v)) return null;
    }
    return null;
  }
}

/** Indices en cours de calcul (détection des définitions circulaires entre suites). */
const pending = new Set<string>();

export type ThresholdOp = '>' | '>=' | '<' | '<=';
const OPS: Record<ThresholdOp, (v: number, a: number) => boolean> = {
  '>': (v, a) => v > a, '>=': (v, a) => v >= a, '<': (v, a) => v < a, '<=': (v, a) => v <= a,
};
/** Condition de la boucle « tant que » (négation). */
export const NEGATION: Record<ThresholdOp, string> = { '>': '<=', '>=': '<', '<': '>=', '<=': '>' };

function pythonOf(node: AnyNode, def: SeqDef, order: number, P: Record<string, number>): CompiledSeq['python'] {
  try {
    const expr = toPython(node, P, def.name, order === 2 ? `${def.name}_prec` : null);
    const inits = def.kind === 'recursive'
      ? Array.from({ length: order }, (_, i) => toPython(rewrite(parseExpr(def.init[i]?.trim() || '1')), P, def.name, null))
      : [];
    return { expr, inits };
  } catch {
    return undefined;
  }
}

/** Programme Python de l'algorithme de seuil (programme de lycée). */
export function thresholdPython(seq: CompiledSeq, op: ThresholdOp, A: string, P: Record<string, number>): string | null {
  const py = seq.python;
  if (!py) return null;
  const { name, n0 } = seq.def;
  const cond = NEGATION[op];
  const uses = (id: string) => new RegExp(`\\b${id}\\b`).test(py.expr);
  const params = Object.keys(P).filter(uses);
  const needsMath = /\b(sqrt|exp|log|log10|sin|cos|tan|floor|ceil|atan|asin|acos|pi|e)\b/.test(py.expr + py.inits.join(' '));
  const lines: string[] = [];
  if (needsMath) lines.push('from math import *', '');
  lines.push(`def seuil(A):`);
  for (const p of params) lines.push(`    ${p} = ${P[p]}`);
  lines.push(`    n = ${n0}`);
  if (seq.order === 0) {
    lines.push(`    while ${py.expr} ${cond} A:`, '        n = n + 1', '    return n');
  } else if (seq.order === 1) {
    lines.push(`    ${name} = ${py.inits[0]}`, `    while ${name} ${cond} A:`, `        ${name} = ${py.expr}`, '        n = n + 1', '    return n');
  } else {
    // Ordre 2 : on garde le terme précédent.
    lines.push(
      `    ${name}_prec = ${py.inits[0]}`,
      `    ${name} = ${py.inits[1]}`,
      `    if ${name}_prec ${cond === '<=' ? '>' : cond === '<' ? '>=' : cond === '>=' ? '<' : '<='} A:`,
      '        return n',
      '    n = n + 1',
      `    while ${name} ${cond} A:`,
      `        ${name}_prec, ${name} = ${name}, ${py.expr}`,
      '        n = n + 1',
      '    return n',
    );
  }
  lines.push('', `print(seuil(${A}))`);
  return lines.join('\n');
}

// ─── Observations ────────────────────────────────────────────────────────────

export type Nature =
  | { kind: 'constant'; value: number }
  | { kind: 'arithmetic'; r: number }
  | { kind: 'geometric'; q: number }
  | { kind: 'arith-geo'; a: number; b: number; l: number };

const close = (a: number, b: number, scale: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, scale);

/** Suite arithmétique, géométrique, constante (vérifié sur les termes calculés). */
export function detectNature(values: number[], g?: ((x: number) => number) | null): Nature | null {
  const vals = values.slice(0, 60);
  if (vals.length < 3 || vals.some((v) => !Number.isFinite(v))) return null;
  const scale = Math.max(...vals.map(Math.abs));
  if (vals.every((v) => close(v, vals[0], scale))) return { kind: 'constant', value: vals[0] };
  const r = vals[1] - vals[0];
  if (vals.every((v, i) => i === 0 || close(v - vals[i - 1], r, scale))) return { kind: 'arithmetic', r: clean(r) };
  // Géométrique : on s'arrête avant que les termes ne se noient dans les erreurs d'arrondi
  // (vₙ = uₙ − 6 quand uₙ → 6).
  const end = vals.findIndex((v) => Math.abs(v) <= 1e-9 * scale);
  const sig = end < 0 ? vals : vals.slice(0, end);
  if (sig.length >= 3 && (end < 0 || vals.slice(end).every((v) => Math.abs(v) <= 1e-9 * scale))) {
    const q = sig[1] / sig[0];
    if (sig.every((v, i) => i === 0 || close(v / sig[i - 1], q, Math.abs(q) * 1e3))) return { kind: 'geometric', q: clean(q) };
  }
  // Arithmético-géométrique : g affine, g(x) = a·x + b avec a ≠ 1.
  if (g) {
    const b = g(0);
    const a = g(1) - b;
    const ok = [-3, 2, 7.5].every((x) => close(g(x), a * x + b, Math.abs(a * x) + Math.abs(b)));
    if (ok && Number.isFinite(a) && Number.isFinite(b) && !close(a, 1, 1) && a !== 0 && b !== 0) {
      return { kind: 'arith-geo', a: clean(a), b: clean(b), l: clean(b / (1 - a)) };
    }
  }
  return null;
}

/** Arrondi des erreurs de représentation : 0,30000000000000004 → 0,3. */
function clean(x: number): number {
  return Number(x.toPrecision(12));
}

export type Monotony =
  | { kind: 'increasing' | 'decreasing'; from: number; strict: boolean }
  | { kind: 'constant' }
  | { kind: 'none' };

/** Sens de variation sur les termes calculés, éventuellement à partir d'un certain rang. */
export function detectMonotony(values: number[], n0: number): Monotony {
  const vals = values.filter(Number.isFinite);
  if (vals.length < 3 || vals.length !== values.length) return { kind: 'none' };
  const diffs = vals.slice(1).map((v, i) => v - vals[i]);
  const scale = Math.max(...vals.map(Math.abs));
  const eps = 1e-12 * Math.max(1, scale);
  if (diffs.every((d) => Math.abs(d) <= eps)) return { kind: 'constant' };
  // Plus petit rang à partir duquel la suite est monotone, pour chaque sens.
  const startOf = (ok: (d: number) => boolean) => {
    let start = diffs.length;
    while (start > 0 && ok(diffs[start - 1])) start--;
    return start;
  };
  const up = startOf((d) => d >= -eps);
  const down = startOf((d) => d <= eps);
  const kind = up <= down ? 'increasing' : 'decreasing';
  const start = Math.min(up, down);
  if (diffs.length - start < Math.max(4, diffs.length * 0.6)) return { kind: 'none' };
  return { kind, from: n0 + start, strict: diffs.slice(start).every((d) => Math.abs(d) > eps) };
}

export type Limit =
  | { kind: 'converges'; limit: number }
  | { kind: 'infinite'; sign: 1 | -1 }
  | { kind: 'cycle'; values: number[] }
  | { kind: 'unknown' };

/** Conjecture sur le comportement à l'infini à partir des derniers termes calculés. */
export function conjectureLimit(values: number[], n0 = 0): Limit {
  const n = values.length;
  if (n < 8) return { kind: 'unknown' };
  const last = values[n - 1];
  if (last === Infinity || last > 1e12) return { kind: 'infinite', sign: 1 };
  if (last === -Infinity || last < -1e12) return { kind: 'infinite', sign: -1 };
  if (!values.slice(-8).every(Number.isFinite)) return { kind: 'unknown' };
  const tail = values.slice(-Math.max(6, Math.floor(n / 4)));
  const scale = Math.max(1, ...tail.map(Math.abs));
  const spread = Math.max(...tail) - Math.min(...tail);
  if (spread <= 1e-7 * scale) return { kind: 'converges', limit: clean(Number(last.toPrecision(10))) };
  // Cycle de période p (2 à 8).
  for (let p = 2; p <= 8; p++) {
    if (n < 3 * p + 2) break;
    let ok = true;
    for (let i = 1; i <= 2 * p && ok; i++) ok = Math.abs(values[n - i] - values[n - i - p]) <= 1e-7 * scale;
    if (ok) {
      const cycle = values.slice(n - p);
      if (new Set(cycle.map((v) => v.toPrecision(7))).size === p) return { kind: 'cycle', values: cycle };
    }
  }
  // Convergence lente mais géométrique : écarts qui décroissent régulièrement → accélération d'Aitken.
  const d = tail.slice(1).map((v, i) => v - tail[i]);
  const ratios = d.slice(1).map((x, i) => (d[i] !== 0 ? x / d[i] : Number.NaN));
  const r = ratios[ratios.length - 1];
  if (ratios.every((q) => Number.isFinite(q) && Math.abs(q) < 0.97 && Math.abs(q - r) < 0.05)) {
    const [a, b, c] = tail.slice(-3);
    const den = c - 2 * b + a;
    const limit = den !== 0 ? c - ((c - b) * (c - b)) / den : c;
    if (Number.isFinite(limit)) return { kind: 'converges', limit: clean(Number(limit.toPrecision(8))) };
  }
  // Suite monotone dont les écarts décroissent comme k^(−p) : la série des écarts converge
  // si p > 1 (limite ≈ u_N + Σ écarts restants), diverge si p ≤ 1 (√n, ln n, n…).
  const sign = Math.sign(d[0]);
  if (sign !== 0 && d.every((x) => Math.sign(x) === sign)) {
    const k2 = n0 + n - 1 || 1;
    const k1 = n0 + n - tail.length + 1 || 1;
    const d1 = Math.abs(d[0]);
    const d2 = Math.abs(d[d.length - 1]);
    const p = k2 > k1 && k1 > 0 ? -Math.log(d2 / d1) / Math.log(k2 / k1) : Number.NaN;
    if (p > 1.15) {
      const limit = last + (sign * d2 * k2) / (p - 1);
      // Extrapolation approximative : on n'affiche que les chiffres significatifs fiables.
      const step = 10 ** Math.ceil(Math.log10(Math.max(Math.abs(last - limit) * 0.2, 1e-12)));
      const rounded = Math.round(limit / step) * step + 0;
      if (Number.isFinite(rounded)) return { kind: 'converges', limit: clean(rounded) };
    }
    if (!(p > 1.02)) return { kind: 'infinite', sign: sign as 1 | -1 };
  }
  return { kind: 'unknown' };
}

export interface FixedPoint {
  x: number;
  /** |g′(ℓ)| < 1 : attractif ; > 1 : répulsif. */
  slope: number;
}

/** Points fixes de g (solutions de g(x) = x) sur [a ; b]. */
export function fixedPoints(g: (x: number) => number, a: number, b: number): FixedPoint[] {
  const h = (x: number) => g(x) - x;
  const out: FixedPoint[] = [];
  const N = 800;
  let x0 = a;
  let h0 = h(x0);
  for (let i = 1; i <= N; i++) {
    const x1 = a + ((b - a) * i) / N;
    const h1 = h(x1);
    if (Number.isFinite(h0) && Number.isFinite(h1)) {
      let root: number | null = null;
      if (h0 === 0) root = x0;
      else if (h0 * h1 < 0) root = brentRoot(h, x0, x1);
      // Un changement de signe peut venir d'un pôle (1 + 1/x en 0) : on vérifie g(ℓ) ≈ ℓ.
      const isRoot = root !== null && Number.isFinite(root) && Math.abs(h(root)) < 1e-6 * (1 + Math.abs(root));
      if (isRoot && !out.some((p) => Math.abs(p.x - root!) < 1e-7 * Math.max(1, Math.abs(root!)))) {
        out.push({ x: clean(Number(root!.toPrecision(12))), slope: derivative(g, root!) });
      }
    }
    x0 = x1;
    h0 = h1;
  }
  return out.slice(0, 6);
}

/** Somme des termes calculés. */
export function sum(values: number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}
