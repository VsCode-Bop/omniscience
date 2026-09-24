/**
 * Exercices de mathématiques du collège (cycle 4) : fractions, priorités, puissances,
 * calcul littéral, équations, Pythagore, trigonométrie, arithmétique.
 */
import { rightTriangle } from './figures';
import type { Rng } from './rng';
import {
  chain, coefBefore, dec, Frac, gcd, lin, lines, paren, poly, polyAdd, polyMul, rawFrac, round, solSet, sqrtParts, t, terms,
} from './tex';
import { distinct, type Difficulty, type Generator, type Item } from './types';

// ─── Fractions ─────────────────────────────────────────────────────────────

type F = [number, number];

function randFrac(rng: Rng, maxDen: number, allowNeg: boolean): F {
  for (;;) {
    const d = rng.int(2, maxDen);
    const n = rng.int(1, Math.max(3, d + 4));
    if (gcd(n, d) !== 1) continue;
    return [allowNeg && rng.chance(0.3) ? -n : n, d];
  }
}

const opnd = (n: number, d: number) => (n < 0 ? t`\left(${rawFrac(n, d)}\right)` : rawFrac(n, d));
const fr = (x: F) => new Frac(x[0], x[1]);

/** Somme ou différence avec mise au même dénominateur. */
function sumSteps(a: F, b: F, op: '+' | '-'): string[] {
  const L = Math.abs(a[1] * b[1]) / gcd(a[1], b[1]);
  const m1 = a[0] * (L / a[1]);
  const m2 = b[0] * (L / b[1]);
  const steps: string[] = [];
  if (a[1] !== L || b[1] !== L) steps.push(`${rawFrac(m1, L)} ${op} ${opnd(m2, L)}`);
  steps.push(rawFrac(op === '+' ? m1 + m2 : m1 - m2, L));
  steps.push(new Frac(op === '+' ? m1 + m2 : m1 - m2, L).tex());
  return steps;
}

function prodSteps(a: F, b: F): string[] {
  const neg = a[0] * b[0] < 0;
  return [
    t`${neg ? '-' : ''}\dfrac{${Math.abs(a[0])} \times ${Math.abs(b[0])}}{${a[1]} \times ${b[1]}}`,
    fr(a).mul(fr(b)).tex(),
  ];
}

const fractions: Generator = {
  id: 'fractions',
  title: 'Calculs avec des fractions',
  subject: 'maths',
  theme: 'Nombres et calculs',
  levels: ['5e', '4e', '3e'],
  desc: 'Sommes, différences, produits et quotients ; priorités ; résultat irréductible.',
  count: [2, 12, 6],
  countLabel: 'calculs',
  generate(rng, n, d) {
    const make = (i: number): Item => {
      if (d === 1) {
        const op = (['+', '-', '+', '×'] as const)[i % 4];
        const b = rng.int(2, 9);
        const dd = b * rng.pick([1, 1, 2, 3]);
        const coprime = (den: number) => {
          for (;;) {
            const num = rng.int(1, den + 3);
            if (gcd(num, den) === 1) return num;
          }
        };
        let x: F = [coprime(b), b];
        let y: F = [coprime(dd), dd];
        if (op === '×') {
          x = randFrac(rng, 9, false);
          y = randFrac(rng, 9, false);
          const q = `${rawFrac(...x)} \\times ${rawFrac(...y)}`;
          return { q: `$${q}$`, a: `$${chain([q, ...prodSteps(x, y)])}$` };
        }
        if (rng.chance(0.5)) [x, y] = [y, x];
        if (op === '-' && fr(x).value < fr(y).value) [x, y] = [y, x];
        const q = `${rawFrac(...x)} ${op} ${rawFrac(...y)}`;
        return { q: `$${q}$`, a: `$${chain([q, ...sumSteps(x, y, op)])}$` };
      }
      if (d === 2) {
        const op = (['+', '-', '×', '÷'] as const)[i % 4];
        const x = randFrac(rng, 12, true);
        const y = randFrac(rng, 12, true);
        const q = `${rawFrac(...x)} ${op === '×' ? '\\times' : op === '÷' ? '\\div' : op} ${opnd(...y)}`;
        if (op === '+' || op === '-') return { q: `$${q}$`, a: `$${chain([q, ...sumSteps(x, y, op)])}$` };
        if (op === '×') return { q: `$${q}$`, a: `$${chain([q, ...prodSteps(x, y)])}$` };
        const inv: F = [y[1] * Math.sign(y[0]), Math.abs(y[0])];
        return { q: `$${q}$`, a: `$${chain([q, `${rawFrac(...x)} \\times ${opnd(...inv)}`, ...prodSteps(x, inv)])}$` };
      }
      // Trois fractions et priorités
      const kind = i % 4;
      const x = randFrac(rng, 9, true);
      const y = randFrac(rng, 9, false);
      const z = randFrac(rng, 9, false);
      if (kind === 0 || kind === 1) {
        const op = kind === 0 ? '+' : '-';
        const mulOp = kind === 0 ? '\\times' : '\\div';
        const p = kind === 0 ? fr(y).mul(fr(z)) : fr(y).div(fr(z));
        const q = `${rawFrac(...x)} ${op} ${rawFrac(...y)} ${mulOp} ${rawFrac(...z)}`;
        return { q: `$${q}$`, a: `$${chain([q, `${rawFrac(...x)} ${op} ${p.texParen()}`, ...sumSteps(x, [p.n, p.d], op)])}$` };
      }
      const op = kind === 2 ? '+' : '-';
      const s = op === '+' ? fr(x).add(fr(y)) : fr(x).sub(fr(y));
      const mulOp = kind === 2 ? '\\times' : '\\div';
      const r = kind === 2 ? s.mul(fr(z)) : s.div(fr(z));
      const q = t`\left(${rawFrac(...x)} ${op} ${rawFrac(...y)}\right) ${mulOp} ${rawFrac(...z)}`;
      return { q: `$${q}$`, a: `$${chain([q, `${s.texParen()} ${mulOp} ${rawFrac(...z)}`, r.tex()])}$` };
    };
    return {
      intro: 'Calculer et donner le résultat sous la forme d\'une fraction irréductible.',
      items: distinct(n, make),
      numbering: 'alpha',
      cols: d === 3 ? 2 : 3,
    };
  },
};

// ─── Priorités opératoires ─────────────────────────────────────────────────

type Op = '+' | '-' | '*' | '/' | '^';
type Node = { v: number } | { op: Op; l: Node; r: Node };
const PREC: Record<Op, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 };
const isNum = (n: Node): n is { v: number } => 'v' in n;
const N = (v: number): Node => ({ v });
const O = (op: Op, l: Node, r: Node): Node => ({ op, l, r });

function evalNode(n: Node): number {
  if (isNum(n)) return n.v;
  const a = evalNode(n.l);
  const b = evalNode(n.r);
  switch (n.op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return a / b;
    default: return a ** b;
  }
}

function needsWrap(n: Node, parentPrec: number, right: boolean, base: boolean): boolean {
  if (isNum(n)) return false;
  const p = PREC[n.op];
  return base || p < parentPrec || (right && p === parentPrec);
}

function printNode(n: Node, parentPrec = 0, right = false, lead = true, base = false): string {
  if (isNum(n)) return n.v < 0 && (!lead || base) ? `(${dec(n.v)})` : dec(n.v);
  const wrap = needsWrap(n, parentPrec, right, base);
  const innerLead = wrap || lead;
  let s: string;
  if (n.op === '^') {
    s = `${printNode(n.l, 3, false, innerLead, true)}^{${(n.r as { v: number }).v}}`;
  } else {
    const p = PREC[n.op];
    const sym = { '+': '+', '-': '-', '*': '\\times', '/': '\\div' }[n.op];
    s = `${printNode(n.l, p, false, innerLead)} ${sym} ${printNode(n.r, p, true, false)}`;
  }
  return wrap ? `(${s})` : s;
}

/** Une étape de calcul : on effectue toutes les opérations prioritaires prêtes. */
function stepNode(root: Node): Node {
  let best = 0;
  const scan = (n: Node, pp: number, right: boolean, base: boolean) => {
    if (isNum(n)) return;
    const p = PREC[n.op];
    if (isNum(n.l) && isNum(n.r)) best = Math.max(best, needsWrap(n, pp, right, base) ? 4 : p);
    scan(n.l, n.op === '^' ? 3 : p, false, n.op === '^');
    if (n.op !== '^') scan(n.r, p, true, false);
  };
  scan(root, 0, false, false);
  const rebuild = (n: Node, pp: number, right: boolean, base: boolean): Node => {
    if (isNum(n)) return n;
    const p = PREC[n.op];
    if (isNum(n.l) && isNum(n.r) && (needsWrap(n, pp, right, base) ? 4 : p) === best) return N(evalNode(n));
    return O(n.op, rebuild(n.l, n.op === '^' ? 3 : p, false, n.op === '^'), n.op === '^' ? n.r : rebuild(n.r, p, true, false));
  };
  return rebuild(root, 0, false, false);
}

function priorityItem(rng: Rng, i: number, d: Difficulty): Item {
  const r = () => rng.nz(-9, 9);
  const p = () => rng.int(2, 12);
  let e: Node;
  if (d === 1) {
    const k = i % 4;
    if (k === 0) e = O('+', N(p()), O('*', N(p()), N(p())));
    else if (k === 1) e = O('+', O('*', N(p()), N(p())), O('*', N(p()), N(rng.int(2, 9))));
    else if (k === 2) e = O('*', O('+', N(p()), N(p())), N(rng.int(2, 9)));
    else {
      const b = rng.int(2, 6);
      const c = rng.int(2, 6);
      e = O('-', N(b * c + rng.int(1, 20)), O('*', N(b), N(c)));
    }
  } else if (d === 2) {
    const k = i % 5;
    if (k === 0) e = O('-', N(r()), O('*', N(r()), O('+', N(r()), N(r()))));
    else if (k === 1) e = O('*', O('-', N(r()), N(r())), O('-', N(r()), N(r())));
    else if (k === 2) e = O('-', O('*', N(r()), N(r())), O('*', N(r()), N(r())));
    else if (k === 3) e = O('-', O('+', N(r()), O('*', N(r()), N(r()))), N(r()));
    else {
      const c = rng.nz(-6, 6);
      const q = rng.nz(-6, 6);
      const a = r();
      e = O('/', O('+', N(a), N(c * q - a)), N(c));
    }
  } else {
    const k = i % 5;
    if (k === 0) e = O('-', N(r()), O('^', O('-', N(r()), N(r())), N(2)));
    else if (k === 1) e = O('-', O('*', N(r()), O('^', N(rng.nz(-5, 5)), N(2))), N(r()));
    else if (k === 2) {
      const dd = rng.nz(-5, 5);
      const q = rng.nz(-6, 6);
      const b = r();
      const c = r();
      e = O('/', O('-', N(dd * q + b * c), O('*', N(b), N(c))), N(dd));
    } else if (k === 3) e = O('-', O('^', N(-rng.int(2, 5)), N(2)), O('*', N(r()), O('-', N(r()), N(r()))));
    else e = O('*', N(r()), O('-', N(r()), O('*', N(r()), N(r()))));
  }
  const steps = [printNode(e)];
  let cur = e;
  for (let s = 0; s < 8 && !isNum(cur); s++) {
    cur = stepNode(cur);
    steps.push(printNode(cur));
  }
  return { q: `$${steps[0]}$`, a: `$${chain(steps)}$` };
}

const priorites: Generator = {
  id: 'priorites',
  title: 'Priorités opératoires',
  subject: 'maths',
  theme: 'Nombres et calculs',
  levels: ['5e', '4e', '3e'],
  desc: 'Enchaînements d\'opérations sur les nombres relatifs, parenthèses et carrés, corrigé étape par étape.',
  count: [2, 12, 6],
  countLabel: 'calculs',
  generate(rng, n, d) {
    return {
      intro: d === 1 ? 'Calculer en respectant les priorités opératoires.' : 'Calculer en détaillant les étapes.',
      items: distinct(n, (i) => priorityItem(rng, i, d)),
      numbering: 'alpha',
      cols: 2,
    };
  },
};

// ─── Puissances ────────────────────────────────────────────────────────────

const expSum = (m: number, n: number) => (n < 0 ? `${m}-${-n}` : `${m}+${n}`);
const expDiff = (m: number, n: number) => (n < 0 ? `${m}+${-n}` : `${m}-${n}`);
const pw = (a: number | string, e: number | string) => `${a}^{${e}}`;

function powerItem(rng: Rng, i: number, d: Difficulty): Item | null {
  const a = rng.int(2, 9);
  if (d === 1) {
    const k = i % 3;
    const m = rng.int(2, 9);
    const n = rng.int(2, 9);
    if (k === 0) return { q: `$${pw(a, m)} \\times ${pw(a, n)}$`, a: `$${chain([`${pw(a, m)} \\times ${pw(a, n)}`, pw(a, expSum(m, n)), pw(a, m + n)])}$` };
    if (k === 1) {
      if (m === n) return null;
      const [hi, lo] = m > n ? [m, n] : [n, m];
      const q = t`\dfrac{${pw(a, hi)}}{${pw(a, lo)}}`;
      if (hi - lo === 1) return null;
      return { q: `$${q}$`, a: `$${chain([q, pw(a, expDiff(hi, lo)), pw(a, hi - lo)])}$` };
    }
    const q = t`\left(${pw(a, m)}\right)^{${n}}`;
    return { q: `$${q}$`, a: `$${chain([q, pw(a, `${m} \\times ${n}`), pw(a, m * n)])}$` };
  }
  if (d === 2) {
    const k = i % 4;
    const m = rng.nz(-9, 9);
    const n = rng.nz(-9, 9);
    if (k === 0) {
      if (m + n === 0 || m + n === 1) return null;
      const q = `${pw(10, m)} \\times ${pw(10, n)}`;
      return { q: `$${q}$`, a: `$${chain([q, pw(10, expSum(m, n)), pw(10, m + n)])}$` };
    }
    if (k === 1) {
      if (m - n === 0 || m - n === 1) return null;
      const q = t`\dfrac{${pw(10, m)}}{${pw(10, n)}}`;
      return { q: `$${q}$`, a: `$${chain([q, pw(10, expDiff(m, n)), pw(10, m - n)])}$` };
    }
    if (k === 2) {
      const b = rng.intExcept(2, 5, a);
      const e = rng.int(2, 7);
      const q = `${pw(a, e)} \\times ${pw(b, e)}`;
      return { q: `$${q}$`, a: `$${chain([q, `(${a} \\times ${b})^{${e}}`, pw(a * b, e)])}$` };
    }
    const e1 = rng.nz(-5, 5);
    const e2 = rng.nz(-4, 4);
    if (e1 * e2 === 0 || e1 * e2 === 1) return null;
    const q = t`\left(${pw(a, e1)}\right)^{${e2}}`;
    return { q: `$${q}$`, a: `$${chain([q, pw(a, `${e1} \\times ${paren(e2)}`), pw(a, e1 * e2)])}$` };
  }
  const k = i % 3;
  const m = rng.nz(-6, 9);
  const n = rng.nz(-6, 9);
  const p = rng.nz(-6, 9);
  if (k === 0) {
    const r = m + n - p;
    if (r === 0 || r === 1) return null;
    const q = t`\dfrac{${pw(a, m)} \times ${pw(a, n)}}{${pw(a, p)}}`;
    return { q: `$${q}$`, a: `$${chain([q, t`\dfrac{${pw(a, m + n)}}{${pw(a, p)}}`, pw(a, expDiff(m + n, p)), pw(a, r)])}$` };
  }
  if (k === 1) {
    const e = rng.int(2, 4);
    const r = m * e - p;
    if (r === 0 || r === 1) return null;
    const q = t`\dfrac{\left(${pw(a, m)}\right)^{${e}}}{${pw(a, p)}}`;
    return { q: `$${q}$`, a: `$${chain([q, t`\dfrac{${pw(a, m * e)}}{${pw(a, p)}}`, pw(a, expDiff(m * e, p)), pw(a, r)])}$` };
  }
  const r = m + n - p;
  if (r === 0 || r === 1) return null;
  const q = t`\dfrac{${pw(10, m)} \times ${pw(10, n)}}{${pw(10, p)}}`;
  return { q: `$${q}$`, a: `$${chain([q, t`\dfrac{${pw(10, m + n)}}{${pw(10, p)}}`, pw(10, expDiff(m + n, p)), pw(10, r)])}$` };
}

const puissances: Generator = {
  id: 'puissances',
  title: 'Puissances',
  subject: 'maths',
  theme: 'Nombres et calculs',
  levels: ['4e', '3e'],
  desc: 'Produits, quotients et puissances de puissances ; puissances de 10 à exposants négatifs.',
  count: [2, 12, 6],
  countLabel: 'calculs',
  generate(rng, n, d) {
    return {
      intro: 'Écrire sous la forme d\'une seule puissance.',
      items: distinct(n, (i) => {
        for (;;) {
          const it = powerItem(rng, i, d);
          if (it) return it;
        }
      }),
      numbering: 'alpha',
      cols: 3,
    };
  },
};

// ─── Développer ────────────────────────────────────────────────────────────

const monoTex = (a: number) => (a === 1 ? 'x' : `${a}x`);

function developItem(rng: Rng, i: number, d: Difficulty): Item {
  if (d === 1) {
    const a = rng.int(1, 9);
    const b = rng.nz(-9, 9);
    if (i % 3 === 2) {
      const q = `x(${lin(a, b)})`;
      return { q: `$${q}$`, a: `$${q} = ${poly([0, b, a])}$` };
    }
    const k = i % 3 === 0 ? rng.int(2, 9) : -rng.int(1, 9);
    const q = `${coefBefore(k)}(${lin(a, b)})`;
    return { q: `$${q}$`, a: `$${chain([q, terms([[k * a, 1], [k * b, 0]])])}$` };
  }
  if (d === 2) {
    const k = i % 5;
    if (k === 0 || k === 1) {
      const a = rng.nz(-5, 5);
      const b = rng.nz(-9, 9);
      const c = rng.int(1, 5);
      const dd = rng.nz(-9, 9);
      const q = `(${lin(a, b)})(${lin(c, dd)})`;
      return { q: `$${q}$`, a: `$${chain([q, terms([[a * c, 2], [a * dd, 1], [b * c, 1], [b * dd, 0]]), poly(polyMul([b, a], [dd, c]))])}$` };
    }
    const a = rng.pick([1, 1, 2, 3, 4, 5]);
    const b = rng.int(1, 9);
    const ax = a === 1 ? 'x' : `(${a}x)`;
    if (k === 2 || k === 3) {
      const s = k === 2 ? 1 : -1;
      const q = `(${lin(a, s * b)})^2`;
      const step = `${ax}^2 ${s > 0 ? '+' : '-'} 2 \\times ${monoTex(a)} \\times ${b} + ${b}^2`;
      return { q: `$${q}$`, a: `$${chain([q, step, poly([b * b, 2 * s * a * b, a * a])])}$` };
    }
    const q = `(${lin(a, b)})(${lin(a, -b)})`;
    return { q: `$${q}$`, a: `$${chain([q, `${ax}^2 - ${b}^2`, poly([-b * b, 0, a * a])])}$` };
  }
  // Expressions composées : A ± B
  const P = () => [rng.nz(-7, 7), rng.int(1, 4)];
  const k = i % 3;
  let q: string;
  let A: number[];
  let B: number[];
  let sign: 1 | -1;
  if (k === 0) {
    const [b, a] = P();
    const [dd, c] = P();
    const kk = rng.nz(-6, 6);
    const [f, e] = P();
    q = `(${lin(a, b)})(${lin(c, dd)}) ${kk > 0 ? '+' : '-'} ${coefBefore(Math.abs(kk))}(${lin(e, f)})`;
    A = polyMul([b, a], [dd, c]);
    B = [Math.abs(kk) * f, Math.abs(kk) * e];
    sign = kk > 0 ? 1 : -1;
  } else if (k === 1) {
    const [b, a] = P();
    const [dd, c] = P();
    const [f, e] = P();
    q = `(${lin(a, b)})^2 - (${lin(c, dd)})(${lin(e, f)})`;
    A = polyMul([b, a], [b, a]);
    B = polyMul([dd, c], [f, e]);
    sign = -1;
  } else {
    const [b, a] = P();
    const [dd, c] = P();
    const [f, e] = P();
    q = `(${lin(a, b)})(${lin(c, dd)}) + (${lin(e, f)})^2`;
    A = polyMul([b, a], [dd, c]);
    B = polyMul([f, e], [f, e]);
    sign = 1;
  }
  const step = `(${poly(A)}) ${sign > 0 ? '+' : '-'} (${poly(B)})`;
  return { q: `$${q}$`, a: `$${chain([q, step, poly(polyAdd(A, B, sign))])}$` };
}

const developper: Generator = {
  id: 'developper',
  title: 'Développer et réduire',
  subject: 'maths',
  theme: 'Calcul littéral',
  levels: ['4e', '3e', '2de'],
  desc: 'Simple et double distributivité, identités remarquables, expressions composées.',
  count: [2, 12, 6],
  countLabel: 'expressions',
  generate(rng, n, d) {
    return { intro: 'Développer et réduire les expressions suivantes.', items: distinct(n, (i) => developItem(rng, i, d)), numbering: 'alpha', cols: d === 1 ? 3 : 2 };
  },
};

// ─── Factoriser ────────────────────────────────────────────────────────────

function factorItem(rng: Rng, i: number, d: Difficulty): Item | null {
  if (d === 1) {
    const k = i % 3;
    const a = rng.int(1, 7);
    const b = rng.nz(-9, 9);
    if (gcd(a, b) !== 1) return null;
    const m = rng.int(2, 7);
    if (k === 0) return { q: `$${poly([m * b, m * a])}$`, a: `$${poly([m * b, m * a])} = ${m}(${lin(a, b)})$` };
    if (k === 1) return { q: `$${poly([0, b, a])}$`, a: `$${poly([0, b, a])} = x(${lin(a, b)})$` };
    return { q: `$${poly([0, m * b, m * a])}$`, a: `$${poly([0, m * b, m * a])} = ${m}x(${lin(a, b)})$` };
  }
  if (d === 2) {
    const k = i % 3;
    const p = rng.pick([1, 1, 2, 3, 4, 5]);
    const q = rng.int(1, 9);
    if (gcd(p, q) !== 1) return null;
    const px = p === 1 ? 'x' : `(${p}x)`;
    if (k === 0) {
      const e = poly([-q * q, 0, p * p]);
      return { q: `$${e}$`, a: `$${chain([e, `${px}^2 - ${q}^2`, `(${lin(p, -q)})(${lin(p, q)})`])}$` };
    }
    const s = k === 1 ? 1 : -1;
    const e = poly([q * q, 2 * s * p * q, p * p]);
    return { q: `$${e}$`, a: `$${chain([e, `${px}^2 ${s > 0 ? '+' : '-'} 2 \\times ${monoTex(p)} \\times ${q} + ${q}^2`, `(${lin(p, s * q)})^2`])}$` };
  }
  const k = i % 4;
  const a = rng.int(1, 4);
  const b = rng.nz(-7, 7);
  const F = `(${lin(a, b)})`;
  if (k === 3) {
    const q = rng.int(1, 9);
    if (q === Math.abs(b)) return null;
    const e = `${F}^2 - ${q * q}`;
    return { q: `$${e}$`, a: `$${chain([e, `${F}^2 - ${q}^2`, `(${lin(a, b)} - ${q})(${lin(a, b)} + ${q})`, `(${lin(a, b - q)})(${lin(a, b + q)})`])}$` };
  }
  const c = rng.int(1, 5);
  const dd = rng.nz(-9, 9);
  const e = rng.nz(-5, 5);
  const f = rng.nz(-9, 9);
  let q: string;
  let inner: string;
  let rc: number;
  let rd: number;
  if (k === 0) {
    q = `${F}(${lin(c, dd)}) + ${F}(${lin(e, f)})`;
    inner = t`\left[(${lin(c, dd)}) + (${lin(e, f)})\right]`;
    [rc, rd] = [c + e, dd + f];
  } else if (k === 1) {
    q = `${F}(${lin(c, dd)}) - ${F}(${lin(e, f)})`;
    inner = t`\left[(${lin(c, dd)}) - (${lin(e, f)})\right]`;
    [rc, rd] = [c - e, dd - f];
  } else {
    q = `${F}^2 + ${F}(${lin(c, dd)})`;
    inner = t`\left[(${lin(a, b)}) + (${lin(c, dd)})\right]`;
    [rc, rd] = [a + c, b + dd];
  }
  if (rc === 0 || rd === 0 || gcd(rc, rd) !== 1) return null;
  return { q: `$${q}$`, a: `$${chain([q, `${F}${inner}`, `${F}(${lin(rc, rd)})`])}$` };
}

const factoriser: Generator = {
  id: 'factoriser',
  title: 'Factoriser',
  subject: 'maths',
  theme: 'Calcul littéral',
  levels: ['3e', '2de'],
  desc: 'Facteur commun, identités remarquables, facteur commun entre parenthèses.',
  count: [2, 12, 6],
  countLabel: 'expressions',
  generate(rng, n, d) {
    return {
      intro: 'Factoriser les expressions suivantes.',
      items: distinct(n, (i) => {
        for (;;) {
          const it = factorItem(rng, i, d);
          if (it) return it;
        }
      }),
      numbering: 'alpha',
      cols: d === 3 ? 1 : 2,
    };
  },
};

// ─── Équations du premier degré ────────────────────────────────────────────

function solveLinear(lhs: string, a: number, b: number, c: number, dd: number): { steps: string[]; x: Frac } {
  // ax + b = cx + d
  const steps = [lhs];
  if (c !== 0) steps.push(`${terms([[a, 1], [-c, 1]])} = ${terms([[dd, 0], [-b, 0]])}`);
  else if (b !== 0) steps.push(`${lin(a, 0)} = ${terms([[dd, 0], [-b, 0]])}`);
  steps.push(`${lin(a - c, 0)} = ${dd - b}`);
  const x = new Frac(dd - b, a - c);
  if (a - c !== 1) steps.push(`x = ${rawFrac(dd - b, a - c)}`);
  steps.push(`x = ${x.tex()}`);
  return { steps, x };
}

function equationItem(rng: Rng, i: number, d: Difficulty): Item | null {
  let q: string;
  let res: { steps: string[]; x: Frac };
  if (d === 1) {
    const k = i % 3;
    const x = rng.nz(-9, 9);
    if (k === 0) {
      const a = rng.nz(-12, 12);
      q = `${lin(1, a)} = ${x + a}`;
      res = solveLinear(q, 1, a, 0, x + a);
    } else if (k === 1) {
      const a = rng.pick([2, 3, 4, 5, 6, 7, 8, 9, -2, -3, -4, -5]);
      q = `${lin(a, 0)} = ${a * x}`;
      res = solveLinear(q, a, 0, 0, a * x);
    } else {
      const a = rng.pick([2, 3, 4, 5, 6, 7, -2, -3, -4, -5]);
      const b = rng.nz(-12, 12);
      q = `${lin(a, b)} = ${a * x + b}`;
      res = solveLinear(q, a, b, 0, a * x + b);
    }
  } else if (d === 2) {
    const a = rng.nz(-9, 9);
    const c = rng.nz(-9, 9);
    if (a === c) return null;
    const b = rng.nz(-12, 12);
    const x = i % 3 === 2 ? new Frac(rng.nz(-9, 9), rng.int(2, 5)) : new Frac(rng.nz(-8, 8));
    const rhs = x.mul(a - c).add(b);
    if (!rhs.isInt) return null;
    const dd = rhs.n;
    if (dd === 0 && c === 0) return null;
    q = `${lin(a, b)} = ${lin(c, dd)}`;
    res = solveLinear(q, a, b, c, dd);
  } else {
    const k = i % 2;
    if (k === 0) {
      // a(x + b) = c(x + d) + e
      const a = rng.nz(-6, 6);
      const c = rng.nz(-6, 6);
      if (a === c || Math.abs(a) === 1 || Math.abs(c) === 1) return null;
      const b = rng.nz(-7, 7);
      const dd = rng.nz(-7, 7);
      const e = rng.nz(-9, 9);
      q = `${coefBefore(a)}(${lin(1, b)}) = ${coefBefore(c)}(${lin(1, dd)}) ${e > 0 ? '+' : '-'} ${Math.abs(e)}`;
      const inner = solveLinear(`${lin(a, a * b)} = ${lin(c, c * dd + e)}`, a, a * b, c, c * dd + e);
      res = { steps: [q, ...inner.steps], x: inner.x };
    } else {
      // x/a + b = c
      const a = rng.int(2, 9);
      const b = rng.nz(-9, 9);
      const c = rng.nz(-9, 9);
      if (b === c) return null;
      q = t`\dfrac{x}{${a}} ${b > 0 ? '+' : '-'} ${Math.abs(b)} = ${c}`;
      const x = new Frac(a * (c - b));
      res = { steps: [q, t`\dfrac{x}{${a}} = ${c - b}`, `x = ${a} \\times ${paren(c - b)}`, `x = ${x.tex()}`], x };
    }
  }
  return { q: `$${q}$`, a: lines(`$${chain(res.steps, '\\iff')}$`, `$${solSet([res.x.tex()])}$`) };
}

const equations: Generator = {
  id: 'equations',
  title: 'Équations du premier degré',
  subject: 'maths',
  theme: 'Équations',
  levels: ['4e', '3e', '2de'],
  desc: 'De x + a = b à a(x + b) = c(x + d) + e, solutions entières ou fractionnaires.',
  count: [2, 10, 4],
  countLabel: 'équations',
  generate(rng, n, d) {
    return {
      intro: 'Résoudre les équations suivantes.',
      items: distinct(n, (i) => {
        for (;;) {
          const it = equationItem(rng, i, d);
          if (it) return it;
        }
      }),
      numbering: 'alpha',
      cols: 2,
    };
  },
};

// ─── Équations produit nul ─────────────────────────────────────────────────

const facTex = (a: number, b: number) => (b === 0 ? (a === 1 ? 'x' : lin(a, 0)) : `(${lin(a, b)})`);

function zeroProductItem(rng: Rng, i: number, d: Difficulty): Item | null {
  let a = rng.int(1, d === 1 ? 1 : 5);
  let b = rng.nz(-9, 9);
  let c = rng.int(1, d === 1 ? 3 : 5);
  let dd = rng.nz(-9, 9);
  if (d === 1 && dd % c !== 0) return null;
  let pre: string[] = [];
  let q: string;
  if (d === 2 && i % 3 === 2) {
    b = 0;
    a = 1;
  }
  if (d === 3) {
    const k = i % 3;
    if (k === 0) {
      const p = rng.int(1, 5);
      const s = rng.int(1, 9);
      if (gcd(p, s) !== 1) return null;
      q = `${poly([-s * s, 0, p * p])} = 0`;
      [a, b, c, dd] = [p, -s, p, s];
    } else if (k === 1) {
      const p = rng.nz(-6, 6);
      const s = rng.nz(-9, 9);
      q = `${poly([0, s, p])} = 0`;
      [a, b, c, dd] = [1, 0, p, s];
    } else {
      const s = rng.int(1, 9);
      if (s === Math.abs(b)) return null;
      a = rng.int(1, 4);
      q = `(${lin(a, b)})^2 - ${s * s} = 0`;
      pre = [`(${lin(a, b)} - ${s})(${lin(a, b)} + ${s}) = 0`];
      [c, dd] = [a, b + s];
      b = b - s;
      if (b === 0 && dd === 0) return null;
    }
    if (!pre.length) pre = [`${facTex(a, b)}${facTex(c, dd)} = 0`];
  } else {
    q = `${facTex(a, b)}${facTex(c, dd)} = 0`;
  }
  const r1 = new Frac(-b, a);
  const r2 = new Frac(-dd, c);
  if (r1.equals(r2) && d < 3) return null;
  const sorted = r1.value <= r2.value ? [r1, r2] : [r2, r1];
  const sol = r1.equals(r2) ? [r1.tex()] : sorted.map((r) => r.tex());
  const eq = (aa: number, bb: number) => `${bb === 0 && aa === 1 ? 'x' : lin(aa, bb)} = 0`;
  return {
    q: `$${q}$`,
    a: lines(
      pre.length ? `$${chain([q, ...pre], '\\iff')}$` : '',
      `Un produit est nul si et seulement si l'un de ses facteurs est nul : $${eq(a, b)}$ ou $${eq(c, dd)}$,`,
      `soit $x = ${r1.tex()}$ ou $x = ${r2.tex()}$. $${solSet(sol)}$`,
    ),
  };
}

const produitNul: Generator = {
  id: 'produit-nul',
  title: 'Équations produit nul',
  subject: 'maths',
  theme: 'Équations',
  levels: ['3e', '2de'],
  desc: 'Équations (ax + b)(cx + d) = 0, puis factorisation préalable (x² − a², ax² + bx…).',
  count: [2, 8, 4],
  countLabel: 'équations',
  generate(rng, n, d) {
    return {
      intro: 'Résoudre les équations suivantes.',
      items: distinct(n, (i) => {
        for (;;) {
          const it = zeroProductItem(rng, i, d);
          if (it) return it;
        }
      }),
      numbering: 'alpha',
      cols: d === 3 ? 1 : 2,
    };
  },
};

// ─── Théorème de Pythagore ─────────────────────────────────────────────────

const TRIANGLES = ['ABC', 'DEF', 'EFG', 'IJK', 'KLM', 'MNP', 'RST', 'UVW'];
const TRIPLES: [number, number, number][] = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15], [7, 24, 25], [20, 21, 29]];
const seg = (x: string, y: string) => [x, y].sort().join('');

function triangleNames(rng: Rng): { tri: string; R: string; V: string; W: string } {
  const tri = rng.pick(TRIANGLES);
  const [R, V, W] = rng.shuffle(tri.split(''));
  return { tri, R, V, W };
}

function pythagorasItem(rng: Rng, i: number, d: Difficulty): Item {
  const { tri, R, V, W } = triangleNames(rng);
  const hyp = seg(V, W);
  const l1 = seg(R, V);
  const l2 = seg(R, W);
  const converse = d === 3 && i % 2 === 0;
  if (converse) {
    const [a0, b0, c0] = rng.pick(TRIPLES);
    const k = rng.pick([1, 1, 2, 0.5]);
    const right = rng.chance(0.55);
    const a = a0 * k;
    const b = b0 * k;
    const c = right ? c0 * k : c0 * k + (k < 1 ? 0.5 : 1);
    const given = rng.shuffle([[l1, a], [l2, b], [hyp, c]] as [string, number][]);
    const cond = given.map(([s, v]) => `$${s} = ${dec(v)}$ cm`);
    const sq = (x: number) => dec(x * x);
    return {
      q: `Le triangle $${tri}$ est tel que ${cond[0]}, ${cond[1]} et ${cond[2]}. Est-il rectangle ?`,
      a: lines(
        `Le plus long côté est $[${hyp}]$ : $${hyp}^2 = ${dec(c)}^2 = ${sq(c)}$`,
        `et $${l1}^2 + ${l2}^2 = ${dec(a)}^2 + ${dec(b)}^2 = ${sq(a)} + ${sq(b)} = ${dec(round(a * a + b * b, 6))}$.`,
        right
          ? `Comme $${hyp}^2 = ${l1}^2 + ${l2}^2$, d'après la réciproque du théorème de Pythagore, le triangle $${tri}$ est rectangle en $${R}$.`
          : `Comme $${hyp}^2 \\neq ${l1}^2 + ${l2}^2$, le triangle $${tri}$ n'est pas rectangle (sinon l'égalité de Pythagore serait vérifiée).`,
      ),
    };
  }
  const intro = `Le triangle $${tri}$ est rectangle en $${R}$.`;
  const findLeg = d >= 2 && i % 2 === 1;
  const irrational = d >= 2 && !findLeg && rng.chance(0.6);
  let a: number;
  let b: number;
  if (irrational) {
    for (;;) {
      a = rng.int(2, 12);
      b = rng.int(2, 12);
      const [, m] = sqrtParts(a * a + b * b);
      if (m !== 1 && Math.max(a, b) / Math.min(a, b) < 3) break;
    }
  } else {
    const [a0, b0] = rng.pick(TRIPLES);
    const k = d === 1 ? rng.pick([1, 1, 2]) : rng.pick([1, 0.5, 1.5, 2]);
    [a, b] = rng.chance(0.5) ? [a0 * k, b0 * k] : [b0 * k, a0 * k];
  }
  const c = Math.hypot(a, b);
  const cc = round(a * a + b * b, 6);
  const approx = (x: number) => (Math.abs(round(x, 1) - x) < 1e-9 ? `= ${dec(x)}` : `\\approx ${dec(round(x, 1))}`);
  if (!findLeg) {
    const fig = rightTriangle({ names: [R, V, W], legs: [a, b], sides: { s01: a, s02: b, s12: '?' } }, rng);
    return {
      q: `${intro} On donne $${l1} = ${dec(a)}$ cm et $${l2} = ${dec(b)}$ cm. Calculer $${hyp}$${irrational ? ', arrondie au millimètre' : ''}.`,
      a: lines(
        `D'après le théorème de Pythagore : $${hyp}^2 = ${l1}^2 + ${l2}^2 = ${dec(a)}^2 + ${dec(b)}^2 = ${dec(round(a * a, 6))} + ${dec(round(b * b, 6))} = ${dec(cc)}$,`,
        `donc $${hyp} = \\sqrt{${dec(cc)}} ${approx(c)}$ cm.`,
      ),
      fig,
    };
  }
  const fig = rightTriangle({ names: [R, V, W], legs: [a, b], sides: { s01: a, s02: '?', s12: c } }, rng);
  return {
    q: `${intro} On donne $${hyp} = ${dec(c)}$ cm et $${l1} = ${dec(a)}$ cm. Calculer $${l2}$.`,
    a: lines(
      `D'après le théorème de Pythagore : $${hyp}^2 = ${l1}^2 + ${l2}^2$, donc $${l2}^2 = ${hyp}^2 - ${l1}^2 = ${dec(round(c * c, 6))} - ${dec(round(a * a, 6))} = ${dec(round(b * b, 6))}$,`,
      `d'où $${l2} = \\sqrt{${dec(round(b * b, 6))}} ${approx(b)}$ cm.`,
    ),
    fig,
  };
}

const pythagore: Generator = {
  id: 'pythagore',
  title: 'Théorème de Pythagore',
  subject: 'maths',
  theme: 'Géométrie',
  levels: ['4e', '3e'],
  desc: 'Calcul de l\'hypoténuse ou d\'un côté de l\'angle droit (figures codées), réciproque.',
  count: [1, 6, 2],
  countLabel: 'triangles',
  generate(rng, n, d) {
    return { intro: 'Les figures ne sont pas en vraie grandeur.', items: distinct(n, (i) => pythagorasItem(rng, i, d)), numbering: 'alpha', cols: d === 3 ? 1 : 2 };
  },
};

// ─── Trigonométrie ─────────────────────────────────────────────────────────

type TrigKind = 'cos-adj' | 'cos-hyp' | 'sin-opp' | 'tan-opp' | 'sin-hyp' | 'angle-cos' | 'angle-sin' | 'angle-tan';
const DEG = Math.PI / 180;
const r1 = (x: number) => (Math.abs(round(x, 1) - x) < 1e-9 ? `= ${dec(x)}` : `\\approx ${dec(round(x, 1))}`);

function trigItem(rng: Rng, i: number, d: Difficulty): Item {
  const kinds: TrigKind[] = d === 1 ? ['cos-adj', 'cos-hyp', 'angle-cos']
    : d === 2 ? ['cos-adj', 'sin-opp', 'tan-opp', 'angle-cos', 'angle-tan']
      : ['sin-hyp', 'tan-opp', 'angle-sin', 'angle-tan', 'cos-hyp'];
  const kind = kinds[i % kinds.length];
  const { tri, R, V, W } = triangleNames(rng);
  const adjS = seg(R, V);
  const oppS = seg(R, W);
  const hypS = seg(V, W);
  const ang = `\\widehat{${R}${V}${W}}`;
  const intro = `Le triangle $${tri}$ est rectangle en $${R}$.`;
  let alpha = rng.int(20, 70);
  let adj: number;
  let opp: number;
  let hyp: number;
  let q: string;
  let a: string;
  let angleShown: number | '?' = alpha;
  let sides: { s01?: number | '?'; s02?: number | '?'; s12?: number | '?' };
  const L = () => rng.int(30, 120) / 10;
  if (kind.startsWith('angle')) {
    // Deux longueurs entières ou au dixième, angle à calculer
    if (kind === 'angle-cos') {
      hyp = rng.int(6, 15);
      adj = rng.int(Math.ceil(3 * hyp), Math.floor(8.5 * hyp)) / 10;
      alpha = Math.acos(adj / hyp) / DEG;
      opp = Math.sqrt(hyp * hyp - adj * adj);
      sides = { s01: adj, s12: hyp };
      q = `${intro} On donne $${adjS} = ${dec(adj)}$ cm et $${hypS} = ${dec(hyp)}$ cm. Calculer la mesure de l'angle $${ang}$, arrondie au degré.`;
      a = `$\\cos(${ang}) = \\dfrac{${adjS}}{${hypS}} = \\dfrac{${dec(adj)}}{${dec(hyp)}}$, donc $${ang} = \\arccos\\left(\\dfrac{${dec(adj)}}{${dec(hyp)}}\\right) \\approx ${Math.round(alpha)}^\\circ$.`;
    } else if (kind === 'angle-sin') {
      hyp = rng.int(6, 15);
      opp = rng.int(Math.ceil(3 * hyp), Math.floor(8.5 * hyp)) / 10;
      alpha = Math.asin(opp / hyp) / DEG;
      adj = Math.sqrt(hyp * hyp - opp * opp);
      sides = { s02: opp, s12: hyp };
      q = `${intro} On donne $${oppS} = ${dec(opp)}$ cm et $${hypS} = ${dec(hyp)}$ cm. Calculer la mesure de l'angle $${ang}$, arrondie au degré.`;
      a = `$\\sin(${ang}) = \\dfrac{${oppS}}{${hypS}} = \\dfrac{${dec(opp)}}{${dec(hyp)}}$, donc $${ang} = \\arcsin\\left(\\dfrac{${dec(opp)}}{${dec(hyp)}}\\right) \\approx ${Math.round(alpha)}^\\circ$.`;
    } else {
      adj = rng.int(3, 12);
      opp = rng.int(3, 12);
      alpha = Math.atan(opp / adj) / DEG;
      hyp = Math.hypot(adj, opp);
      sides = { s01: adj, s02: opp };
      q = `${intro} On donne $${adjS} = ${dec(adj)}$ cm et $${oppS} = ${dec(opp)}$ cm. Calculer la mesure de l'angle $${ang}$, arrondie au degré.`;
      a = `$\\tan(${ang}) = \\dfrac{${oppS}}{${adjS}} = \\dfrac{${dec(opp)}}{${dec(adj)}}$, donc $${ang} = \\arctan\\left(\\dfrac{${dec(opp)}}{${dec(adj)}}\\right) \\approx ${Math.round(alpha)}^\\circ$.`;
    }
    angleShown = '?';
  } else {
    const c = Math.cos(alpha * DEG);
    const s = Math.sin(alpha * DEG);
    const tn = Math.tan(alpha * DEG);
    const A = `${alpha}^\\circ`;
    if (kind === 'cos-adj') {
      hyp = L(); adj = hyp * c; opp = hyp * s;
      sides = { s01: '?', s12: hyp };
      q = `${intro} On donne $${hypS} = ${dec(hyp)}$ cm et $${ang} = ${A}$. Calculer $${adjS}$, arrondie au millimètre.`;
      a = `$\\cos(${ang}) = \\dfrac{${adjS}}{${hypS}}$, donc $${adjS} = ${hypS} \\times \\cos(${ang}) = ${dec(hyp)} \\times \\cos(${A}) ${r1(adj)}$ cm.`;
    } else if (kind === 'cos-hyp') {
      adj = L(); hyp = adj / c; opp = adj * tn;
      sides = { s01: adj, s12: '?' };
      q = `${intro} On donne $${adjS} = ${dec(adj)}$ cm et $${ang} = ${A}$. Calculer $${hypS}$, arrondie au millimètre.`;
      a = `$\\cos(${ang}) = \\dfrac{${adjS}}{${hypS}}$, donc $${hypS} = \\dfrac{${adjS}}{\\cos(${ang})} = \\dfrac{${dec(adj)}}{\\cos(${A})} ${r1(hyp)}$ cm.`;
    } else if (kind === 'sin-opp') {
      hyp = L(); opp = hyp * s; adj = hyp * c;
      sides = { s02: '?', s12: hyp };
      q = `${intro} On donne $${hypS} = ${dec(hyp)}$ cm et $${ang} = ${A}$. Calculer $${oppS}$, arrondie au millimètre.`;
      a = `$\\sin(${ang}) = \\dfrac{${oppS}}{${hypS}}$, donc $${oppS} = ${hypS} \\times \\sin(${ang}) = ${dec(hyp)} \\times \\sin(${A}) ${r1(opp)}$ cm.`;
    } else if (kind === 'sin-hyp') {
      opp = L(); hyp = opp / s; adj = opp / tn;
      sides = { s02: opp, s12: '?' };
      q = `${intro} On donne $${oppS} = ${dec(opp)}$ cm et $${ang} = ${A}$. Calculer $${hypS}$, arrondie au millimètre.`;
      a = `$\\sin(${ang}) = \\dfrac{${oppS}}{${hypS}}$, donc $${hypS} = \\dfrac{${oppS}}{\\sin(${ang})} = \\dfrac{${dec(opp)}}{\\sin(${A})} ${r1(hyp)}$ cm.`;
    } else {
      adj = L(); opp = adj * tn; hyp = adj / c;
      sides = { s01: adj, s02: '?' };
      q = `${intro} On donne $${adjS} = ${dec(adj)}$ cm et $${ang} = ${A}$. Calculer $${oppS}$, arrondie au millimètre.`;
      a = `$\\tan(${ang}) = \\dfrac{${oppS}}{${adjS}}$, donc $${oppS} = ${adjS} \\times \\tan(${ang}) = ${dec(adj)} \\times \\tan(${A}) ${r1(opp)}$ cm.`;
    }
  }
  const fig = rightTriangle({ names: [R, V, W], legs: [adj, opp], sides, angle: { at: 1, value: angleShown } }, rng);
  return { q, a: lines(`Dans le triangle $${tri}$ rectangle en $${R}$ :`, a), fig };
}

const trigonometrie: Generator = {
  id: 'trigonometrie',
  title: 'Trigonométrie',
  subject: 'maths',
  theme: 'Géométrie',
  levels: ['3e'],
  desc: 'Cosinus, sinus et tangente dans le triangle rectangle : longueurs et angles, figures codées.',
  count: [1, 6, 2],
  countLabel: 'triangles',
  generate(rng, n, d) {
    return { intro: 'Les figures ne sont pas en vraie grandeur.', items: distinct(n, (i) => trigItem(rng, i, d)), numbering: 'alpha', cols: 2 };
  },
};

// ─── Arithmétique ──────────────────────────────────────────────────────────

function primeFactors(n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let p = 2; p * p <= n; p++) {
    let e = 0;
    while (n % p === 0) {
      n /= p;
      e++;
    }
    if (e) out.push([p, e]);
  }
  if (n > 1) out.push([n, 1]);
  return out;
}

const decompTex = (n: number) => primeFactors(n).map(([p, e]) => (e > 1 ? `${p}^{${e}}` : String(p))).join(' \\times ');

function composite(rng: Rng, min: number, max: number): number {
  for (;;) {
    const n = 2 ** rng.int(0, 4) * 3 ** rng.int(0, 3) * 5 ** rng.int(0, 2) * 7 ** rng.int(0, 1) * (rng.chance(0.15) ? rng.pick([11, 13]) : 1);
    if (n >= min && n <= max && primeFactors(n).reduce((s, [, e]) => s + e, 0) >= 3) return n;
  }
}

function arithItem(rng: Rng, i: number, d: Difficulty): Item {
  const kind = d === 1 ? 0 : d === 2 ? 1 + (i % 2) : [1, 3][i % 2];
  if (kind === 0) {
    const n = composite(rng, 24, 2000);
    return { q: `Décomposer $${dec(n)}$ en produit de facteurs premiers.`, a: `$${dec(n)} = ${decompTex(n)}$` };
  }
  let a: number;
  let b: number;
  for (;;) {
    const g = composite(rng, 6, 60);
    const p = rng.int(2, 9);
    const q = rng.int(2, 11);
    a = g * p;
    b = g * q;
    if (p !== q && gcd(p, q) === 1 && a < 1500 && b < 1500) break;
  }
  const g = gcd(a, b);
  if (kind === 1) {
    return {
      q: `Rendre irréductible la fraction $\\dfrac{${a}}{${b}}$ à l'aide des décompositions en facteurs premiers.`,
      a: `$\\dfrac{${a}}{${b}} = \\dfrac{${decompTex(a)}}{${decompTex(b)}} = ${new Frac(a, b).tex()}$`,
    };
  }
  if (kind === 2) {
    return {
      q: `Déterminer le plus grand diviseur commun à $${a}$ et $${b}$.`,
      a: lines(`$${a} = ${decompTex(a)}$ et $${b} = ${decompTex(b)}$,`, `donc le plus grand diviseur commun est $${decompTex(g)} = ${g}$.`),
    };
  }
  const ctx = rng.pick([
    { q: `Un fleuriste dispose de $${a}$ roses et de $${b}$ tulipes. Il veut composer le plus grand nombre possible de bouquets identiques en utilisant toutes ses fleurs. Combien de bouquets peut-il réaliser ? Quelle est la composition de chaque bouquet ?`, x: 'roses', y: 'tulipes', w: 'bouquets' },
    { q: `Pour une kermesse, on dispose de $${a}$ billes rouges et de $${b}$ billes bleues. On veut remplir le plus grand nombre possible de sachets identiques avec toutes les billes. Combien de sachets ? Que contient chaque sachet ?`, x: 'billes rouges', y: 'billes bleues', w: 'sachets' },
  ]);
  return {
    q: ctx.q,
    a: lines(
      `Le nombre de ${ctx.w} doit diviser $${a}$ et $${b}$ : on cherche leur plus grand diviseur commun.`,
      `$${a} = ${decompTex(a)}$ et $${b} = ${decompTex(b)}$, donc ce diviseur est $${g}$.`,
      `On peut réaliser $${g}$ ${ctx.w} contenant chacun $${a} \\div ${g} = ${a / g}$ ${ctx.x} et $${b} \\div ${g} = ${b / g}$ ${ctx.y}.`,
    ),
  };
}

const arithmetique: Generator = {
  id: 'arithmetique',
  title: 'Nombres premiers et diviseurs',
  subject: 'maths',
  theme: 'Nombres et calculs',
  levels: ['3e', '2de'],
  desc: 'Décomposition en facteurs premiers, fractions irréductibles, plus grand diviseur commun, problèmes.',
  count: [1, 8, 4],
  countLabel: 'questions',
  generate(rng, n, d) {
    return { intro: d === 3 ? '' : 'Répondre aux questions suivantes.', items: distinct(n, (i) => arithItem(rng, i, d)), numbering: 'alpha', cols: d === 1 ? 2 : 1 };
  },
};

export const COLLEGE: Generator[] = [fractions, priorites, puissances, arithmetique, developper, factoriser, equations, produitNul, pythagore, trigonometrie];
