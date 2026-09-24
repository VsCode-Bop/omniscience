/**
 * Moteur de la calculatrice : syntaxe française (virgule décimale, ln, log décimal…),
 * calcul exact (fractions, radicaux, π), approché, symbolique (développer,
 * factoriser, dériver, résoudre, primitive), unités, complexes et matrices.
 */
import { all, create, type MathNode } from 'mathjs';
import { factorize as primeFactors, fmtBig, isPrime } from '../arithmetic/numbers';
import { fmt } from '../../core/math/format';
import { fnName, frenchTex, normalizeSource, type AnyNode } from '../../core/math/lang';
import { integrate } from '../../core/math/numeric';
import { degree, evalPoly, factorRational, identify, numericRoots, Q, quadraticRoots, trim, type Poly } from './exact';

// Trois instances : nombres flottants, fractions exactes, grands nombres (64 chiffres).
const M = create(all);
const MF = create(all, { number: 'Fraction' });
const MB = create(all, { number: 'BigNumber', precision: 64 });

// Références internes, capturées avant le verrouillage ci-dessous (et instanciées avec leurs dépendances).
const parse = M.parse;
const evaluate = M.evaluate;
const simplify = M.simplify;
const derivative = M.derivative;
const rationalize = M.rationalize;
const evaluateFraction = MF.evaluate;
const evaluateBig = MB.evaluate;

// Sécurité : une expression reçue par lien de partage ne peut ni évaluer du texte,
// ni importer de fonctions, ni créer d'unités.
const forbidden = () => {
  throw new Error('fonction non disponible');
};
for (const inst of [M, MF, MB]) {
  inst.import({ import: forbidden, createUnit: forbidden, reviver: forbidden, evaluate: forbidden, parse: forbidden }, { override: true });
}

const asAny = (n: MathNode) => n as unknown as AnyNode;
const asMath = (n: AnyNode) => n as unknown as MathNode;

/** Noms français → fonctions mathjs. */
const ALIASES: Record<string, string> = {
  ln: 'log', racine: 'sqrt', ent: 'floor', partieEntiere: 'floor', arrondi: 'round', arcsin: 'asin', arccos: 'acos', arctan: 'atan',
  pgcd: 'gcd', ppcm: 'lcm', fact: 'factorial', factorielle: 'factorial', binome: 'combinations', combinaison: 'combinations',
  arrangement: 'permutations', moyenne: 'mean', mediane: 'median', reste: 'mod', alea: 'random', conjugue: 'conj', argument: 'arg',
  inverse: 'inv', transposee: 'transpose', det: 'det', trace: 'trace',
};

export type CalcResult =
  | { kind: 'value'; input: string; inputTex: string; exact?: { tex: string; text: string }; approx: string; approxTex: string; exactIsApprox: boolean }
  | { kind: 'symbolic'; input: string; inputTex: string; tex: string; text: string; note?: string }
  | { kind: 'assign'; input: string; inputTex: string; tex: string; text: string }
  | { kind: 'error'; input: string; inputTex?: string; message: string };

export class CalcError extends Error {}

/** Texte saisi → syntaxe mathjs (symboles typographiques, virgule décimale, « ; »). */
export function preprocess(src: string): string {
  let s = normalizeSource(src);
  // Virgule décimale hors des crochets (dans [1,2] la virgule sépare des coefficients).
  let depth = 0;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '[') depth++;
    if (c === ']') depth--;
    out += c === ',' && depth === 0 && /\d/.test(s[i - 1] ?? '') && /\d/.test(s[i + 1] ?? '') ? '.' : c;
  }
  s = out.replace(/;/g, ',');
  // Affectation « 5 → a » (style calculatrice)
  const arrow = /^(.*?)(?:→|->)\s*([a-zA-Z]\w*)\s*$/.exec(s);
  if (arrow) s = `${arrow[2]} = ${arrow[1].trim()}`;
  return s.replace(/\bans\b/g, 'ans');
}

/** Conventions françaises dans l'arbre : ln → log (népérien), log → log10, alias. */
function toMathjs(node: AnyNode, scope: Map<string, unknown>): AnyNode {
  return node.transform((n) => {
    if (n.type !== 'FunctionNode') return n;
    const name = fnName(n);
    const args = (n.args ?? []).map((a) => toMathjs(a, scope));
    if (name === 'log' && args.length === 1) return asAny(new M.FunctionNode('log10', args.map(asMath)));
    const target = ALIASES[name] ?? name;
    // x(x+1) : produit si x n'est ni une fonction connue ni une fonction de l'utilisateur.
    const known = typeof (M as unknown as Record<string, unknown>)[target] === 'function' || typeof scope.get(target) === 'function';
    if (!known && args.length === 1 && /^[a-zA-Z]$/.test(name)) {
      return asAny(new M.OperatorNode('*', 'multiply', [new M.SymbolNode(name), asMath(args[0])], true));
    }
    return asAny(new M.FunctionNode(target, args.map(asMath)));
  });
}

/** mathjs → écriture française en LaTeX. */
export function texOf(node: AnyNode): string {
  const handler = (n: AnyNode, options: object): string | undefined => {
    if (n.type === 'FunctionNode') {
      const name = fnName(n);
      const args = (n.args ?? []).map((a) => a.toTex(options));
      if (name === 'log10' && args.length === 1) return `\\log\\left(${args[0]}\\right)`;
      if (name === 'log' && args.length === 1) return `\\ln\\left(${args[0]}\\right)`;
      if (name === 'sqrt') return `\\sqrt{${args[0]}}`;
    }
    return undefined;
  };
  return frenchTex(node.toTex({ parenthesis: 'auto', implicit: 'hide', handler }))
    .replace(/(\d)~\s*/g, '$1')
    .replace(/~\s*/g, '\\,')
    .replace(/bmatrix/g, 'pmatrix');
}

/** Argument d'une commande en LaTeX ; une équation « a = b » est rendue membre à membre. */
function argTex(a: string, scope: Map<string, unknown>): string {
  const sides = a.split(/=+/);
  if (sides.length === 2) {
    const l = tryTex(sides[0], scope);
    const r = tryTex(sides[1], scope);
    if (l && r) return `${l}=${r}`;
  }
  return tryTex(a, scope) || `\\text{${a.replace(/[\\{}^_$&#%~]/g, '')}}`;
}

function tryTex(src: string, scope: Map<string, unknown>): string {
  try {
    return texOf(toMathjs(asAny(parse(src)), scope));
  } catch {
    return '';
  }
}

/** Vrai si l'expression ne contient que des opérations rationnelles sur des nombres. */
function isRational(node: AnyNode): boolean {
  let ok = true;
  node.traverse((n) => {
    if (!ok) return;
    switch (n.type) {
      case 'ConstantNode':
        if (typeof n.value !== 'number' && typeof n.value !== 'string') ok = false;
        break;
      case 'ParenthesisNode':
        break;
      case 'OperatorNode': {
        const f = fnName(n);
        if (!['add', 'subtract', 'multiply', 'divide', 'unaryMinus', 'unaryPlus', 'pow'].includes(f)) ok = false;
        if (f === 'pow') {
          let e = n.args![1];
          while (e.type === 'ParenthesisNode') e = e.content!;
          const neg = e.type === 'OperatorNode' && fnName(e) === 'unaryMinus';
          const base = neg ? e.args![0] : e;
          if (base.type !== 'ConstantNode' || !Number.isInteger(Number(base.value)) || Math.abs(Number(base.value)) > 4096) ok = false;
        }
        break;
      }
      default:
        ok = false;
    }
  });
  return ok;
}

function usesSymbols(node: AnyNode): Set<string> {
  const out = new Set<string>();
  node.traverse((n, path, parent) => {
    if (n.type === 'SymbolNode' && !(path === 'fn' && parent?.type === 'FunctionNode')) out.add(n.name!);
  });
  return out;
}

const CONSTS = new Set(['pi', 'e', 'i', 'Infinity', 'NaN', 'true', 'false', 'phi', 'tau']);

function fracQ(f: { s: bigint; n: bigint; d: bigint }): Q {
  return new Q(f.s * f.n, f.d);
}

/** Valeur décimale « à la française » avec 10 chiffres significatifs. */
function approxText(v: number): string {
  return fmt(v, 10);
}

function approxTex(v: number): string {
  if (!Number.isFinite(v)) return v > 0 ? '+\\infty' : v < 0 ? '-\\infty' : '\\text{indéfini}';
  const s = v.toPrecision(10);
  if (/e/.test(s)) {
    const [mant, exp] = Number(s).toExponential(9).split('e');
    return `${mant.replace(/\.?0+$/, '').replace('.', '{,}')}\\times 10^{${Number(exp)}}`;
  }
  return String(Number(s)).replace('.', '{,}');
}

// ─── Polynômes depuis mathjs ─────────────────────────────────────────────────

/** Coefficients rationnels d'un polynôme en une variable (null si ce n'en est pas un). */
function polyOf(node: AnyNode, variable: string): Poly | null {
  try {
    const r = rationalize(asMath(node), {}, true) as unknown as { variables: string[]; coefficients: number[]; denominator: MathNode | null };
    if (r.denominator && String(r.denominator) !== '1') return null;
    const vars = r.variables ?? [];
    if (vars.length > 1 || (vars.length === 1 && vars[0] !== variable)) return null;
    if (vars.length === 0) {
      const v = Number(evaluate(node.toString()));
      const q = Q.approx(v, 1_000_000_000, 1e-14);
      return q ? [q] : null;
    }
    const coeffs = r.coefficients.map((c) => Q.approx(Number(c), 1_000_000_000, 1e-14));
    if (coeffs.some((c) => c === null)) return null;
    return trim(coeffs as Q[]);
  } catch {
    return null;
  }
}

function polyTex(p: Poly, v: string): string {
  const terms: string[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const c = p[i];
    if (c.isZero()) continue;
    const neg = c.sign() < 0;
    const a = neg ? c.neg() : c;
    const coef = i > 0 && a.n === 1n && a.d === 1n ? '' : a.tex();
    const pow = i === 0 ? '' : i === 1 ? v : `${v}^{${i}}`;
    terms.push(`${neg ? '-' : terms.length ? '+' : ''}${coef}${pow}`);
  }
  return terms.join('') || '0';
}

function polyText(p: Poly, v: string): string {
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const terms: string[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const c = p[i];
    if (c.isZero()) continue;
    const neg = c.sign() < 0;
    const a = neg ? c.neg() : c;
    const coef = i > 0 && a.n === 1n && a.d === 1n ? '' : a.d === 1n ? String(a.n) : `(${a.n}/${a.d})`;
    const pow = i === 0 ? '' : i === 1 ? v : `${v}${String(i).replace(/\d/g, (d) => SUP[Number(d)])}`;
    terms.push(`${neg ? '−' : terms.length ? '+' : ''}${coef}${pow}`);
  }
  return terms.join(' ').replace(/ ([+−])/g, ' $1 ') || '0';
}

/** Facteur (x − r) en LaTeX. */
function linearTex(v: string, r: Q): string {
  if (r.isZero()) return v;
  return `\\left(${v}${r.sign() > 0 ? '-' : '+'}${(r.sign() > 0 ? r : r.neg()).tex()}\\right)`;
}

// ─── Commandes de calcul formel ──────────────────────────────────────────────

const COMMANDS = ['developper', 'factoriser', 'simplifier', 'deriver', 'resoudre', 'primitive', 'integrale', 'facteurs', 'premier', 'valeur'];

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Découpe les arguments au premier niveau de parenthèses. */
function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of s) {
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (c === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export class Calculator {
  readonly scope = new Map<string, unknown>();

  constructor() {
    this.scope.set('ans', 0);
  }

  /** Variables et fonctions définies par l'utilisateur. */
  variables(): { name: string; text: string }[] {
    const out: { name: string; text: string }[] = [];
    for (const [name, value] of this.scope) {
      if (name === 'ans') continue;
      if (typeof value === 'function') {
        const f = value as { syntax?: string };
        out.push({ name, text: f.syntax ?? `${name}(…)` });
      } else out.push({ name, text: `${name} = ${this.format(value)}` });
    }
    return out;
  }

  remove(name: string): void {
    this.scope.delete(name);
  }

  private format(v: unknown): string {
    if (typeof v === 'number') return approxText(v);
    try {
      return M.format(v as number, { precision: 10 });
    } catch {
      return String(v);
    }
  }

  run(raw: string): CalcResult {
    const input = raw.trim();
    if (!input) return { kind: 'error', input, message: 'Saisie vide' };
    let src: string;
    try {
      src = preprocess(input);
    } catch {
      return { kind: 'error', input, message: 'Saisie non reconnue' };
    }
    const cmd = /^([a-zA-Zéèêàùôîç]+)\s*\((.*)\)\s*$/.exec(src);
    if (cmd && COMMANDS.includes(stripAccents(cmd[1]).toLowerCase())) {
      try {
        return this.command(input, stripAccents(cmd[1]).toLowerCase(), splitArgs(cmd[2]));
      } catch (err) {
        return { kind: 'error', input, inputTex: '', message: frenchError((err as Error).message) };
      }
    }
    let node: AnyNode;
    try {
      node = toMathjs(asAny(parse(src)), this.scope);
    } catch (err) {
      return { kind: 'error', input, message: frenchError((err as Error).message) };
    }
    const inputTex = safe(() => texOf(node));
    try {
      if (node.type === 'AssignmentNode' || node.type === 'FunctionAssignmentNode') return this.assign(input, node, inputTex);
      return this.value(input, node, inputTex);
    } catch (err) {
      return { kind: 'error', input, inputTex, message: frenchError((err as Error).message) };
    }
  }

  private scopeObject(): Map<string, unknown> {
    return this.scope;
  }

  private assign(input: string, node: AnyNode, inputTex: string): CalcResult {
    const value = asMath(node).compile().evaluate(this.scopeObject());
    if (node.type === 'FunctionAssignmentNode') {
      return { kind: 'assign', input, inputTex, tex: inputTex, text: input };
    }
    const name = (node as unknown as { object?: { name: string }; name?: string }).object?.name ?? (node as unknown as { name?: string }).name ?? '';
    this.scope.set('ans', value);
    return { kind: 'assign', input, inputTex, tex: `${name}=${this.valueTex(value)}`, text: `${name} = ${this.format(value)}` };
  }

  private valueTex(v: unknown): string {
    if (typeof v === 'number') return approxTex(v);
    try {
      return texOf(asAny(parse(M.format(v as number, { precision: 10 }))));
    } catch {
      return `\\text{${String(v)}}`;
    }
  }

  private value(input: string, node: AnyNode, inputTex: string): CalcResult {
    const free = [...usesSymbols(node)].filter((s) => !CONSTS.has(s) && !this.scope.has(s) && !isUnit(s));
    if (free.length) {
      // Expression littérale : polynôme réduit et ordonné, sinon simplification.
      if (free.length === 1) {
        const p = polyOf(node, free[0]);
        if (p) return { kind: 'symbolic', input, inputTex, tex: polyTex(p, free[0]), text: polyText(p, free[0]), note: `Expression réduite et ordonnée (variable libre : ${free[0]})` };
      }
      const simp = asAny(simplify(asMath(node)));
      return { kind: 'symbolic', input, inputTex, tex: texOf(simp), text: simp.toString(), note: `Variable${free.length > 1 ? 's' : ''} libre${free.length > 1 ? 's' : ''} : ${free.join(', ')} (utilisez = pour affecter une valeur)` };
    }
    // Calcul exact en fractions si possible
    if (isRational(node) && !usesSymbols(node).size) {
      const f = evaluateFraction(node.toString()) as unknown as { s: bigint; n: bigint; d: bigint };
      const q = fracQ(f);
      const v = q.toNumber();
      this.scope.set('ans', v);
      const exact = { tex: q.tex(), text: q.text() };
      const approx = approxText(v);
      return { kind: 'value', input, inputTex, exact, approx, approxTex: approxTex(v), exactIsApprox: q.d === 1n && Math.abs(v) < 1e15 };
    }
    const value = asMath(node).compile().evaluate(this.scopeObject());
    this.scope.set('ans', value);
    if (typeof value === 'number') {
      let exact: { tex: string; text: string } | undefined;
      const symbols = usesSymbols(node);
      const hasDecimal = /\d\.\d/.test(node.toString());
      if (!hasDecimal && [...symbols].every((s) => s === 'pi' || s === 'e' || s === 'phi') && Number.isFinite(value)) {
        const found = identify({ value, check: (expr) => this.checkHigh(node, expr) });
        if (found) exact = found;
      }
      if (!exact && Number.isInteger(value) && Math.abs(value) < 1e15) exact = { tex: String(value), text: String(value).replace('-', '−') };
      return { kind: 'value', input, inputTex, exact, approx: approxText(value), approxTex: approxTex(value), exactIsApprox: !!exact && /^-?\d+$/.test(exact.text.replace('−', '-')) };
    }
    if (typeof value === 'boolean') return { kind: 'symbolic', input, inputTex, tex: value ? '\\text{vrai}' : '\\text{faux}', text: value ? 'vrai' : 'faux' };
    // Unités : valeur et unité séparées.
    if (M.isUnit(value)) {
      const u = value as unknown as { toNumber(unit?: string): number; formatUnits(): string };
      const units = u.formatUnits().replace(/\s+/g, '');
      const num = u.toNumber();
      return { kind: 'symbolic', input, inputTex, tex: `${approxTex(num)}\\,\\mathrm{${units.replace(/\^(\d+)/g, '^{$1}')}}`, text: `${approxText(num)} ${units}` };
    }
    // Matrices : coefficients exacts (fractions) quand la saisie est rationnelle.
    if (M.isMatrix(value) && !/\d\.\d/.test(node.toString())) {
      try {
        // Les puissances de matrices ne sont pas prises en charge en fractions :
        // Aⁿ devient A·A·…·A et A⁻ⁿ devient inv(A)·…·inv(A) (exposant entier ≤ 12).
        const rewritten = node.transform((n) => {
          if (n.type !== 'OperatorNode' || fnName(n) !== 'pow') return n;
          let e = n.args![1];
          while (e.type === 'ParenthesisNode') e = e.content!;
          const neg = e.type === 'OperatorNode' && fnName(e) === 'unaryMinus';
          const lit = neg ? e.args![0] : e;
          const k = lit.type === 'ConstantNode' ? Number(lit.value) : Number.NaN;
          if (!Number.isInteger(k) || k < 1 || k > 12) return n;
          const base = neg ? new M.FunctionNode('inv', [asMath(n.args![0])]) : new M.ParenthesisNode(asMath(n.args![0]));
          let prod: MathNode = base;
          for (let i = 1; i < k; i++) prod = new M.OperatorNode('*', 'multiply', [prod, base]);
          return asAny(prod);
        });
        const exact = evaluateFraction(rewritten.toString()) as unknown as { toArray(): unknown[] };
        const rows = exact.toArray().map((r) => (Array.isArray(r) ? r : [r]) as { s: bigint; n: bigint; d: bigint }[]);
        const tex = `\\begin{pmatrix}${rows.map((r) => r.map((f) => fracQ(f).tex()).join('&')).join('\\\\')}\\end{pmatrix}`;
        return { kind: 'symbolic', input, inputTex, tex, text: rows.map((r) => `[${r.map((f) => fracQ(f).text()).join(' ; ')}]`).join(' ') };
      } catch {
        /* coefficients non rationnels : affichage décimal */
      }
    }
    // Complexes, matrices, fractions…
    const text = M.format(value, { precision: 10 });
    let tex = '';
    try {
      tex = texOf(asAny(parse(text.replace(/(\d)\.(\d)/g, '$1.$2'))));
    } catch {
      tex = `\\text{${text.replace(/[{}\\]/g, '')}}`;
    }
    return { kind: 'symbolic', input, inputTex, tex, text: frenchNumber(text) };
  }

  /** Vérifie à 10⁻⁴⁰ près qu'une forme candidate égale l'expression (calcul en 64 chiffres). */
  private checkHigh(node: AnyNode, candidate: string): boolean {
    try {
      const a = evaluateBig(node.toString());
      const b = evaluateBig(candidate);
      const diff = MB.abs(MB.subtract(a, b) as never) as unknown as { toNumber(): number };
      const scale = MB.abs(a as never) as unknown as { toNumber(): number };
      return diff.toNumber() <= 1e-40 * Math.max(1, scale.toNumber());
    } catch {
      return false;
    }
  }

  // ─── Commandes ────────────────────────────────────────────────────────────

  private command(input: string, name: string, args: string[]): CalcResult {
    const need = (n: number) => {
      if (args.length < n) throw new CalcError(`${name} attend au moins ${n} argument${n > 1 ? 's' : ''}`);
    };
    const nodeOf = (s: string) => toMathjs(asAny(parse(s)), this.scope);
    const variableOf = (node: AnyNode, explicit?: string) => {
      if (explicit) return explicit.trim();
      const free = [...usesSymbols(node)].filter((s) => !CONSTS.has(s) && !this.scope.has(s));
      return free.includes('x') ? 'x' : free[0] ?? 'x';
    };
    const label = { developper: 'Développer', factoriser: 'Factoriser', simplifier: 'Simplifier', deriver: 'Dériver', resoudre: 'Résoudre', primitive: 'Primitive', integrale: 'Intégrale', facteurs: 'Facteurs premiers', premier: 'Premier', valeur: 'Valeur' }[name] ?? name;
    const inputTex = `\\text{${label}}\\left(${args.map((a) => argTex(a, this.scope)).join('\\,;\\,')}\\right)`;
    const result = (tex: string, text: string, note?: string): CalcResult => ({ kind: 'symbolic', input, inputTex, tex, text, note });

    switch (name) {
      case 'developper': {
        need(1);
        const node = nodeOf(args[0]);
        const v = variableOf(node, args[1]);
        const p = polyOf(node, v);
        if (p) return result(polyTex(p, v), polyText(p, v));
        const r = asAny(rationalize(asMath(node)));
        return result(texOf(r), r.toString());
      }
      case 'simplifier': {
        need(1);
        const s = asAny(simplify(asMath(nodeOf(args[0]))));
        return result(texOf(s), s.toString());
      }
      case 'factoriser': {
        need(1);
        const node = nodeOf(args[0]);
        // Entier : décomposition en facteurs premiers.
        if (!usesSymbols(node).size) {
          const v = evaluate(node.toString());
          if (typeof v === 'number' && Number.isInteger(v) && Math.abs(v) >= 2) return this.primeFactorization(input, inputTex, BigInt(v));
        }
        const v = variableOf(node, args[1]);
        const p = polyOf(node, v);
        if (!p || degree(p) < 1) throw new CalcError('factorisation disponible pour les polynômes à une variable et les entiers');
        return this.factorPoly(input, inputTex, p, v);
      }
      case 'deriver': {
        need(1);
        const node = nodeOf(args[0]);
        const v = variableOf(node, args[1]);
        const d = asAny(simplify(derivative(asMath(node), v)));
        return result(texOf(d), d.toString(), `Dérivée par rapport à ${v}`);
      }
      case 'primitive': {
        need(1);
        const node = nodeOf(args[0]);
        const v = variableOf(node, args[1]);
        const p = polyOf(node, v);
        if (!p) throw new CalcError('primitive exacte disponible pour les polynômes (utilisez integrale(f; a; b) pour une valeur numérique)');
        const P: Poly = [new Q(0n), ...p.map((c, i) => c.div(Q.int(i + 1)))];
        return result(`${polyTex(trim(P), v)}+C`, `${polyText(trim(P), v)} + C`, 'Primitive à une constante près');
      }
      case 'integrale': {
        need(3);
        const node = nodeOf(args[0]);
        const [va, a, b] = args.length >= 4 ? [args[1], args[2], args[3]] : [undefined, args[1], args[2]];
        const v = variableOf(node, va);
        const A = Number(evaluate(preprocess(a)));
        const B = Number(evaluate(preprocess(b)));
        const p = polyOf(node, v);
        if (p) {
          const P: Poly = [new Q(0n), ...p.map((c, i) => c.div(Q.int(i + 1)))];
          const qa = Q.approx(A, 1_000_000, 1e-14);
          const qb = Q.approx(B, 1_000_000, 1e-14);
          if (qa && qb) {
            const val = evalPoly(P, qb).sub(evalPoly(P, qa));
            return { kind: 'value', input, inputTex, exact: { tex: val.tex(), text: val.text() }, approx: approxText(val.toNumber()), approxTex: approxTex(val.toNumber()), exactIsApprox: val.d === 1n };
          }
        }
        const f = asMath(node).compile();
        const fn = (x: number) => Number(f.evaluate(new Map([...this.scope, [v, x]])));
        const val = integrate(fn, A, B);
        const found = identify({ value: val, check: () => false });
        void found;
        return { kind: 'value', input, inputTex, approx: approxText(val), approxTex: approxTex(val), exactIsApprox: false };
      }
      case 'resoudre': {
        need(1);
        const [lhs, rhs] = args[0].includes('=') ? args[0].split(/=+/) : [args[0], '0'];
        const node = nodeOf(`(${lhs}) - (${rhs ?? '0'})`);
        const v = variableOf(node, args[1]);
        return this.solve(input, inputTex, node, v);
      }
      case 'facteurs': {
        need(1);
        const v = evaluate(preprocess(args[0]));
        if (typeof v !== 'number' || !Number.isInteger(v)) throw new CalcError('un entier est attendu');
        return this.primeFactorization(input, inputTex, BigInt(v));
      }
      case 'premier': {
        need(1);
        const v = evaluate(preprocess(args[0]));
        if (typeof v !== 'number' || !Number.isInteger(v)) throw new CalcError('un entier est attendu');
        const p = isPrime(BigInt(v));
        return result(p ? '\\text{oui, nombre premier}' : '\\text{non}', p ? 'oui' : 'non');
      }
      case 'valeur': {
        need(1);
        return this.run(args[0]);
      }
    }
    throw new CalcError(`commande inconnue : ${name}`);
  }

  private primeFactorization(input: string, inputTex: string, n: bigint): CalcResult {
    const f = primeFactors(n);
    const neg = n < 0n;
    const tex = `${neg ? '-' : ''}${f.map(([p, e]) => `${p}${e > 1 ? `^{${e}}` : ''}`).join('\\times ')}`;
    const text = `${neg ? '−' : ''}${f.map(([p, e]) => `${fmtBig(p)}${e > 1 ? `^${e}` : ''}`).join(' × ')}`;
    return { kind: 'symbolic', input, inputTex, tex, text, note: f.length === 1 && f[0][1] === 1 ? 'nombre premier' : undefined };
  }

  private factorPoly(input: string, inputTex: string, p: Poly, v: string): CalcResult {
    const { lead, roots, rest } = factorRational(p);
    const parts: string[] = [];
    // Le facteur x (racine nulle) en tête : x(x + 1)(x − 1).
    const ordered = [...roots].sort((a, b) => (a[0].isZero() ? -1 : b[0].isZero() ? 1 : 0));
    for (const [r, m] of ordered) parts.push(`${linearTex(v, r)}${m > 1 ? `^{${m}}` : ''}`);
    let note: string | undefined;
    const restDeg = rest.length - 1;
    if (restDeg === 2) {
      const q = quadraticRoots(rest[1], rest[0]);
      if (!q.complex) {
        for (const r of q.roots) {
          // x − x₁ : « x + √2 » pour une racine −√2, « x − (1 + √5)/2 » sinon.
          const simple = !r.tex.includes(' ') && !r.tex.includes('\\frac');
          parts.push(simple && r.tex.startsWith('-') ? `\\left(${v}+${r.tex.slice(1)}\\right)` : `\\left(${v}-${simple || r.tex.startsWith('\\frac') ? r.tex : `\\left(${r.tex}\\right)`}\\right)`);
        }
        if (q.roots.length === 1) parts.push(parts.pop()!.concat('^{2}'));
      } else {
        parts.push(parts.length || !(lead.n === 1n && lead.d === 1n) ? `\\left(${polyTex(rest, v)}\\right)` : polyTex(rest, v));
        note = 'Le facteur du second degré n\'a pas de racine réelle (Δ < 0) : il ne se factorise pas dans ℝ.';
      }
    } else if (restDeg >= 1) {
      parts.push(parts.length || !(lead.n === 1n && lead.d === 1n) ? `\\left(${polyTex(rest, v)}\\right)` : polyTex(rest, v));
      note = 'Facteur restant sans racine rationnelle.';
    }
    const leadTex = lead.n === 1n && lead.d === 1n ? '' : lead.n === -1n && lead.d === 1n ? '-' : lead.tex();
    const tex = `${leadTex}${parts.join('') || polyTex(p, v)}`;
    return { kind: 'symbolic', input, inputTex, tex, text: tex, note };
  }

  private solve(input: string, inputTex: string, node: AnyNode, v: string): CalcResult {
    const p = polyOf(node, v);
    if (p && degree(p) >= 1) {
      const { roots, rest } = factorRational(p);
      const sols: { tex: string; value: number }[] = roots.map(([r]) => ({ tex: r.tex(), value: r.toNumber() }));
      let note: string | undefined;
      const restDeg = rest.length - 1;
      if (restDeg === 2) {
        const q = quadraticRoots(rest[1], rest[0]);
        if (q.complex) note = `Solutions complexes : ${q.roots.map((r) => r.text).join(' ; ')}`;
        else sols.push(...q.roots.map((r) => ({ tex: r.tex, value: r.value })));
      } else if (restDeg > 2) {
        for (const x of numericRoots(rest)) sols.push({ tex: `\\approx ${approxTex(x)}`, value: x });
        note = 'Racines non rationnelles de degré > 2 : valeurs approchées.';
      }
      sols.sort((a, b) => a.value - b.value);
      if (!sols.length) return { kind: 'symbolic', input, inputTex, tex: '\\mathcal{S}=\\varnothing', text: 'S = ∅', note: note ?? 'Aucune solution réelle' };
      return {
        kind: 'symbolic', input, inputTex,
        tex: `\\mathcal{S}=\\left\\{${sols.map((s) => s.tex).join('\\,;\\,')}\\right\\}`,
        text: `S = { ${sols.map((s) => approxText(s.value)).join(' ; ')} }`,
        note: note ?? (sols.some((s) => /sqrt|frac/.test(s.tex)) ? `Valeurs approchées : ${sols.map((s) => approxText(s.value)).join(' ; ')}` : undefined),
      };
    }
    // Équation non polynomiale : recherche numérique des changements de signe sur [−100 ; 100].
    const f = asMath(node).compile();
    const fn = (x: number) => Number(f.evaluate(new Map([...this.scope, [v, x]])));
    const found: number[] = [];
    const N = 20000;
    let x0 = -100;
    let y0 = fn(x0);
    for (let i = 1; i <= N; i++) {
      const x1 = -100 + (200 * i) / N;
      const y1 = fn(x1);
      if (Number.isFinite(y0) && Number.isFinite(y1) && (y0 === 0 || y0 * y1 < 0)) {
        let a = x0;
        let b = x1;
        for (let k = 0; k < 80; k++) {
          const m = (a + b) / 2;
          if (fn(a) * fn(m) <= 0) b = m;
          else a = m;
        }
        const r = (a + b) / 2;
        if (Math.abs(fn(r)) < 1e-6 * (1 + Math.abs(fn(x0)) + Math.abs(fn(x1))) && !found.some((z) => Math.abs(z - r) < 1e-7)) found.push(r);
      }
      x0 = x1;
      y0 = y1;
      if (found.length > 20) break;
    }
    if (!found.length) return { kind: 'symbolic', input, inputTex, tex: '\\text{Aucune solution trouvée sur }[-100\\,;100]', text: 'Aucune solution trouvée', note: 'Recherche numérique' };
    return {
      kind: 'symbolic', input, inputTex,
      tex: `\\mathcal{S}\\approx\\left\\{${found.map((x) => approxTex(Number(x.toPrecision(10)))).join('\\,;\\,')}\\right\\}`,
      text: `S ≈ { ${found.map((x) => approxText(x)).join(' ; ')} }`,
      note: 'Solutions approchées (recherche numérique sur [−100 ; 100])',
    };
  }
}

function isUnit(name: string): boolean {
  try {
    return M.Unit.isValuelessUnit(name);
  } catch {
    return false;
  }
}

function safe(fn: () => string): string {
  try {
    return fn();
  } catch {
    return '';
  }
}

function frenchNumber(s: string): string {
  return s.replace(/(\d)\.(\d)/g, '$1,$2');
}

function frenchError(message: string): string {
  const table: [RegExp, string][] = [
    [/Undefined symbol (\w+)/i, 'symbole inconnu : $1'],
    [/Undefined function (\w+)/i, 'fonction inconnue : $1'],
    [/Unexpected end of expression/i, 'expression incomplète'],
    [/Parenthesis \) expected/i, 'parenthèse fermante manquante'],
    [/Value expected/i, 'valeur attendue'],
    [/Unexpected operator (.*?) \(/i, 'opérateur « $1 » inattendu'],
    [/Unexpected type of argument/i, 'type d\'argument inattendu'],
    [/Too many arguments/i, 'trop d\'arguments'],
    [/Too few arguments/i, 'arguments manquants'],
    [/Dimension mismatch/i, 'dimensions incompatibles'],
    [/Units do not match/i, 'unités incompatibles'],
    [/Cannot convert/i, 'conversion impossible'],
    [/division par zéro|Division by zero/i, 'division par zéro'],
  ];
  for (const [re, fr] of table) {
    const m = re.exec(message);
    if (m) return fr.replace('$1', m[1] ?? '');
  }
  return message;
}

/** Écriture mathématique d'une saisie en cours (aperçu), ou chaîne vide si elle est incomplète. */
export function previewTex(input: string, calc: Calculator): string {
  const src = preprocess(input);
  const cmd = /^([a-zA-Zéèêàùôîç]+)\s*\((.*)\)\s*$/.exec(src);
  if (cmd && COMMANDS.includes(stripAccents(cmd[1]).toLowerCase())) {
    const args = splitArgs(cmd[2]).map((a) => argTex(a, calc.scope));
    return `\\mathrm{${stripAccents(cmd[1]).toLowerCase()}}\\left(${args.join('\\,;\\,')}\\right)`;
  }
  return tryTex(src, calc.scope);
}
