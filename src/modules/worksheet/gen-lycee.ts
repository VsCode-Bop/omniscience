/**
 * Exercices de mathématiques du lycée : fonctions affines, pourcentages, statistiques,
 * vecteurs, second degré, suites, dérivation, loi binomiale, exponentielle et logarithme.
 */
import { summarize } from '../probability/stats';
import type { Rng } from './rng';
import {
  chain, coefBefore, dec, eqApprox, Frac, gcd, lin, lines, paren, poly, rawFrac, round, solSet, sqrtParts, sqrtTex, t, terms,
} from './tex';
import { distinct, type Difficulty, type Generator, type Item } from './types';

const pt = (name: string, x: string | number, y: string | number) =>
  /frac/.test(`${x}${y}`) ? t`${name}\left(${x} \,;\, ${y}\right)` : t`${name}(${x} \,;\, ${y})`;
const col = (a: string | number, b: string | number) => t`\begin{pmatrix} ${a} \\ ${b} \end{pmatrix}`;

// ─── Fonctions affines ─────────────────────────────────────────────────────

function affineItem(rng: Rng, i: number, d: Difficulty): Item | null {
  const x1 = rng.int(-4, 5);
  const x2 = rng.intExcept(-3, 8, x1);
  let a: Frac;
  let b: Frac;
  if (d === 3) {
    const q = rng.pick([2, 3, 4]);
    const p = rng.nz(-7, 7);
    if (gcd(p, q) !== 1) return null;
    a = new Frac(p, q);
    b = new Frac(rng.nz(-9, 9));
  } else {
    a = new Frac(d === 1 ? rng.nz(-5, 5) : rng.nz(-9, 9));
    b = new Frac(d === 1 ? rng.int(-9, 9) : rng.nz(-12, 12));
  }
  const y1 = a.mul(x1).add(b);
  const y2 = a.mul(x2).add(b);
  if (!y1.isInt || !y2.isInt) return null;
  const [u, v] = x1 < x2 ? [[x1, y1.n], [x2, y2.n]] : [[x2, y2.n], [x1, y1.n]];
  const byPoints = d >= 2 && i % 2 === 1;
  const q = byPoints
    ? `Déterminer l'expression de la fonction affine $f$ dont la représentation graphique passe par les points $${pt('A', u[0], u[1])}$ et $${pt('B', v[0], v[1])}$.`
    : `Déterminer l'expression de la fonction affine $f$ telle que $f(${u[0]}) = ${u[1]}$ et $f(${v[0]}) = ${v[1]}$.`;
  const slope = chain([
    t`\dfrac{${v[1]} - ${paren(u[1])}}{${v[0]} - ${paren(u[0])}}`,
    rawFrac(v[1] - u[1], v[0] - u[0]),
    a.tex(),
  ]);
  return {
    q,
    a: lines(
      `$f$ est affine : $f(x) = ax + b$ avec $a = ${byPoints ? t`\dfrac{y_B - y_A}{x_B - x_A}` : t`\dfrac{f(${v[0]}) - f(${u[0]})}{${v[0]} - ${paren(u[0])}}`} = ${slope}$.`,
      `$b = ${byPoints ? 'y_A' : `f(${u[0]})`} - a \\times ${paren(u[0])} = ${u[1]} - ${a.texParen()} \\times ${paren(u[0])} = ${b.tex()}$, donc $f(x) = ${lin(a, b)}$.`,
    ),
  };
}

const affine: Generator = {
  id: 'affine',
  title: 'Fonctions affines',
  subject: 'maths',
  theme: 'Fonctions',
  levels: ['3e', '2de'],
  desc: 'Expression d\'une fonction affine à partir de deux images ou de deux points de sa droite.',
  count: [1, 6, 3],
  countLabel: 'fonctions',
  generate(rng, n, d) {
    return { intro: '', items: distinct(n, (i) => retry(() => affineItem(rng, i, d))), numbering: 'alpha', cols: 1 };
  },
};

function retry<T>(make: () => T | null): T {
  for (;;) {
    const v = make();
    if (v) return v;
  }
}

// ─── Pourcentages ──────────────────────────────────────────────────────────

const euro = (x: number) => (Number.isInteger(round(x, 6)) ? dec(x) : round(x, 2).toFixed(2).replace('.', '{,}'));
const pc = (x: number) => t`${dec(x)}\,\%`;
const cmTex = (t0: number) => dec(round(1 + t0 / 100, 6));

function percentItem(rng: Rng, i: number, d: Difficulty): Item {
  const kinds = d === 1 ? ['hausse', 'baisse', 'cm'] : d === 2 ? ['cm-inv', 'taux', 'succ', 'initial'] : ['succ', 'recip', 'initial', 'taux'];
  const kind = kinds[i % kinds.length];
  const T = [2, 4, 5, 8, 10, 12, 15, 20, 25, 30, 40];
  if (kind === 'hausse' || kind === 'baisse') {
    const P = rng.int(4, 80) * 5;
    const tx = rng.pick(T);
    const s = kind === 'hausse' ? 1 : -1;
    const cm = 1 + (s * tx) / 100;
    const ctx = kind === 'hausse'
      ? `Un article coûte $${euro(P)}$ €. Son prix augmente de $${pc(tx)}$. Calculer son nouveau prix.`
      : `Pendant les soldes, un article affiché $${euro(P)}$ € bénéficie d'une remise de $${pc(tx)}$. Calculer son prix soldé.`;
    return {
      q: ctx,
      a: lines(
        `Coefficient multiplicateur : $1 ${s > 0 ? '+' : '-'} \\dfrac{${tx}}{100} = ${dec(cm)}$.`,
        `Nouveau prix : $${euro(P)} \\times ${dec(cm)} = ${euro(P * cm)}$ €.`,
      ),
    };
  }
  if (kind === 'cm') {
    const tx = rng.pick([1, 2, 3, 5, 7, 12, 15, 18, 35, 60]);
    const s = rng.sign();
    return {
      q: `Donner le coefficient multiplicateur associé à une ${s > 0 ? 'hausse' : 'baisse'} de $${pc(tx)}$.`,
      a: `$1 ${s > 0 ? '+' : '-'} \\dfrac{${tx}}{100} = ${cmTex(s * tx)}$`,
    };
  }
  if (kind === 'cm-inv') {
    const tx = rng.pick([3, 6, 7, 12, 15, 24, 35, 40, 65]) * rng.sign();
    const cm = cmTex(tx);
    return {
      q: `À quelle évolution, en pourcentage, correspond un coefficient multiplicateur égal à $${cm}$ ?`,
      a: `$${cm} ${tx > 0 ? '>' : '<'} 1$ : il s'agit d'une ${tx > 0 ? 'hausse' : 'baisse'} de $${pc(Math.abs(tx))}$ car $${cm} = 1 ${tx > 0 ? '+' : '-'} ${dec(Math.abs(tx) / 100)}$.`,
    };
  }
  if (kind === 'taux') {
    for (;;) {
      const V0 = rng.pick([40, 50, 80, 120, 150, 200, 250, 400, 500, 800]);
      const tx = rng.pick([5, 10, 12, 15, 20, 25, 30, 40]) * rng.sign();
      const V1 = (V0 * (100 + tx)) / 100;
      if (!Number.isInteger(V1)) continue;
      const what = rng.pick([
        `Le nombre d'abonnés d'un club passe de $${V0}$ à $${V1}$.`,
        `Le prix d'un vélo passe de $${V0}$ € à $${V1}$ €.`,
      ]);
      return {
        q: `${what} Calculer le taux d'évolution, en pourcentage.`,
        a: `$t = \\dfrac{V_1 - V_0}{V_0} = \\dfrac{${V1} - ${V0}}{${V0}} = ${dec(tx / 100)}$, soit une ${tx > 0 ? 'hausse' : 'baisse'} de $${pc(Math.abs(tx))}$.`,
      };
    }
  }
  if (kind === 'succ') {
    const t1 = rng.pick([10, 20, 25, 30, 40, 50]);
    const t2 = rng.pick([5, 10, 15, 20, 25, 30]);
    const s1 = rng.sign();
    const s2 = -s1 as 1 | -1;
    const c1 = 1 + (s1 * t1) / 100;
    const c2 = 1 + (s2 * t2) / 100;
    const g = round(c1 * c2, 8);
    const tg = round((g - 1) * 100, 6);
    return {
      q: `Un prix ${s1 > 0 ? 'augmente' : 'baisse'} de $${pc(t1)}$ puis ${s2 > 0 ? 'augmente' : 'baisse'} de $${pc(t2)}$. Quelle est l'évolution globale, en pourcentage ?`,
      a: lines(
        `Coefficient multiplicateur global : $${dec(c1)} \\times ${dec(c2)} = ${dec(g)}$.`,
        tg === 0 ? 'Le prix revient à sa valeur initiale : évolution globale nulle.' : `Évolution globale : ${tg > 0 ? 'hausse' : 'baisse'} de $${pc(Math.abs(tg))}$.`,
      ),
    };
  }
  if (kind === 'recip') {
    const [tx, s] = rng.pick([[25, 1], [60, 1], [100, 1], [150, 1], [50, 1], [20, -1], [50, -1], [60, -1], [75, -1], [25, -1]] as [number, number][]);
    const c = 1 + (s * tx) / 100;
    const r = 1 / c;
    const tr = (r - 1) * 100;
    return {
      q: `Après une ${s > 0 ? 'hausse' : 'baisse'} de $${pc(tx)}$, quelle évolution faut-il appliquer pour revenir à la valeur initiale ? Arrondir à $0{,}1\\,\\%$ si nécessaire.`,
      a: lines(
        `Le coefficient multiplicateur réciproque est $\\dfrac{1}{${dec(c)}} ${eqApprox(r, 4)}$,`,
        `soit une ${tr > 0 ? 'hausse' : 'baisse'} ${Math.abs(round(tr, 1) - tr) < 1e-9 ? 'de' : "d'environ"} $${pc(round(Math.abs(tr), 1))}$.`,
      ),
    };
  }
  // initial
  const P0 = rng.int(3, 40) * 10;
  const tx = rng.pick([5, 10, 20, 25, 30, 40]);
  const s = rng.sign();
  const c = 1 + (s * tx) / 100;
  return {
    q: `Après une ${s > 0 ? 'hausse' : 'baisse'} de $${pc(tx)}$, un article coûte $${euro(P0 * c)}$ €. Quel était son prix initial ?`,
    a: `$P_0 \\times ${dec(c)} = ${euro(P0 * c)}$, donc $P_0 = \\dfrac{${euro(P0 * c)}}{${dec(c)}} = ${euro(P0)}$ €.`,
  };
}

const pourcentages: Generator = {
  id: 'pourcentages',
  title: 'Pourcentages et évolutions',
  subject: 'maths',
  theme: 'Nombres et calculs',
  levels: ['3e', '2de'],
  desc: 'Coefficients multiplicateurs, taux d\'évolution, évolutions successives et réciproques.',
  count: [2, 8, 4],
  countLabel: 'questions',
  generate(rng, n, d) {
    return { intro: '', items: distinct(n, (i) => percentItem(rng, i, d)), numbering: 'alpha', cols: 1 };
  },
};

// ─── Statistiques ──────────────────────────────────────────────────────────

const rankTex = (r: number) => (r === 1 ? t`1^{\text{re}}` : t`${r}^{\text{e}}`);
const list = (xs: number[]) => xs.map((x) => dec(x)).join(' ; ');

const stats: Generator = {
  id: 'statistiques',
  title: 'Statistiques : indicateurs',
  subject: 'maths',
  theme: 'Statistiques et probabilités',
  levels: ['3e', '2de'],
  desc: 'Effectif, étendue, moyenne, médiane, quartiles et écart type d\'une série brute ou d\'un tableau.',
  count: [2, 6, 4],
  countLabel: 'questions',
  generate(rng, n, d) {
    let values: number[];
    let counts: number[];
    let intro: string;
    let table: string[][] | undefined;
    let unitTxt = '';
    if (d < 3) {
      const N = d === 1 ? rng.int(9, 13) : rng.int(12, 20);
      const ctx = rng.pick([
        { t: 'Voici les notes sur 20 obtenues par les élèves d\'un groupe à un contrôle :', lo: 4, hi: 20, u: '' },
        { t: 'Voici les tailles, en centimètres, des joueurs d\'une équipe :', lo: 158, hi: 196, u: ' cm' },
        { t: 'Voici le nombre de livres lus en un an par des élèves d\'une classe :', lo: 0, hi: 14, u: '' },
      ]);
      const raw = Array.from({ length: N }, () => rng.int(ctx.lo, ctx.hi));
      intro = `${ctx.t}\n\n${raw.map((x) => String(x)).join(' ; ')}`;
      unitTxt = ctx.u;
      values = [...new Set(raw)].sort((a, b) => a - b);
      counts = values.map((v) => raw.filter((x) => x === v).length);
    } else {
      const ctx = rng.pick([
        { t: 'Une enquête sur le nombre d\'enfants par famille a donné les résultats suivants.', head: 'Nombre d\'enfants', v: [0, 1, 2, 3, 4, 5] },
        { t: 'Le tableau suivant donne la répartition des notes obtenues à un devoir.', head: 'Note', v: [6, 8, 10, 12, 14, 16, 18] },
      ]);
      values = ctx.v;
      counts = values.map(() => rng.int(1, 12));
      intro = ctx.t;
      table = [[ctx.head, ...values.map((v) => `$${v}$`)], ['Effectif', ...counts.map((c) => `$${c}$`)]];
    }
    const s = summarize({ values, counts })!;
    const N = s.n;
    const sorted = values.flatMap((v, i) => Array<number>(counts[i]).fill(v));
    const sum = sorted.reduce((a, b) => a + b, 0);
    const questions: Item[] = [];
    const Q = {
      N: {
        q: 'Quel est l\'effectif total de la série ?',
        a: table ? `$N = ${counts.join(' + ')} = ${N}$` : `La série compte $N = ${N}$ valeurs.`,
      },
      etendue: { q: 'Calculer l\'étendue de la série.', a: `$${dec(s.max)} - ${dec(s.min)} = ${dec(s.max - s.min)}$${unitTxt}` },
      moyenne: {
        q: 'Calculer la moyenne de la série (arrondie au dixième si nécessaire).',
        a: table
          ? `$\\bar{x} = \\dfrac{${values.map((v, i) => `${v} \\times ${counts[i]}`).join(' + ')}}{${N}} = \\dfrac{${sum}}{${N}} ${eqApprox(sum / N, 1)}$`
          : `$\\bar{x} = \\dfrac{${sum}}{${N}} ${eqApprox(sum / N, 1)}$${unitTxt}`,
      },
      mediane: {
        q: 'Déterminer la médiane de la série.',
        a: lines(
          table ? `Effectifs cumulés croissants : ${counts.map((_, i) => counts.slice(0, i + 1).reduce((a, b) => a + b, 0)).join(' ; ')}.` : `Série ordonnée : ${list(sorted)}.`,
          N % 2
            ? `$N = ${N}$ est impair : la médiane est la $${rankTex((N + 1) / 2)}$ valeur, $\\mathrm{Me} = ${dec(s.median)}$.`
            : `$N = ${N}$ est pair : la médiane est la moyenne des $${rankTex(N / 2)}$ et $${rankTex(N / 2 + 1)}$ valeurs, $\\mathrm{Me} = \\dfrac{${sorted[N / 2 - 1]} + ${sorted[N / 2]}}{2} = ${dec(s.median)}$.`,
        ),
      },
      quartiles: {
        q: 'Déterminer le premier et le troisième quartile.',
        a: lines(
          `$\\dfrac{N}{4} = ${dec(N / 4)}$ : $Q_1$ est la $${rankTex(Math.ceil(N / 4))}$ valeur de la série ordonnée, $Q_1 = ${dec(s.q1)}$.`,
          `$\\dfrac{3N}{4} = ${dec((3 * N) / 4)}$ : $Q_3$ est la $${rankTex(Math.ceil((3 * N) / 4))}$ valeur, $Q_3 = ${dec(s.q3)}$.`,
        ),
      },
      eiq: { q: 'Calculer l\'écart interquartile.', a: `$Q_3 - Q_1 = ${dec(s.q3)} - ${dec(s.q1)} = ${dec(s.q3 - s.q1)}$` },
      sd: { q: 'À l\'aide de la calculatrice, donner l\'écart type de la série (arrondi au centième).', a: `$\\sigma \\approx ${dec(round(s.sd, 2))}$` },
    };
    const order = d === 1 ? ['N', 'etendue', 'moyenne', 'mediane', 'quartiles', 'eiq']
      : d === 2 ? ['moyenne', 'mediane', 'quartiles', 'eiq', 'etendue', 'N']
        : ['N', 'moyenne', 'mediane', 'quartiles', 'eiq', 'sd'];
    for (const k of order.slice(0, n)) questions.push(Q[k as keyof typeof Q]);
    return { intro, table, items: questions, numbering: 'num', cols: 1 };
  },
};

// ─── Vecteurs ──────────────────────────────────────────────────────────────

const vec = (a: string) => t`\overrightarrow{${a}}`;

const vecteurs: Generator = {
  id: 'vecteurs',
  title: 'Vecteurs et coordonnées',
  subject: 'maths',
  theme: 'Géométrie',
  levels: ['2de'],
  desc: 'Coordonnées d\'un vecteur, distance, milieu, parallélogramme, alignement (déterminant).',
  count: [2, 5, 4],
  countLabel: 'questions',
  generate(rng, n, d) {
    const R = d === 1 ? [0, 7] : [-6, 7];
    const P = (): [number, number] => [rng.int(R[0], R[1]), rng.int(R[0], R[1])];
    let A: [number, number];
    let B: [number, number];
    let C: [number, number];
    const aligned = d === 3 && rng.chance(0.5);
    for (;;) {
      A = P();
      B = P();
      if (A[0] === B[0] && A[1] === B[1]) continue;
      if (aligned) {
        const k = rng.pick([-1, 2, -2, 3]);
        C = [A[0] + k * (B[0] - A[0]), A[1] + k * (B[1] - A[1])];
        if (Math.abs(C[0]) > 12 || Math.abs(C[1]) > 12) continue;
      } else {
        C = P();
      }
      const det = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
      if (!aligned && det === 0) continue;
      break;
    }
    const AB = [B[0] - A[0], B[1] - A[1]];
    const AC = [C[0] - A[0], C[1] - A[1]];
    const len2 = AB[0] ** 2 + AB[1] ** 2;
    const [k, m] = sqrtParts(len2);
    const mid = [new Frac(A[0] + C[0], 2), new Frac(A[1] + C[1], 2)];
    const D = [A[0] + C[0] - B[0], A[1] + C[1] - B[1]];
    const det = AB[0] * AC[1] - AB[1] * AC[0];
    const all: Item[] = [
      {
        q: `Calculer les coordonnées du vecteur $${vec('AB')}$.`,
        a: `$${vec('AB')}${col('x_B - x_A', 'y_B - y_A')}$, soit $${vec('AB')}${col(`${B[0]} - ${paren(A[0])}`, `${B[1]} - ${paren(A[1])}`)}$, donc $${vec('AB')}${col(AB[0], AB[1])}$.`,
      },
      {
        q: 'Calculer la longueur $AB$.',
        a: `$AB = \\sqrt{(x_B - x_A)^2 + (y_B - y_A)^2} = \\sqrt{${paren(AB[0])}^2 + ${paren(AB[1])}^2} = \\sqrt{${len2}}${m === 1 || k > 1 ? ` = ${sqrtTex(len2)}` : ''}$.`,
      },
      {
        q: 'Déterminer les coordonnées du milieu $I$ du segment $[AC]$.',
        a: `$x_I = \\dfrac{x_A + x_C}{2} = \\dfrac{${A[0]} + ${paren(C[0])}}{2} = ${mid[0].tex(true, true)}$ et $y_I = \\dfrac{${A[1]} + ${paren(C[1])}}{2} = ${mid[1].tex(true, true)}$, donc $${pt('I', mid[0].tex(true, true), mid[1].tex(true, true))}$.`,
      },
      aligned
        ? {
            q: 'Calculer la longueur $AC$.',
            a: `$AC = \\sqrt{${paren(AC[0])}^2 + ${paren(AC[1])}^2} = \\sqrt{${AC[0] ** 2 + AC[1] ** 2}}${sqrtParts(AC[0] ** 2 + AC[1] ** 2)[0] > 1 || sqrtParts(AC[0] ** 2 + AC[1] ** 2)[1] === 1 ? ` = ${sqrtTex(AC[0] ** 2 + AC[1] ** 2)}` : ''}$.`,
          }
        : {
            q: 'Déterminer les coordonnées du point $D$ tel que $ABCD$ soit un parallélogramme.',
            a: `$ABCD$ est un parallélogramme si et seulement si $${vec('AD')} = ${vec('BC')}$ : $x_D - ${paren(A[0])} = ${C[0]} - ${paren(B[0])}$ et $y_D - ${paren(A[1])} = ${C[1]} - ${paren(B[1])}$, donc $${pt('D', D[0], D[1])}$.`,
          },
      {
        q: 'Les points $A$, $B$ et $C$ sont-ils alignés ? Justifier.',
        a: lines(
          `$${vec('AC')}${col(AC[0], AC[1])}$ et $\\det(${vec('AB')}, ${vec('AC')}) = ${paren(AB[0])} \\times ${paren(AC[1])} - ${paren(AB[1])} \\times ${paren(AC[0])} = ${det}$.`,
          det === 0
            ? 'Le déterminant est nul : les vecteurs sont colinéaires et les points $A$, $B$ et $C$ sont alignés.'
            : 'Le déterminant n\'est pas nul : les vecteurs ne sont pas colinéaires, les points $A$, $B$ et $C$ ne sont pas alignés.',
        ),
      },
    ];
    const items = n >= 5 ? all : [...all.slice(0, n - 1), all[4]];
    return {
      intro: `Dans un repère orthonormé, on considère les points $${pt('A', A[0], A[1])}$, $${pt('B', B[0], B[1])}$ et $${pt('C', C[0], C[1])}$.`,
      items: d === 1 && n < 5 ? all.slice(0, n) : items,
      numbering: 'num',
      cols: 1,
    };
  },
};

// ─── Second degré ──────────────────────────────────────────────────────────

/** (p + s·k√m)/q simplifié, q > 0. */
function radicalRoot(p: number, s: 1 | -1, k: number, m: number, q: number): string {
  const g = gcd(gcd(p, k), q) || 1;
  p /= g; k /= g; q /= g;
  if (q < 0) {
    p = -p; q = -q; s = -s as 1 | -1;
  }
  const rad = `${k === 1 ? '' : k}\\sqrt{${m}}`;
  const num = p === 0 ? `${s < 0 ? '-' : ''}${rad}` : `${p} ${s < 0 ? '-' : '+'} ${rad}`;
  return q === 1 ? num : t`\dfrac{${num}}{${q}}`;
}

function quadraticItem(rng: Rng, i: number, d: Difficulty): Item | null {
  let a: number;
  let b: number;
  let c: number;
  const noRoot = i % 4 === 3;
  if (noRoot) {
    a = rng.pick([1, -1, 2, -2, 3]);
    const al = rng.int(-4, 4);
    const k = Math.sign(a) * rng.int(1, 6);
    [a, b, c] = [a, -2 * a * al, a * al * al + k];
  } else if (d === 1) {
    a = rng.pick([1, 1, -1, 2]);
    const x1 = rng.int(-6, 6);
    const x2 = rng.int(-6, 6);
    if (x1 === x2) return null;
    [b, c] = [-a * (x1 + x2), a * x1 * x2];
  } else if (d === 2) {
    if (i % 4 === 2) {
      a = rng.pick([1, -1, 2, 3]);
      const al = rng.nz(-5, 5);
      [b, c] = [-2 * a * al, a * al * al];
    } else {
      const q = rng.pick([2, 3]);
      const p = rng.nz(-7, 7);
      if (gcd(p, q) !== 1) return null;
      const r = rng.int(-5, 5);
      const s = rng.pick([1, -1]);
      // s(qx − p)(x − r)
      a = s * q;
      b = s * (-q * r - p);
      c = s * p * r;
    }
  } else {
    a = rng.pick([1, -1, 2, -2, 3]);
    b = rng.nz(-9, 9);
    c = rng.nz(-9, 9);
    const D = b * b - 4 * a * c;
    if (D <= 0 || sqrtParts(D)[1] === 1) return null;
  }
  if (b === 0 && c === 0) return null;
  const D = b * b - 4 * a * c;
  const eq = `${poly([c, b, a])} = 0`;
  const delta = `$\\Delta = b^2 - 4ac = ${paren(b)}^2 - 4 \\times ${paren(a)} \\times ${paren(c)} = ${D}$`;
  if (D < 0) return { q: `$${eq}$`, a: lines(`${delta}.`, `$\\Delta < 0$ : l'équation n'a pas de solution réelle, $S = \\varnothing$.`) };
  if (D === 0) {
    const x0 = new Frac(-b, 2 * a);
    return { q: `$${eq}$`, a: lines(`${delta}.`, `$\\Delta = 0$ : une solution double, $x_0 = -\\dfrac{b}{2a} = ${chain([rawFrac(-b, 2 * a), x0.tex()])}$. $${solSet([x0.tex()])}$`) };
  }
  const [k, m] = sqrtParts(D);
  let x1: string;
  let x2: string;
  let v1: number;
  let v2: number;
  const sq = `\\sqrt{${D}}`;
  if (m === 1) {
    const f1 = new Frac(-b - k, 2 * a);
    const f2 = new Frac(-b + k, 2 * a);
    x1 = chain([t`\dfrac{${-b} - ${sq}}{${2 * a}}`, rawFrac(-b - k, 2 * a), f1.tex()]);
    x2 = chain([t`\dfrac{${-b} + ${sq}}{${2 * a}}`, rawFrac(-b + k, 2 * a), f2.tex()]);
    v1 = f1.value; v2 = f2.value;
    const sorted = v1 < v2 ? [f1, f2] : [f2, f1];
    return { q: `$${eq}$`, a: lines(`${delta}.`, `$\\Delta > 0$ et $\\sqrt{\\Delta} = ${k}$ : deux solutions, $x_1 = ${x1}$ et $x_2 = ${x2}$.`, `$${solSet(sorted.map((f) => f.tex()))}$`) };
  }
  const r1 = radicalRoot(-b, -1, k, m, 2 * a);
  const r2 = radicalRoot(-b, 1, k, m, 2 * a);
  x1 = chain([t`\dfrac{${-b} - ${sq}}{${2 * a}}`, r1]);
  x2 = chain([t`\dfrac{${-b} + ${sq}}{${2 * a}}`, r2]);
  v1 = (-b - Math.sqrt(D)) / (2 * a);
  v2 = (-b + Math.sqrt(D)) / (2 * a);
  return { q: `$${eq}$`, a: lines(`${delta}.`, `$\\Delta > 0$ : deux solutions, $x_1 = ${x1}$ et $x_2 = ${x2}$.`, `$${solSet(v1 < v2 ? [r1, r2] : [r2, r1])}$`) };
}

const secondDegre: Generator = {
  id: 'second-degre',
  title: 'Équations du second degré',
  subject: 'maths',
  theme: 'Équations',
  levels: ['1re'],
  desc: 'Discriminant et solutions exactes : racines entières, rationnelles, doubles ou avec radicaux.',
  count: [2, 8, 4],
  countLabel: 'équations',
  generate(rng, n, d) {
    return { intro: 'Résoudre dans $\\mathbb{R}$ les équations suivantes.', items: distinct(n, (i) => retry(() => quadraticItem(rng, i, d))), numbering: 'alpha', cols: 1 };
  },
};

// ─── Forme canonique ───────────────────────────────────────────────────────

function canonicalItem(rng: Rng, d: Difficulty): Item | null {
  let a: number;
  let al: Frac;
  let be: Frac;
  if (d === 1) {
    a = 1;
    al = new Frac(rng.nz(-6, 6));
    be = new Frac(rng.int(-9, 9));
  } else if (d === 2) {
    a = rng.pick([-1, 2, -2, 3, -3]);
    al = new Frac(rng.nz(-4, 4));
    be = new Frac(rng.int(-9, 9));
  } else {
    a = rng.pick([1, 1, -1, 2]);
    al = new Frac(rng.nz(-7, 7) * 2 + 1, a === 2 ? 4 : 2);
    be = new Frac(rng.int(-20, 20), 4);
  }
  const b = al.mul(-2 * a);
  const c = al.mul(al).mul(a).add(be);
  if (!b.isInt || !c.isInt || b.n === 0) return null;
  const inner = `\\left(${lin(1, al.neg(), 'x', true)}\\right)^2`;
  const canon = `${coefBefore(a)}${inner}${be.n === 0 ? '' : be.n > 0 ? ` + ${be.tex()}` : ` - ${be.neg().tex()}`}`;
  const f = poly([c.n, b.n, a]);
  const vertex = d >= 2;
  return {
    q: `Donner la forme canonique de $f(x) = ${f}$${vertex ? ' et en déduire les coordonnées du sommet $S$ de la parabole' : ''}.`,
    a: lines(
      `$\\alpha = -\\dfrac{b}{2a} = ${chain([rawFrac(-b.n, 2 * a), al.tex()])}$ et $\\beta = f(\\alpha) = ${be.tex()}$,`,
      `donc $f(x) = ${canon}$${vertex ? ` et $${pt('S', al.tex(), be.tex())}$` : ''}.`,
    ),
  };
}

const formeCanonique: Generator = {
  id: 'forme-canonique',
  title: 'Forme canonique',
  subject: 'maths',
  theme: 'Fonctions',
  levels: ['1re'],
  desc: 'Forme canonique a(x − α)² + β d\'un trinôme et sommet de la parabole.',
  count: [1, 8, 3],
  countLabel: 'trinômes',
  generate(rng, n, d) {
    return { intro: '', items: distinct(n, () => retry(() => canonicalItem(rng, d))), numbering: 'alpha', cols: 1 };
  },
};

// ─── Suites arithmétiques et géométriques ──────────────────────────────────

function seqItem(rng: Rng, i: number, d: Difficulty): Item | null {
  const kinds = d === 1 ? ['a-exp', 'g-exp', 'nature'] : d === 2 ? ['a-two', 'g-two', 'a-exp', 'g-exp', 'nature'] : ['a-sum', 'g-sum', 'a-two', 'g-two'];
  const kind = kinds[i % kinds.length];
  const u = rng.pick(['u', 'v', 'w']);
  const U = (k: number | string) => `${u}_{${k}}`;
  const seq = `$(${u}_n)$`;
  if (kind === 'a-exp') {
    const u0 = rng.int(-10, 20);
    const r = rng.nz(-6, 6);
    const k = rng.int(10, 50);
    return {
      q: `La suite ${seq} est arithmétique de premier terme $${U(0)} = ${u0}$ et de raison $r = ${r}$. Exprimer $${U('n')}$ en fonction de $n$, puis calculer $${U(k)}$.`,
      a: lines(`Pour tout entier naturel $n$, $${U('n')} = ${U(0)} + nr = ${lin(r, u0, 'n')}$.`, `$${U(k)} = ${u0} ${r > 0 ? '+' : '-'} ${Math.abs(r)} \\times ${k} = ${u0 + r * k}$`),
    };
  }
  if (kind === 'g-exp') {
    const u0 = rng.nz(-5, 8);
    const q = rng.pick([2, 3, -2, 5]);
    const k = rng.int(4, q === 5 ? 6 : 9);
    return {
      q: `La suite ${seq} est géométrique de premier terme $${U(0)} = ${u0}$ et de raison $q = ${q}$. Exprimer $${U('n')}$ en fonction de $n$, puis calculer $${U(k)}$.`,
      a: lines(
        `Pour tout entier naturel $n$, $${U('n')} = ${U(0)} \\times q^n = ${u0 === 1 ? '' : u0 === -1 ? '-' : `${u0} \\times `}${paren(q)}^n$.`,
        `$${U(k)} = ${u0} \\times ${paren(q)}^{${k}} = ${dec(u0 * q ** k)}$`,
      ),
    };
  }
  if (kind === 'nature') {
    if (rng.chance(0.5)) {
      const r = rng.nz(-7, 7);
      const b = rng.nz(-9, 9);
      return {
        q: `Soit ${seq} la suite définie pour tout entier naturel $n$ par $${U('n')} = ${lin(r, b, 'n')}$. Montrer que ${seq} est arithmétique.`,
        a: `Pour tout $n$, $${U('n+1')} - ${U('n')} = ${coefBefore(r)}(n + 1) ${b > 0 ? '+' : '-'} ${Math.abs(b)} - (${lin(r, b, 'n')}) = ${r}$ : la différence est constante, ${seq} est arithmétique de raison $${r}$ et de premier terme $${U(0)} = ${b}$.`,
      };
    }
    const k = rng.int(2, 9) * rng.sign();
    const q = rng.pick([2, 3, 5]);
    return {
      q: `Soit ${seq} la suite définie pour tout entier naturel $n$ par $${U('n')} = ${k} \\times ${q}^n$. Montrer que ${seq} est géométrique.`,
      a: `Pour tout $n$, $${U('n+1')} = ${k} \\times ${q}^{n+1} = ${q} \\times (${k} \\times ${q}^n) = ${q} \\times ${U('n')}$ : ${seq} est géométrique de raison $${q}$ et de premier terme $${U(0)} = ${k}$.`,
    };
  }
  if (kind === 'a-two') {
    const u0 = rng.int(-10, 15);
    const r = rng.nz(-5, 6);
    const p = rng.int(1, 5);
    const q = p + rng.int(2, 6);
    const up = u0 + p * r;
    const uq = u0 + q * r;
    return {
      q: `La suite ${seq} est arithmétique avec $${U(p)} = ${up}$ et $${U(q)} = ${uq}$. Déterminer sa raison $r$ et son premier terme $${U(0)}$.`,
      a: lines(`$${U(q)} = ${U(p)} + ${q - p}r$, donc $r = \\dfrac{${uq} - ${paren(up)}}{${q - p}} = ${r}$.`, `$${U(0)} = ${U(p)} - ${p}r = ${up} - ${paren(p * r)} = ${u0}$`),
    };
  }
  if (kind === 'g-two') {
    const u0 = rng.int(1, 6);
    const q = rng.pick([2, 3, 4, 5]);
    const u1 = u0 * q;
    const u3 = u0 * q ** 3;
    return {
      q: `La suite ${seq} est géométrique de raison strictement positive, avec $${U(1)} = ${u1}$ et $${U(3)} = ${dec(u3)}$. Déterminer sa raison $q$ et son premier terme $${U(0)}$.`,
      a: lines(`$${U(3)} = ${U(1)} \\times q^2$, donc $q^2 = \\dfrac{${dec(u3)}}{${u1}} = ${q * q}$ et, comme $q > 0$, $q = ${q}$.`, `$${U(0)} = \\dfrac{${U(1)}}{q} = \\dfrac{${u1}}{${q}} = ${u0}$`),
    };
  }
  if (kind === 'a-sum') {
    const u0 = rng.int(-5, 12);
    const r = rng.nz(-4, 6);
    const n = rng.int(10, 40);
    const un = u0 + n * r;
    const S = ((n + 1) * (u0 + un)) / 2;
    return {
      q: `La suite ${seq} est arithmétique de premier terme $${U(0)} = ${u0}$ et de raison $${r}$. Calculer $S = ${U(0)} + ${U(1)} + \\dots + ${U(n)}$.`,
      a: lines(`$${U(n)} = ${u0} ${r > 0 ? '+' : '-'} ${n} \\times ${Math.abs(r)} = ${un}$.`, `$S = (${n} + 1) \\times \\dfrac{${U(0)} + ${U(n)}}{2} = ${n + 1} \\times \\dfrac{${u0} + ${paren(un)}}{2} = ${dec(S)}$`),
    };
  }
  const u0 = rng.int(1, 5);
  const q = rng.pick([2, 3]);
  const n = rng.int(5, q === 2 ? 12 : 8);
  const S = (u0 * (1 - q ** (n + 1))) / (1 - q);
  return {
    q: `La suite ${seq} est géométrique de premier terme $${U(0)} = ${u0}$ et de raison $${q}$. Calculer $S = ${U(0)} + ${U(1)} + \\dots + ${U(n)}$.`,
    a: `$S = ${U(0)} \\times \\dfrac{1 - q^{${n + 1}}}{1 - q} = ${u0} \\times \\dfrac{1 - ${q}^{${n + 1}}}{1 - ${q}} = ${dec(S)}$`,
  };
}

const suites: Generator = {
  id: 'suites',
  title: 'Suites arithmétiques et géométriques',
  subject: 'maths',
  theme: 'Suites',
  levels: ['1re'],
  desc: 'Terme général, raison à partir de deux termes, nature d\'une suite, sommes de termes consécutifs.',
  count: [1, 6, 3],
  countLabel: 'questions',
  generate(rng, n, d) {
    return { intro: '', items: distinct(n, (i) => retry(() => seqItem(rng, i, d))), numbering: 'num', cols: 1 };
  },
};

// ─── Dérivation ────────────────────────────────────────────────────────────

const E = '\\mathrm{e}';
const parLin = (a: number, b: number) => (b === 0 ? (a === 1 ? 'x' : a === -1 ? '-x' : `${a}x`) : `(${lin(a, b)})`);

function derivItem(rng: Rng, i: number, d: Difficulty): Item | null {
  const kinds = d === 1 ? ['poly', 'inv', 'sqrt', 'pow'] : d === 2 ? ['prodExp', 'quot', 'expAff', 'powAff'] : ['lnAff', 'xln', 'sqrtAff', 'expQuad', 'lnQuot', 'expQuot'];
  const kind = kinds[i % kinds.length];
  let f: string;
  let fp: string;
  switch (kind) {
    case 'poly': {
      const c = [rng.int(-9, 9), rng.int(-9, 9), rng.int(-6, 6), rng.nz(-4, 4)];
      f = poly(c);
      fp = poly([c[1], 2 * c[2], 3 * c[3]]);
      break;
    }
    case 'inv': {
      const a = rng.nz(-9, 9);
      const b = rng.int(-5, 5);
      f = `${a < 0 ? '-' : ''}\\dfrac{${Math.abs(a)}}{x}${b ? (b > 0 ? ` + ${b}x` : ` - ${-b}x`).replace(/ 1x$/, ' x') : ''}`;
      fp = `${a > 0 ? '-' : ''}\\dfrac{${Math.abs(a)}}{x^2}${b ? (b > 0 ? ` + ${b}` : ` - ${-b}`) : ''}`;
      break;
    }
    case 'sqrt': {
      const a = rng.int(1, 8);
      const c = rng.int(-6, 6);
      f = `${a === 1 ? '' : a}\\sqrt{x}${c ? (c > 0 ? ` + ${c}x` : ` - ${-c}x`).replace(/ 1x$/, ' x') : ''}`;
      const main = a % 2 === 0 ? `\\dfrac{${a / 2}}{\\sqrt{x}}` : `\\dfrac{${a}}{2\\sqrt{x}}`;
      fp = `${main}${c ? (c > 0 ? ` + ${c}` : ` - ${-c}`) : ''}`;
      break;
    }
    case 'pow': {
      const n = rng.int(4, 7);
      const a = rng.nz(-5, 5);
      const b = rng.int(-9, 9);
      f = terms([[a, n], [b, 1]]);
      fp = terms([[a * n, n - 1], [b, 0]]);
      break;
    }
    case 'prodExp': {
      const a = rng.nz(-5, 5);
      const b = rng.int(-6, 6);
      f = `${parLin(a, b)}${E}^{x}`;
      fp = chain([`${coefBefore(a)}${E}^{x} + ${parLin(a, b)}${E}^{x}`, `${parLin(a, a + b)}${E}^{x}`]);
      break;
    }
    case 'quot': {
      const a = rng.nz(-5, 5);
      const b = rng.int(-6, 6);
      const c = rng.int(1, 4);
      const dd = rng.nz(-6, 6);
      const num = a * dd - b * c;
      if (num === 0) return null;
      f = t`\dfrac{${lin(a, b)}}{${lin(c, dd)}}`;
      fp = chain([
        t`\dfrac{${coefBefore(a)}(${lin(c, dd)}) - ${coefBefore(c)}(${lin(a, b)})}{(${lin(c, dd)})^2}`,
        `${num < 0 ? '-' : ''}\\dfrac{${Math.abs(num)}}{(${lin(c, dd)})^2}`,
      ]);
      break;
    }
    case 'expAff': {
      const a = rng.nz(-5, 5);
      const b = rng.int(-5, 5);
      const k = rng.int(1, 4);
      if (a === 1 && b === 0) return null;
      f = `${k === 1 ? '' : k}${E}^{${lin(a, b)}}`;
      fp = `${dec(k * a)}${E}^{${lin(a, b)}}`.replace(/^1\\/, '\\').replace(/^-1\\/, '-\\');
      break;
    }
    case 'powAff': {
      const n = rng.int(2, 5);
      const a = rng.int(2, 5) * rng.sign();
      const b = rng.nz(-7, 7);
      f = `(${lin(a, b)})^{${n}}`;
      fp = chain([`${n} \\times ${paren(a)} \\times (${lin(a, b)})^{${n - 1}}`.replace(/\^\{1\}$/, ''), `${n * a}(${lin(a, b)})^{${n - 1}}`.replace(/\^\{1\}$/, '')]);
      break;
    }
    case 'lnAff': {
      const a = rng.int(1, 6);
      const b = rng.nz(-8, 8);
      f = `\\ln(${lin(a, b)})`;
      fp = t`\dfrac{${a}}{${lin(a, b)}}`;
      break;
    }
    case 'xln': {
      const a = rng.nz(-4, 4);
      const b = rng.int(-5, 5);
      if (b === 0 && a !== 1) return null;
      f = `${parLin(a, b)}\\ln x`;
      fp = b === 0 ? chain(['\\ln x + x \\times \\dfrac{1}{x}', '\\ln x + 1'])
        : chain([`${coefBefore(a)}\\ln x + ${parLin(a, b)} \\times \\dfrac{1}{x}`, t`${coefBefore(a)}\ln x + \dfrac{${lin(a, b)}}{x}`]);
      break;
    }
    case 'sqrtAff': {
      const a = rng.int(1, 6);
      const b = rng.nz(-8, 8);
      f = `\\sqrt{${lin(a, b)}}`;
      fp = t`\dfrac{${a}}{2\sqrt{${lin(a, b)}}}`;
      break;
    }
    case 'expQuad': {
      const b = rng.int(-5, 5);
      f = `${E}^{${poly([0, b, 1])}}`;
      fp = `${parLin(2, b)}${E}^{${poly([0, b, 1])}}`;
      break;
    }
    case 'lnQuot':
      f = t`\dfrac{\ln x}{x}`;
      fp = chain([t`\dfrac{\frac{1}{x} \times x - \ln x}{x^2}`, t`\dfrac{1 - \ln x}{x^2}`]);
      break;
    default:
      f = t`\dfrac{${E}^{x}}{x}`;
      fp = chain([t`\dfrac{${E}^{x} \times x - ${E}^{x}}{x^2}`, t`\dfrac{(x - 1)${E}^{x}}{x^2}`]);
  }
  return { q: `$f(x) = ${f}$`, a: `$f'(x) = ${fp}$` };
}

const derivees: Generator = {
  id: 'derivees',
  title: 'Calculs de dérivées',
  subject: 'maths',
  theme: 'Analyse',
  levels: ['1re', 'Tle'],
  desc: 'Polynômes, inverse, racine, produits, quotients, exponentielle, logarithme et composées.',
  count: [2, 12, 6],
  countLabel: 'fonctions',
  generate(rng, n, d) {
    return {
      intro: 'Dans chaque cas, la fonction $f$ est dérivable sur son ensemble de définition (ou sur l\'intervalle où l\'expression a un sens). Calculer $f\'(x)$.',
      items: distinct(n, (i) => retry(() => derivItem(rng, i, d))),
      numbering: 'alpha',
      cols: 2,
    };
  },
};

// ─── Loi binomiale ─────────────────────────────────────────────────────────

function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

const pmf = (n: number, p: number, k: number) => binom(n, k) * p ** k * (1 - p) ** (n - k);
const r3 = (x: number) => eqApprox(x, 3);

const binomiale: Generator = {
  id: 'binomiale',
  title: 'Loi binomiale',
  subject: 'maths',
  theme: 'Statistiques et probabilités',
  levels: ['1re', 'Tle'],
  desc: 'Schéma de Bernoulli, paramètres, P(X = k), au moins un succès, espérance et écart type.',
  count: [2, 6, 4],
  countLabel: 'questions',
  generate(rng, count, d) {
    const n = d === 1 ? rng.int(4, 6) : d === 2 ? rng.int(8, 20) : rng.int(15, 40);
    const ctx = rng.pick([
      { intro: `On lance $${n}$ fois un dé équilibré à six faces. On note $X$ le nombre de 6 obtenus.`, p: 1 / 6, pt: t`\dfrac{1}{6}`, qt: t`\dfrac{5}{6}`, succ: '« obtenir 6 »', unit: 'six' },
      { intro: `Un QCM comporte $${n}$ questions ; pour chacune, quatre réponses sont proposées dont une seule est exacte. Un élève répond au hasard à chaque question. On note $X$ le nombre de bonnes réponses.`, p: 0.25, pt: '0{,}25', qt: '0{,}75', succ: '« la réponse est exacte »', unit: 'bonnes réponses' },
      ...[0.03, 0.05, 0.08].map((p) => ({ intro: `Une usine fabrique des pièces dont $${dec(p * 100)}\\,\\%$ sont défectueuses. On prélève au hasard $${n}$ pièces ; la production est assez importante pour assimiler ce prélèvement à des tirages avec remise. On note $X$ le nombre de pièces défectueuses.`, p, pt: dec(p), qt: dec(1 - p), succ: '« la pièce est défectueuse »', unit: 'pièces défectueuses' })),
      { intro: `Un joueur de basket réussit un lancer franc avec une probabilité de $0{,}7$. Il effectue $${n}$ lancers, supposés indépendants. On note $X$ le nombre de lancers réussis.`, p: 0.7, pt: '0{,}7', qt: '0{,}3', succ: '« le lancer est réussi »', unit: 'lancers réussis' },
    ]);
    const p = ctx.p;
    const powP = (e: number) => (ctx.pt.includes('frac') ? `\\left(${ctx.pt}\\right)^{${e}}` : `${ctx.pt}^{${e}}`);
    const powQ = (e: number) => (ctx.qt.includes('frac') ? `\\left(${ctx.qt}\\right)^{${e}}` : `${ctx.qt}^{${e}}`);
    const mean = n * p;
    const k = Math.max(1, Math.min(n - 1, Math.round(mean) + rng.int(-1, 1)));
    const k2 = Math.max(1, Math.min(n - 1, Math.round(mean) + rng.int(0, 2)));
    let cdf = 0;
    for (let j = 0; j <= k2; j++) cdf += pmf(n, p, j);
    const all: Record<string, Item> = {
      loi: {
        q: 'Justifier que $X$ suit une loi binomiale dont on précisera les paramètres.',
        a: `On répète $${n}$ fois, de façon identique et indépendante, une épreuve de Bernoulli dont le succès ${ctx.succ} a pour probabilité $p = ${ctx.pt}$. $X$ compte le nombre de succès : $X$ suit la loi binomiale $\\mathcal{B}\\left(${n} \\,;\\, ${ctx.pt}\\right)$.`,
      },
      eq: {
        q: `Calculer $P(X = ${k})$, arrondie à $10^{-3}$.`,
        a: `$P(X = ${k}) = \\binom{${n}}{${k}} \\times ${powP(k)} \\times ${powQ(n - k)} ${r3(pmf(n, p, k))}$`,
      },
      atleast: {
        q: 'Calculer la probabilité d\'obtenir au moins un succès, arrondie à $10^{-3}$.',
        a: `$P(X \\geqslant 1) = 1 - P(X = 0) = 1 - ${powQ(n)} ${r3(1 - (1 - p) ** n)}$`,
      },
      le: {
        q: `À l'aide de la calculatrice, donner $P(X \\leqslant ${k2})$, arrondie à $10^{-3}$.`,
        a: `$P(X \\leqslant ${k2}) ${r3(cdf)}$`,
      },
      ge: {
        q: `En déduire $P(X > ${k2})$.`,
        a: `$P(X > ${k2}) = 1 - P(X \\leqslant ${k2}) ${r3(1 - cdf)}$`,
      },
      esp: {
        q: 'Calculer l\'espérance de $X$ et l\'interpréter.',
        a: `$E(X) = np = ${n} \\times ${ctx.pt} ${eqApprox(mean, 2)}$ : sur un grand nombre de répétitions de l'expérience, on obtient en moyenne environ $${dec(round(mean, 1))}$ ${ctx.unit}.`,
      },
      var: {
        q: 'Calculer la variance et l\'écart type de $X$.',
        a: `$V(X) = np(1 - p) = ${n} \\times ${ctx.pt} \\times ${ctx.qt} ${eqApprox(mean * (1 - p), 3)}$ et $\\sigma(X) = \\sqrt{V(X)} \\approx ${dec(round(Math.sqrt(mean * (1 - p)), 2))}$.`,
      },
    };
    const order = d === 1 ? ['loi', 'eq', 'atleast', 'esp', 'var', 'le'] : d === 2 ? ['loi', 'eq', 'atleast', 'le', 'esp', 'var'] : ['loi', 'eq', 'le', 'ge', 'esp', 'var'];
    return { intro: ctx.intro, items: order.slice(0, count).map((key) => all[key]), numbering: 'num', cols: 1 };
  },
};

// ─── Exponentielle et logarithme ───────────────────────────────────────────

function lnSol(k: number, a: number, b: number): string {
  // x = (ln k − b) / a, a > 0
  const num = b === 0 ? `\\ln ${k}` : `\\ln ${k} ${b > 0 ? '-' : '+'} ${Math.abs(b)}`;
  return a === 1 ? num : t`\dfrac{${num}}{${a}}`;
}

function expLnItem(rng: Rng, i: number, d: Difficulty): Item | null {
  const kinds = d === 1 ? ['ex=k', 'lnx=c', 'eaff=1'] : d === 2 ? ['eaff=k', 'lnaff=c', 'e=e'] : ['quad', 'lnsum', 'ineq'];
  const kind = kinds[i % kinds.length];
  if (kind === 'ex=k') {
    const k = rng.int(2, 20);
    if (rng.chance(0.15)) {
      const m = -rng.int(1, 9);
      return { q: `$${E}^{x} = ${m}$`, a: `Pour tout réel $x$, $${E}^{x} > 0$ : l'équation n'a pas de solution, $S = \\varnothing$.` };
    }
    return { q: `$${E}^{x} = ${k}$`, a: `$${E}^{x} = ${k} \\iff x = \\ln ${k}$. $${solSet([`\\ln ${k}`])}$` };
  }
  if (kind === 'lnx=c') {
    const c = rng.nz(-3, 5);
    return { q: `$\\ln x = ${c}$`, a: `Sur $]0 \\,;\\, +\\infty[$ : $\\ln x = ${c} \\iff x = ${E}^{${c}}$. $${solSet([`${E}^{${c}}`])}$` };
  }
  if (kind === 'eaff=1') {
    const a = rng.nz(-6, 6);
    const b = rng.nz(-9, 9);
    const x = new Frac(-b, a);
    return { q: `$${E}^{${lin(a, b)}} = 1$`, a: `$${E}^{${lin(a, b)}} = ${E}^{0} \\iff ${lin(a, b)} = 0 \\iff x = ${x.tex()}$. $${solSet([x.tex()])}$` };
  }
  if (kind === 'eaff=k') {
    const a = rng.int(1, 5);
    const b = rng.nz(-9, 9);
    const k = rng.int(2, 15);
    const s = lnSol(k, a, b);
    return { q: `$${E}^{${lin(a, b)}} = ${k}$`, a: `$${E}^{${lin(a, b)}} = ${k} \\iff ${lin(a, b)} = \\ln ${k} \\iff x = ${s}$. $${solSet([s])}$` };
  }
  if (kind === 'lnaff=c') {
    const a = rng.int(1, 5);
    const b = rng.nz(-9, 9);
    const c = rng.nz(-2, 4);
    const lim = new Frac(-b, a);
    const num = b === 0 ? `${E}^{${c}}` : `${E}^{${c}} ${b > 0 ? '-' : '+'} ${Math.abs(b)}`;
    const s = a === 1 ? num : t`\dfrac{${num}}{${a}}`;
    return {
      q: `$\\ln(${lin(a, b)}) = ${c}$`,
      a: lines(`L'équation a un sens pour $${lin(a, b)} > 0$, soit $x > ${lim.tex()}$.`, `$\\ln(${lin(a, b)}) = ${c} \\iff ${lin(a, b)} = ${E}^{${c}} \\iff x = ${s}$, qui vérifie la condition car $${E}^{${c}} > 0$. $${solSet([s])}$`),
    };
  }
  if (kind === 'e=e') {
    const a = rng.nz(-5, 5);
    const c = rng.intExcept(-5, 5, a, 0);
    const b = rng.nz(-9, 9);
    const dd = rng.int(-9, 9);
    const x = new Frac(dd - b, a - c);
    return {
      q: `$${E}^{${lin(a, b)}} = ${E}^{${lin(c, dd)}}$`,
      a: `La fonction exponentielle est strictement croissante : $${chain([`${lin(a, b)} = ${lin(c, dd)}`, `${lin(a - c, 0)} = ${dd - b}`, `x = ${x.tex()}`], '\\iff')}$. $${solSet([x.tex()])}$`,
    };
  }
  if (kind === 'quad') {
    const p = rng.int(1, 6);
    const q = rng.intExcept(-5, 7, 0, p);
    const B = -(p + q);
    const C = p * q;
    const roots = [p, q].filter((r) => r > 0).sort((x, y) => x - y);
    const lnOf = (r: number) => (r === 1 ? '0' : `\\ln ${r}`);
    const mid = B === 0 ? '' : ` ${B < 0 ? '-' : '+'} ${Math.abs(B) === 1 ? '' : Math.abs(B)}${E}^{x}`;
    return {
      q: `$${E}^{2x}${mid} ${C < 0 ? '-' : '+'} ${Math.abs(C)} = 0$`,
      a: lines(
        `On pose $X = ${E}^{x}$, avec $X > 0$ : $${poly([C, B, 1], 'X')} = 0$, dont les solutions sont $X = ${Math.min(p, q)}$ et $X = ${Math.max(p, q)}$.`,
        roots.length === 2
          ? `$${E}^{x} = ${roots[0]} \\iff x = ${lnOf(roots[0])}$ et $${E}^{x} = ${roots[1]} \\iff x = ${lnOf(roots[1])}$. $${solSet(roots.map(lnOf))}$`
          : `$${E}^{x} = ${Math.min(p, q)}$ est impossible car $${E}^{x} > 0$ ; $${E}^{x} = ${roots[0]} \\iff x = ${lnOf(roots[0])}$. $${solSet([lnOf(roots[0])])}$`,
      ),
    };
  }
  if (kind === 'lnsum') {
    const r1 = rng.int(1, 6);
    const r2 = -rng.int(1, 8);
    const a = -(r1 + r2);
    const b = -r1 * r2;
    if (a === 0) return null;
    return {
      q: `$\\ln x + \\ln(${lin(1, a)}) = \\ln ${b}$`,
      a: lines(
        `L'équation a un sens pour $x > 0$ et $${lin(1, a)} > 0$, soit $x > ${Math.max(0, -a)}$.`,
        `Elle équivaut alors à $\\ln\\left(x(${lin(1, a)})\\right) = \\ln ${b}$, soit $${poly([-b, a, 1])} = 0$, de solutions $${r2}$ et $${r1}$.`,
        `Seule $${r1}$ convient : $${solSet([String(r1)])}$`,
      ),
    };
  }
  const a = rng.int(1, 4);
  const b = rng.nz(-6, 6);
  const k = rng.int(2, 12);
  const s = lnSol(k, a, b);
  const ge = rng.chance(0.5);
  return {
    q: `$${E}^{${lin(a, b)}} ${ge ? '\\geqslant' : '<'} ${k}$`,
    a: `La fonction $\\ln$ est strictement croissante sur $]0 \\,;\\, +\\infty[$ : $${lin(a, b)} ${ge ? '\\geqslant' : '<'} \\ln ${k} \\iff x ${ge ? '\\geqslant' : '<'} ${s}$. $S = ${ge ? `\\left[${s} \\,;\\, +\\infty\\right[` : `\\left]-\\infty \\,;\\, ${s}\\right[`}$`,
  };
}

const expLn: Generator = {
  id: 'exp-ln',
  title: 'Équations avec exponentielle et logarithme',
  subject: 'maths',
  theme: 'Analyse',
  levels: ['1re', 'Tle'],
  desc: 'eˣ = k, ln x = c, équations affines, changement de variable X = eˣ, inéquations.',
  count: [2, 9, 6],
  countLabel: 'équations',
  generate(rng, n, d) {
    return { intro: 'Résoudre dans $\\mathbb{R}$ les équations et inéquations suivantes.', items: distinct(n, (i) => retry(() => expLnItem(rng, i, d))), numbering: 'alpha', cols: d === 1 ? 2 : 1 };
  },
};

export const LYCEE: Generator[] = [pourcentages, affine, stats, vecteurs, secondDegre, formeCanonique, suites, derivees, binomiale, expLn];
