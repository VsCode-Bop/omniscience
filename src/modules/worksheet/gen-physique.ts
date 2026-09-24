/**
 * Exercices de physique-chimie : unités, notation scientifique, vitesse, masse volumique,
 * poids, loi d'Ohm et puissance, énergie, solutions, quantité de matière, équations de
 * réaction. Les résultats respectent les chiffres significatifs des données.
 */
import { ATOMIC_MASS, elementsOf, formulaTex, molarMass, REACTIONS, type Side } from './chem';
import type { Rng } from './rng';
import { dec, decSci, decTex, decValue, lines, normDec, round, sci, sig, sigCount, t, type Decimal } from './tex';
import { distinct, type Difficulty, type Generator, type Item } from './types';

const u = (s: string) => t`\ \mathrm{${s}}`;

/** Donnée affichée avec ses chiffres significatifs : [valeur, écriture LaTeX]. */
type Datum = [number, string];
const D = (x: number, n: number): Datum => [x, sig(x, n)];
const sfOf = (...ds: Datum[]) => Math.min(...ds.map(([, s]) => sigCount(s.replace(/\\times 10\^\{-?\d+\}/, ''))));

/** « = r » si le résultat est exact à n chiffres significatifs, « ≈ r » sinon. */
function res(x: number, n: number): string {
  const r = Number(x.toPrecision(n));
  return `${Math.abs(r - x) <= 1e-12 * Math.abs(x) ? '=' : '\\approx'} ${sig(x, n)}`;
}

function retry<T>(make: () => T | null): T {
  for (;;) {
    const v = make();
    if (v) return v;
  }
}

// ─── Conversions d'unités ──────────────────────────────────────────────────

type Unit = [string, number];
const LEN: Unit[] = [['km', 3], ['hm', 2], ['dam', 1], ['m', 0], ['dm', -1], ['cm', -2], ['mm', -3]];
const MASS: Unit[] = [['t', 6], ['kg', 3], ['g', 0], ['mg', -3]];
const CAP: Unit[] = [['L', 0], ['dL', -1], ['cL', -2], ['mL', -3]];
const VOL: Unit[] = [['m^3', 3], ['dm^3', 0], ['cm^3', -3], ['mm^3', -6]];
const AREA: Unit[] = [['km^2', 6], ['hm^2', 4], ['m^2', 0], ['dm^2', -2], ['cm^2', -4], ['mm^2', -6]];
const MANT = [25, 3, 125, 45, 7, 12, 375, 8, 65, 4, 15, 72, 5, 36];

function powerConversion(rng: Rng, from: Unit[], to: Unit[]): Item | null {
  const a = rng.pick(from);
  const b = rng.pick(to);
  if (a[0] === b[0]) return null;
  const v = normDec({ m: rng.pick(MANT), e: rng.int(-2, 1) });
  const r = normDec({ m: v.m, e: v.e + a[1] - b[1] });
  const mag = decValue(r);
  if (mag >= 1e7 || mag < 1e-4) return null;
  const big = mag >= 1e6 || mag < 1e-3;
  const lhs = `${decTex(v)}${u(a[0])}`;
  return { q: `$${lhs} = \\ldots${u(b[0])}$`, a: `$${lhs} = ${decTex(r)}${u(b[0])}${big ? ` = ${decSci(r)}${u(b[0])}` : ''}$` };
}

function conversionItem(rng: Rng, i: number, d: Difficulty): Item | null {
  if (d === 1) return powerConversion(rng, ...([[LEN, LEN], [MASS, MASS], [CAP, CAP]] as [Unit[], Unit[]][])[i % 3]);
  if (d === 2) {
    const k = i % 4;
    if (k === 0) return powerConversion(rng, VOL, CAP);
    if (k === 1) return powerConversion(rng, CAP, VOL);
    if (k === 2) return powerConversion(rng, AREA, AREA);
    return timeItem(rng);
  }
  const k = i % 4;
  if (k === 0) return speedItem(rng);
  if (k === 1) return energyUnitItem(rng);
  if (k === 2) return powerConversion(rng, VOL, VOL);
  return timeItem(rng);
}

function timeItem(rng: Rng): Item {
  const k = rng.int(0, 3);
  const H = u('h');
  const MIN = u('min');
  const S = u('s');
  if (k === 0) {
    const x = rng.pick([1.5, 2.25, 0.75, 3.2, 1.25, 0.4, 2.5, 0.2]);
    return { q: `$${dec(x)}${H} = \\ldots${MIN}$`, a: `$${dec(x)}${H} = ${dec(x)} \\times 60${MIN} = ${dec(round(x * 60, 6))}${MIN}$` };
  }
  if (k === 1) {
    const h = rng.int(1, 4);
    const m = rng.pick([5, 10, 15, 20, 25, 35, 40, 45, 50]);
    return { q: `$${h}${H}\\,${m}${MIN} = \\ldots${MIN}$`, a: `$${h}${H}\\,${m}${MIN} = ${h} \\times 60${MIN} + ${m}${MIN} = ${60 * h + m}${MIN}$` };
  }
  if (k === 2) {
    let s = rng.int(70, 590);
    if (s % 60 === 0) s += 7;
    return { q: `$${s}${S} = \\ldots${MIN}\\,\\ldots${S}$`, a: `$${s}${S} = ${Math.floor(s / 60)} \\times 60${S} + ${s % 60}${S} = ${Math.floor(s / 60)}${MIN}\\,${s % 60}${S}$` };
  }
  const m = rng.pick([15, 30, 45, 12, 6, 90, 150, 36, 24]);
  return { q: `$${m}${MIN} = \\ldots${H}$`, a: t`$${m}${MIN} = \dfrac{${m}}{60}${H} = ${dec(m / 60)}${H}$` };
}

function speedItem(rng: Rng): Item {
  if (rng.chance(0.5)) {
    const v = rng.pick([5, 10, 12.5, 15, 20, 25, 30, 35, 40]);
    return { q: `$${dec(v)}${u('m/s')} = \\ldots${u('km/h')}$`, a: t`$${dec(v)}${u('m/s')} = \dfrac{${dec(v)} \times 3\,600}{1\,000}${u('km/h')} = ${dec(round(v * 3.6, 6))}${u('km/h')}$` };
  }
  const V = rng.pick([18, 36, 54, 72, 90, 108, 126, 144]);
  return { q: `$${V}${u('km/h')} = \\ldots${u('m/s')}$`, a: t`$${V}${u('km/h')} = \dfrac{${dec(V * 1000)}${u('m')}}{3\,600${u('s')}} = ${dec(V / 3.6)}${u('m/s')}$` };
}

function energyUnitItem(rng: Rng): Item {
  const k = rng.int(0, 2);
  if (k === 0) {
    const x = rng.pick([1, 2.5, 0.5, 3, 12, 1.5]);
    return { q: `$${dec(x)}${u('kWh')} = \\ldots${u('J')}$`, a: t`$${dec(x)}${u('kWh')} = ${dec(x)} \times 1\,000${u('W')} \times 3\,600${u('s')} = ${sci(x * 3.6e6, 3, false)}${u('J')}$` };
  }
  if (k === 1) {
    const x = rng.pick([2, 5, 0.5, 10, 1.5]);
    return { q: `$${sci(x * 3.6e6, 3, false)}${u('J')} = \\ldots${u('kWh')}$`, a: t`$${sci(x * 3.6e6, 3, false)}${u('J')} = \dfrac{${sci(x * 3.6e6, 3, false)}}{3{,}6 \times 10^{6}}${u('kWh')} = ${dec(x)}${u('kWh')}$` };
  }
  const x = rng.pick([60, 100, 250, 500, 1500]);
  return { q: `$${dec(x)}${u('Wh')} = \\ldots${u('J')}$`, a: t`$${dec(x)}${u('Wh')} = ${dec(x)} \times 3\,600${u('J')} = ${dec(x * 3600)}${u('J')}$` };
}

const conversions: Generator = {
  id: 'conversions',
  title: 'Conversions d\'unités',
  subject: 'physique',
  theme: 'Mesures et unités',
  levels: ['5e', '4e', '3e', '2de'],
  desc: 'Longueurs, masses, capacités, volumes et aires ; durées ; vitesses (km/h, m/s) ; énergie (kWh, J).',
  count: [3, 15, 9],
  countLabel: 'conversions',
  generate(rng, n, d) {
    return { intro: 'Compléter les égalités suivantes.', items: distinct(n, (i) => retry(() => conversionItem(rng, i, d))), numbering: 'alpha', cols: d === 3 ? 2 : 3 };
  },
};

// ─── Notation scientifique ─────────────────────────────────────────────────

const SCI_MANT = [12, 45, 3, 7, 125, 32, 605, 8, 91, 256, 5, 18, 402, 67];

function sciItem(rng: Rng, i: number, d: Difficulty): Item | null {
  if (d === 1) {
    const m = rng.pick(SCI_MANT);
    const n = rng.pick([-6, -5, -4, -3, -2, 2, 3, 4, 5, 6, 7, 8]);
    const v: Decimal = { m, e: n - String(m).length + 1 };
    return { q: `$${decTex(v)}$`, a: `$${decTex(v)} = ${decSci(v)}$` };
  }
  if (d === 2) {
    const m = rng.pick(SCI_MANT);
    const n = rng.int(-9, 9);
    const s = rng.pick([-3, -2, -1, 1, 2, 3]);
    const len = String(m).length;
    const V: Decimal = { m, e: n - len + 1 };
    const k = n - s;
    if (k === 0) return null;
    const A: Decimal = { m, e: V.e - k };
    const norm: Decimal = { m, e: 1 - len };
    return {
      q: `$${decTex(A)} \\times 10^{${k}}$`,
      a: `$${decTex(A)} \\times 10^{${k}} = ${decTex(norm)} \\times 10^{${s}} \\times 10^{${k}} = ${decSci(V)}$`,
    };
  }
  const p = rng.int(-8, 9);
  const q = rng.int(-8, 9);
  const pick = (): Decimal => normDec(rng.pick([{ m: 12, e: -1 }, { m: 15, e: -1 }, { m: 2, e: 0 }, { m: 25, e: -1 }, { m: 3, e: 0 }, { m: 4, e: 0 }, { m: 5, e: 0 }, { m: 6, e: 0 }, { m: 8, e: 0 }]));
  const a = pick();
  const b = pick();
  if (i % 2 === 0) {
    const ab: Decimal = { m: a.m * b.m, e: a.e + b.e };
    const q0 = t`(${decTex(a)} \times 10^{${p}}) \times (${decTex(b)} \times 10^{${q}})`;
    return { q: `$${q0}$`, a: `$${q0} = ${decTex(ab)} \\times 10^{${p + q}} = ${decSci({ m: ab.m, e: ab.e + p + q })}$` };
  }
  const top: Decimal = { m: a.m * b.m, e: a.e + b.e };
  const q0 = t`\dfrac{${decTex(top)} \times 10^{${p}}}{${decTex(b)} \times 10^{${q}}}`;
  return { q: `$${q0}$`, a: `$${q0} = ${decTex(a)} \\times 10^{${p - q}} = ${decSci({ m: a.m, e: a.e + p - q })}$` };
}

const notationScientifique: Generator = {
  id: 'notation-scientifique',
  title: 'Notation scientifique',
  subject: 'physique',
  theme: 'Mesures et unités',
  levels: ['4e', '3e', '2de'],
  desc: 'Écriture scientifique d\'un décimal ou d\'un produit a × 10ⁿ ; produits et quotients.',
  count: [3, 12, 6],
  countLabel: 'nombres',
  generate(rng, n, d) {
    return {
      intro: d === 3 ? 'Calculer et donner le résultat en notation scientifique.' : 'Donner l\'écriture scientifique des nombres suivants.',
      items: distinct(n, (i) => retry(() => sciItem(rng, i, d))),
      numbering: 'alpha',
      cols: d === 3 ? 2 : 3,
    };
  },
};

// ─── Vitesse ───────────────────────────────────────────────────────────────

const WHO = [
  { who: 'Un coureur', lo: 8, hi: 16, step: 1 },
  { who: 'Un cycliste', lo: 14, hi: 30, step: 1 },
  { who: 'Une voiture', lo: 50, hi: 130, step: 5 },
  { who: 'Un train', lo: 120, hi: 300, step: 10 },
];

function duration(h: number, hm: boolean): string {
  if (!hm || Number.isInteger(h)) return `${dec(h)}${u('h')}`;
  const H = Math.floor(h);
  const M = Math.round((h - H) * 60);
  return H ? `${H}${u('h')}\\,${M}${u('min')}` : `${M}${u('min')}`;
}

function speedProblem(rng: Rng, i: number, d: Difficulty): Item {
  if (d === 3 && i % 3 === 2) {
    if (rng.chance(0.5)) {
      const tt = rng.pick([2.5, 3.0, 4.0, 5.5, 6.0, 8.0]);
      return {
        q: `Pendant un orage, on entend le tonnerre $${dec(tt)}$ s après avoir vu l'éclair. Le son se propage dans l'air à $340$ m/s et la lumière arrive quasi instantanément. À quelle distance l'orage se trouve-t-il ?`,
        a: `$d = v \\times t = 340 \\times ${dec(tt)} ${res(340 * tt, 2)}${u('m')}$, soit environ $${dec(round((340 * tt) / 1000, 1))}$ km.`,
      };
    }
    return {
      q: 'La lumière se propage dans le vide à $c = 3{,}00 \\times 10^{8}$ m/s. Elle met $8$ min $20$ s pour nous parvenir du Soleil. Calculer la distance Terre–Soleil, en mètres puis en kilomètres.',
      a: t`$t = 8 \times 60 + 20 = 500${u('s')}$ ; $d = c \times t = 3{,}00 \times 10^{8} \times 500 = 1{,}50 \times 10^{11}${u('m')} = 1{,}50 \times 10^{8}${u('km')}$`,
    };
  }
  const w = rng.pick(WHO);
  const v = w.lo + w.step * rng.int(0, Math.floor((w.hi - w.lo) / w.step));
  const tt = rng.pick([0.5, 0.75, 1.5, 2, 2.5, 3, 1.25]);
  const dist = round(v * tt, 6);
  const hm = d >= 2;
  const T = duration(tt, hm);
  const tConv = hm && !Number.isInteger(tt) ? `$${T} = ${dec(tt)}${u('h')}$ ; ` : '';
  const ms = d >= 2 ? ` ; en m/s : $v = \\dfrac{${dec(v * 1000)}${u('m')}}{3\\,600${u('s')}} ${res(v / 3.6, 2)}${u('m/s')}$` : '';
  const k = i % 3;
  if (k === 0) {
    return {
      q: `${w.who} parcourt $${dec(dist)}$ km en $${T}$. Calculer sa vitesse moyenne en km/h${d >= 2 ? ' puis en m/s' : ''}.`,
      a: `${tConv}$v = \\dfrac{d}{t} = \\dfrac{${dec(dist)}${u('km')}}{${dec(tt)}${u('h')}} = ${dec(v)}${u('km/h')}$${ms}.`,
    };
  }
  if (k === 1) {
    return {
      q: `${w.who} roule à la vitesse moyenne de $${v}$ km/h pendant $${T}$. Quelle distance parcourt-il ?`,
      a: `${tConv}$d = v \\times t = ${v} \\times ${dec(tt)} = ${dec(dist)}${u('km')}$.`,
    };
  }
  return {
    q: `${w.who} doit parcourir $${dec(dist)}$ km à la vitesse moyenne de $${v}$ km/h. Combien de temps dure le trajet ?`,
    a: `$t = \\dfrac{d}{v} = \\dfrac{${dec(dist)}}{${v}} = ${dec(tt)}${u('h')}$${hm && !Number.isInteger(tt) ? `, soit $${duration(tt, true)}$` : ''}.`,
  };
}

const vitesse: Generator = {
  id: 'vitesse',
  title: 'Vitesse moyenne',
  subject: 'physique',
  theme: 'Mouvement',
  levels: ['5e', '4e', '3e'],
  desc: 'Relation v = d/t : vitesse, distance ou durée ; conversions h/min et km/h ↔ m/s ; son et lumière.',
  count: [1, 6, 3],
  countLabel: 'problèmes',
  generate(rng, n, d) {
    return { intro: '', items: distinct(n, (i) => speedProblem(rng, i, d)), numbering: 'alpha', cols: 1 };
  },
};

// ─── Masse volumique ───────────────────────────────────────────────────────

/** `art` : « il s'agit du fer » ; `de` : « une pièce de fer », « 750 g d'eau ». */
const MATERIALS: { name: string; art: string; de: string; rho: number; liquid?: boolean }[] = [
  { name: 'aluminium', art: 'de l\'', de: 'd\'', rho: 2.70 },
  { name: 'fer', art: 'du ', de: 'de ', rho: 7.87 },
  { name: 'cuivre', art: 'du ', de: 'de ', rho: 8.96 },
  { name: 'zinc', art: 'du ', de: 'de ', rho: 7.13 },
  { name: 'argent', art: 'de l\'', de: 'd\'', rho: 10.5 },
  { name: 'plomb', art: 'du ', de: 'de ', rho: 11.3 },
  { name: 'or', art: 'de l\'', de: 'd\'', rho: 19.3 },
  { name: 'eau', art: 'de l\'', de: 'd\'', rho: 1.00, liquid: true },
  { name: 'huile', art: 'de l\'', de: 'd\'', rho: 0.92, liquid: true },
  { name: 'éthanol', art: 'de l\'', de: 'd\'', rho: 0.79, liquid: true },
];
const RHO = t`\mathrm{g/cm^3}`;

function densityItem(rng: Rng, i: number, d: Difficulty): Item {
  const kinds = d === 1 ? ['identify', 'mass'] : d === 2 ? ['identify', 'volume', 'float'] : ['kgm3', 'liters', 'identify'];
  const kind = kinds[i % kinds.length];
  const solids = MATERIALS.filter((m) => !m.liquid);
  const liquids = MATERIALS.filter((m) => m.liquid);
  if (kind === 'identify') {
    const mat = rng.pick(solids);
    const V = rng.pick([10, 20, 25, 40, 50, 80, 100]);
    const m = round(mat.rho * V, 2);
    return {
      q: `Un objet plein a une masse de $${dec(m)}$ g et un volume de $${V}$ cm³. Calculer sa masse volumique et identifier le métal qui le constitue.`,
      a: `$\\rho = \\dfrac{m}{V} = \\dfrac{${dec(m)}}{${V}} = ${sig(mat.rho, 3)}\\ ${RHO}$ : il s'agit ${mat.art}${mat.name}.`,
    };
  }
  if (kind === 'mass') {
    const mat = rng.pick(solids);
    const V = rng.pick([5, 10, 12, 20, 25, 30, 50]);
    return {
      q: `Quelle est la masse d'une pièce ${mat.de}${mat.name} de volume $${V}$ cm³ ?`,
      a: `$m = \\rho \\times V = ${sig(mat.rho, 3)} \\times ${V} ${res(mat.rho * V, 3)}$ g`,
    };
  }
  if (kind === 'volume') {
    const mat = rng.pick(liquids);
    const m = rng.pick([100, 200, 250, 500, 750]);
    return {
      q: `Quel volume occupent $${m}$ g ${mat.de}${mat.name} ?`,
      a: `$V = \\dfrac{m}{\\rho} = \\dfrac{${m}}{${sig(mat.rho, 2)}} ${res(m / mat.rho, 3)}$ cm³, soit environ $${dec(round(m / mat.rho, 0))}$ mL.`,
    };
  }
  if (kind === 'float') {
    const m = rng.int(20, 90);
    const V = rng.int(30, 100);
    if (m === V) return densityItem(rng, i + 1, d);
    const rho = m / V;
    return {
      q: `Un objet de masse $${m}$ g et de volume $${V}$ cm³ est déposé dans l'eau. Flotte-t-il ?`,
      a: `$\\rho = \\dfrac{${m}}{${V}} ${res(rho, 2)}\\ ${RHO}$ ; ${rho < 1 ? 'c\'est moins que la masse volumique de l\'eau ($1{,}00\\ ' + RHO + '$) : l\'objet flotte.' : 'c\'est plus que la masse volumique de l\'eau ($1{,}00\\ ' + RHO + '$) : l\'objet coule.'}`,
    };
  }
  if (kind === 'kgm3') {
    const mat = rng.pick(MATERIALS);
    return {
      q: `Exprimer la masse volumique ${mat.art}${mat.name} en kg/m³.`,
      a: `$1\\ ${RHO} = 1\\,000\\ \\mathrm{kg/m^3}$, donc $\\rho = ${sig(mat.rho, 3)}\\ ${RHO} = ${sig(mat.rho * 1000, 3)}\\ \\mathrm{kg/m^3}$.`,
    };
  }
  const mat = rng.pick(liquids);
  const V = rng.pick([1.5, 2.0, 2.5, 5.0, 10]);
  const m = mat.rho * V * 1000;
  return {
    q: `Quelle est la masse, en kilogrammes, de $${dec(V)}$ L ${mat.de}${mat.name} ?`,
    a: `$V = ${dec(V * 1000)}$ mL $= ${dec(V * 1000)}$ cm³ et $m = \\rho \\times V = ${sig(mat.rho, 2)} \\times ${dec(V * 1000)} ${res(m, 2)}$ g, soit $${sig(m / 1000, 2)}$ kg.`,
  };
}

const masseVolumique: Generator = {
  id: 'masse-volumique',
  title: 'Masse volumique',
  subject: 'physique',
  theme: 'Matière et solutions',
  levels: ['5e', '4e', '2de'],
  desc: 'ρ = m/V : identifier un métal, calculer une masse ou un volume, flottaison, conversion en kg/m³.',
  count: [1, 6, 3],
  countLabel: 'questions',
  generate(rng, n, d) {
    return {
      intro: 'Données : masses volumiques de quelques substances.',
      table: [['Substance', ...MATERIALS.slice(0, 7).map((m) => m.name)], [`$\\rho$ (en $${RHO}$)`, ...MATERIALS.slice(0, 7).map((m) => `$${sig(m.rho, 3)}$`)]],
      items: distinct(n, (i) => densityItem(rng, i, d)),
      numbering: 'alpha',
      cols: 1,
    };
  },
};

// ─── Poids ─────────────────────────────────────────────────────────────────

const ASTRES = [
  { name: 'la Terre', g: 9.81 },
  { name: 'la Lune', g: 1.62 },
  { name: 'Mars', g: 3.71 },
  { name: 'Jupiter', g: 24.8 },
];
const NKG = t`\mathrm{N/kg}`;

function weightItem(rng: Rng, i: number, d: Difficulty): Item {
  const kinds = d === 1 ? ['P', 'm'] : d === 2 ? ['astre', 'grams', 'm'] : ['g', 'astre', 'grams'];
  const kind = kinds[i % kinds.length];
  if (kind === 'P') {
    const m = D(rng.pick([0.50, 1.2, 2.5, 5.0, 12, 45, 60, 75]), 2);
    return { q: `Calculer le poids, sur Terre, d'un objet de masse $m = ${m[1]}$ kg.`, a: `$P = m \\times g = ${m[1]} \\times 9{,}81 ${res(m[0] * 9.81, sfOf(m))}${u('N')}$` };
  }
  if (kind === 'm') {
    const P = D(rng.pick([4.9, 12, 25, 49, 98, 150, 490]), 2);
    return { q: `Un dynamomètre indique qu'un objet a un poids de $${P[1]}$ N sur Terre. Calculer sa masse.`, a: `$m = \\dfrac{P}{g} = \\dfrac{${P[1]}}{9{,}81} ${res(P[0] / 9.81, sfOf(P))}${u('kg')}$` };
  }
  if (kind === 'astre') {
    const a = rng.pick(ASTRES.slice(1));
    const m = D(rng.pick([80, 95, 110, 120]), 2);
    const Pa = m[0] * a.g;
    const Pt = m[0] * 9.81;
    return {
      q: `Un astronaute et son équipement ont une masse de $${m[1]}$ kg. Calculer leur poids sur ${a.name}, puis le comparer à leur poids sur Terre.`,
      a: lines(
        `Sur ${a.name} : $P = m \\times g = ${m[1]} \\times ${sig(a.g, 3)} ${res(Pa, 2)}${u('N')}$ ; sur Terre : $P = ${m[1]} \\times 9{,}81 ${res(Pt, 2)}${u('N')}$.`,
        a.g < 9.81 ? `Le poids est environ $${dec(round(9.81 / a.g, 1))}$ fois plus faible sur ${a.name}.` : `Le poids est environ $${dec(round(a.g / 9.81, 1))}$ fois plus grand sur ${a.name}.`,
      ),
    };
  }
  if (kind === 'grams') {
    const mg = rng.pick([150, 250, 380, 500, 750, 820]);
    return { q: `Calculer le poids, sur Terre, d'un objet de masse $${mg}$ g.`, a: `$m = ${mg}${u('g')} = ${dec(mg / 1000)}${u('kg')}$ et $P = m \\times g = ${dec(mg / 1000)} \\times 9{,}81 ${res((mg / 1000) * 9.81, 2)}${u('N')}$` };
  }
  const a = rng.pick(ASTRES);
  const m = D(rng.pick([2.0, 4.0, 5.0, 10]), 2);
  const P = D(m[0] * a.g, 2);
  return {
    q: `Sur un astre inconnu, un objet de masse $${m[1]}$ kg a un poids de $${P[1]}$ N. Calculer l'intensité de la pesanteur et identifier l'astre à l'aide du tableau.`,
    a: `$g = \\dfrac{P}{m} = \\dfrac{${P[1]}}{${m[1]}} ${res(P[0] / m[0], 2)}\\ ${NKG}$ : il s'agit de ${a.name}.`,
  };
}

const poids: Generator = {
  id: 'poids',
  title: 'Poids et masse',
  subject: 'physique',
  theme: 'Mouvement',
  levels: ['4e', '3e'],
  desc: 'P = m × g sur Terre, la Lune, Mars ou Jupiter ; masse à partir du poids ; identifier un astre.',
  count: [1, 6, 3],
  countLabel: 'questions',
  generate(rng, n, d) {
    return {
      intro: 'Données : intensité de la pesanteur à la surface de quelques astres.',
      table: [['Astre', ...ASTRES.map((a) => a.name.replace(/^la /, ''))], [`$g$ (en $${NKG}$)`, ...ASTRES.map((a) => `$${sig(a.g, 3)}$`)]],
      items: distinct(n, (i) => weightItem(rng, i, d)),
      numbering: 'alpha',
      cols: 1,
    };
  },
};

// ─── Loi d'Ohm, puissance, énergie ─────────────────────────────────────────

const OHM = t`\Omega`;

function ohmItem(rng: Rng, i: number, d: Difficulty): Item {
  const kinds = d === 1 ? ['U', 'I', 'R'] : d === 2 ? ['U-k', 'I-k', 'R'] : ['P', 'E', 'joule'];
  const kind = kinds[i % kinds.length];
  const R = D(rng.pick([100, 150, 220, 330, 470, 680]), 2);
  if (kind === 'U') {
    const I = D(rng.pick([0.020, 0.050, 0.010, 0.030, 0.040]), 2);
    return {
      q: `Un conducteur ohmique de résistance $R = ${R[1]}\\ ${OHM}$ est traversé par un courant d'intensité $I = ${I[1]}$ A. Calculer la tension $U$ à ses bornes.`,
      a: `$U = R \\times I = ${R[1]} \\times ${I[1]} ${res(R[0] * I[0], sfOf(R, I))}${u('V')}$`,
    };
  }
  if (kind === 'I') {
    const U = D(rng.pick([4.5, 6.0, 9.0, 12]), 2);
    const I = U[0] / R[0];
    return {
      q: `On applique une tension $U = ${U[1]}$ V aux bornes d'un conducteur ohmique de résistance $R = ${R[1]}\\ ${OHM}$. Calculer l'intensité du courant, en ampères puis en milliampères.`,
      a: `$I = \\dfrac{U}{R} = \\dfrac{${U[1]}}{${R[1]}} ${res(I, sfOf(U, R))}${u('A')}$, soit $${sig(I * 1000, sfOf(U, R))}${u('mA')}$.`,
    };
  }
  if (kind === 'R') {
    const U = D(rng.pick([3.0, 4.5, 6.0, 9.0, 12]), 2);
    const ImA = D(rng.pick([15, 20, 25, 30, 40, 50]), 2);
    const Ival = ImA[0] / 1000;
    return {
      q: `Un conducteur ohmique soumis à une tension de $${U[1]}$ V est traversé par un courant de $${ImA[1]}$ mA. Calculer sa résistance.`,
      a: `$I = ${ImA[1]}${u('mA')} = ${sig(Ival, 2)}${u('A')}$ et $R = \\dfrac{U}{I} = \\dfrac{${U[1]}}{${sig(Ival, 2)}} ${res(U[0] / Ival, sfOf(U, ImA))}\\ ${OHM}$`,
    };
  }
  if (kind === 'U-k') {
    const Rk = D(rng.pick([1.0, 1.5, 2.2, 3.3, 4.7, 6.8]), 2);
    const ImA = D(rng.pick([2.0, 3.0, 5.0, 8.0, 10]), 2);
    const U = Rk[0] * 1000 * (ImA[0] / 1000);
    return {
      q: `Un conducteur ohmique de résistance $R = ${Rk[1]}\\ \\mathrm{k${OHM}}$ est traversé par un courant de $${ImA[1]}$ mA. Calculer la tension à ses bornes.`,
      a: `$R = ${dec(Rk[0] * 1000)}\\ ${OHM}$, $I = ${sig(ImA[0] / 1000, 2)}${u('A')}$ et $U = R \\times I = ${dec(Rk[0] * 1000)} \\times ${sig(ImA[0] / 1000, 2)} ${res(U, sfOf(Rk, ImA))}${u('V')}$`,
    };
  }
  if (kind === 'I-k') {
    const Rk = D(rng.pick([1.0, 1.5, 2.2, 3.3, 4.7]), 2);
    const U = D(rng.pick([4.5, 6.0, 9.0, 12]), 2);
    const I = U[0] / (Rk[0] * 1000);
    return {
      q: `Calculer, en milliampères, l'intensité du courant qui traverse un conducteur ohmique de résistance $${Rk[1]}\\ \\mathrm{k${OHM}}$ soumis à une tension de $${U[1]}$ V.`,
      a: `$I = \\dfrac{U}{R} = \\dfrac{${U[1]}}{${dec(Rk[0] * 1000)}} ${res(I, sfOf(U, Rk))}${u('A')}$, soit $${sig(I * 1000, sfOf(U, Rk))}${u('mA')}$.`,
    };
  }
  if (kind === 'P') {
    const U = D(rng.pick([6.0, 12, 230]), 2);
    const I = D(U[0] > 100 ? rng.pick([0.26, 2.5, 8.7]) : rng.pick([0.30, 0.50, 1.5, 2.0]), 2);
    return {
      q: `Un appareil fonctionne sous une tension $U = ${U[1]}$ V et il est traversé par un courant d'intensité $I = ${I[1]}$ A. Calculer sa puissance électrique.`,
      a: `$P = U \\times I = ${U[1]} \\times ${I[1]} ${res(U[0] * I[0], sfOf(U, I))}${u('W')}$`,
    };
  }
  if (kind === 'E') {
    const P = rng.pick([[1500, '1\\,500'], [2000, '2\\,000'], [60, '60'], [800, '800'], [1200, '1\\,200']] as [number, string][]);
    const h = rng.pick([0.5, 1.5, 2, 3, 4]);
    const Ewh = P[0] * h;
    return {
      q: `Un appareil de puissance $P = ${P[1]}$ W fonctionne pendant $${duration(h, true)}$. Calculer l'énergie électrique consommée en kWh, puis en joules.`,
      a: t`$E = P \times t = ${dec(P[0] / 1000)}${u('kW')} \times ${dec(h)}${u('h')} = ${dec(Ewh / 1000)}${u('kWh')}$ ; $E = ${P[1]} \times ${dec(h * 3600)} = ${sci(Ewh * 3600, 3)}${u('J')}$`,
    };
  }
  const I = D(rng.pick([0.10, 0.20, 0.25, 0.50]), 2);
  const P = R[0] * I[0] * I[0];
  return {
    q: `Un conducteur ohmique de résistance $${R[1]}\\ ${OHM}$ est parcouru par un courant d'intensité $${I[1]}$ A. Calculer la puissance dissipée par effet Joule.`,
    a: `$P = R \\times I^2 = ${R[1]} \\times ${I[1]}^2 ${res(P, sfOf(R, I))}${u('W')}$`,
  };
}

const ohm: Generator = {
  id: 'loi-ohm',
  title: 'Loi d\'Ohm, puissance et énergie',
  subject: 'physique',
  theme: 'Électricité',
  levels: ['4e', '3e', '2de'],
  desc: 'U = R × I avec conversions (mA, kΩ), P = U × I, E = P × t (kWh et J), effet Joule.',
  count: [1, 6, 3],
  countLabel: 'questions',
  generate(rng, n, d) {
    return { intro: '', items: distinct(n, (i) => ohmItem(rng, i, d)), numbering: 'alpha', cols: 1 };
  },
};

// ─── Énergie mécanique ─────────────────────────────────────────────────────

function energyItem(rng: Rng, i: number, d: Difficulty): Item {
  const kinds = d === 1 ? ['Ec', 'Ec'] : d === 2 ? ['EcKmh', 'Epp', 'Ec'] : ['fall', 'vEc', 'Em'];
  const kind = kinds[i % kinds.length];
  if (kind === 'Ec') {
    const [who, ms, vs] = rng.pick([
      ['Une balle de tennis', [0.058], [20, 30, 45]],
      ['Un cycliste et son vélo', [75, 80, 90], [6.0, 8.0, 10]],
      ['Un ballon de football', [0.45], [15, 20, 25]],
      ['Un coureur', [60, 70], [5.0, 8.0]],
    ] as [string, number[], number[]][]);
    const m = D(rng.pick(ms), 2);
    const v = D(rng.pick(vs), 2);
    const Ec = 0.5 * m[0] * v[0] ** 2;
    return {
      q: `${who} de masse $${m[1]}$ kg se déplace à $${v[1]}$ m/s. Calculer son énergie cinétique.`,
      a: `$E_c = \\dfrac{1}{2} m v^2 = \\dfrac{1}{2} \\times ${m[1]} \\times ${v[1]}^2 ${res(Ec, sfOf(m, v))}${u('J')}$`,
    };
  }
  if (kind === 'EcKmh') {
    const m = D(rng.pick([900, 1100, 1200, 1500]), 2);
    const V = rng.pick([36, 54, 72, 90, 108, 126]);
    const v = V / 3.6;
    const Ec = 0.5 * m[0] * v * v;
    return {
      q: `Une voiture de masse $${m[1]}$ kg roule à $${V}$ km/h. Calculer son énergie cinétique.`,
      a: `$v = \\dfrac{${V}}{3{,}6} = ${dec(v)}${u('m/s')}$ et $E_c = \\dfrac{1}{2} \\times ${m[1]} \\times ${dec(v)}^2 ${res(Ec, 2)}${u('J')}$`,
    };
  }
  if (kind === 'Epp') {
    const m = D(rng.pick([0.50, 2.0, 5.0, 60, 75]), 2);
    const h = D(rng.pick([2.5, 10, 15, 30, 45]), 2);
    const E = m[0] * 9.81 * h[0];
    return {
      q: `Un objet de masse $${m[1]}$ kg se trouve à une altitude de $${h[1]}$ m. Calculer son énergie potentielle de pesanteur (origine au sol, $g = 9{,}81$ N/kg).`,
      a: `$E_{pp} = m \\times g \\times h = ${m[1]} \\times 9{,}81 \\times ${h[1]} ${res(E, sfOf(m, h))}${u('J')}$`,
    };
  }
  if (kind === 'fall') {
    const h = D(rng.pick([5.0, 10, 20, 45, 80]), 2);
    const v = Math.sqrt(2 * 9.81 * h[0]);
    return {
      q: `Un objet est lâché sans vitesse initiale d'une hauteur de $${h[1]}$ m. En négligeant les frottements, calculer sa vitesse lorsqu'il atteint le sol.`,
      a: t`Conservation de l'énergie mécanique : $m g h = \dfrac{1}{2} m v^2$, donc $v = \sqrt{2 g h} = \sqrt{2 \times 9{,}81 \times ${h[1]}} ${res(v, 2)}${u('m/s')}$, soit environ $${dec(round(v * 3.6, 0))}$ km/h.`,
    };
  }
  if (kind === 'vEc') {
    const m = D(rng.pick([0.50, 2.0, 60, 1200]), 2);
    const v = rng.pick([4.0, 6.0, 10, 15, 20]);
    const Ec = D(0.5 * m[0] * v * v, 2);
    return {
      q: `Un objet de masse $${m[1]}$ kg possède une énergie cinétique de $${Ec[1]}$ J. Calculer sa vitesse.`,
      a: t`$v = \sqrt{\dfrac{2 E_c}{m}} = \sqrt{\dfrac{2 \times ${Ec[1]}}{${m[1]}}} ${res(Math.sqrt((2 * Ec[0]) / m[0]), 2)}${u('m/s')}$`,
    };
  }
  const m = D(rng.pick([0.45, 0.60, 2.0]), 2);
  const v = D(rng.pick([8.0, 12, 15]), 2);
  const h = D(rng.pick([2.0, 3.5, 5.0]), 2);
  const Ec = 0.5 * m[0] * v[0] ** 2;
  const Epp = m[0] * 9.81 * h[0];
  return {
    q: `Un ballon de masse $${m[1]}$ kg passe à $${h[1]}$ m du sol avec une vitesse de $${v[1]}$ m/s. Calculer son énergie mécanique (origine de l'énergie potentielle au sol).`,
    a: `$E_c = \\dfrac{1}{2} \\times ${m[1]} \\times ${v[1]}^2 ${res(Ec, 2)}${u('J')}$ ; $E_{pp} = ${m[1]} \\times 9{,}81 \\times ${h[1]} ${res(Epp, 2)}${u('J')}$ ; $E_m = E_c + E_{pp} ${res(Ec + Epp, 2)}${u('J')}$`,
  };
}

const energie: Generator = {
  id: 'energie',
  title: 'Énergie cinétique et potentielle',
  subject: 'physique',
  theme: 'Énergie',
  levels: ['3e', '1re'],
  desc: 'Ec = ½mv², Epp = mgh, énergie mécanique, vitesse d\'un objet en chute libre.',
  count: [1, 6, 3],
  countLabel: 'questions',
  generate(rng, n, d) {
    return { intro: '', items: distinct(n, (i) => energyItem(rng, i, d)), numbering: 'alpha', cols: 1 };
  },
};

// ─── Concentration et dilution ─────────────────────────────────────────────

const SOLUTES = ['de sucre', 'de sel', 'de sulfate de cuivre', 'de glucose', 'de permanganate de potassium'];
const GL = t`\mathrm{g\cdot L^{-1}}`;

function concentrationItem(rng: Rng, i: number, d: Difficulty): Item {
  const kinds = d === 1 ? ['Cm', 'm'] : d === 2 ? ['Cm', 'm', 'V'] : ['dil', 'dilF', 'm'];
  const kind = kinds[i % kinds.length];
  const s = rng.pick(SOLUTES);
  const C = D(rng.pick([2.0, 5.0, 10, 20, 25, 40, 50]), 2);
  const VmL = D(rng.pick([50.0, 100, 200, 250, 500]), 3);
  const VL = VmL[0] / 1000;
  if (kind === 'Cm') {
    const m = D(C[0] * VL, 2);
    return {
      q: `On dissout $${m[1]}$ g ${s} dans de l'eau pour obtenir $${VmL[1]}$ mL de solution. Calculer la concentration en masse de la solution.`,
      a: `$V = ${sig(VL, 3)}${u('L')}$ et $C_m = \\dfrac{m}{V} = \\dfrac{${m[1]}}{${sig(VL, 3)}} ${res(m[0] / VL, 2)}\\ ${GL}$`,
    };
  }
  if (kind === 'm') {
    return {
      q: `Quelle masse ${s} faut-il peser pour préparer $${VmL[1]}$ mL de solution de concentration en masse $${C[1]}\\ ${GL}$ ?`,
      a: `$m = C_m \\times V = ${C[1]} \\times ${sig(VL, 3)} ${res(C[0] * VL, 2)}${u('g')}$`,
    };
  }
  if (kind === 'V') {
    const m = D(C[0] * VL, 2);
    return {
      q: `On dispose de $${m[1]}$ g ${s}. Quel volume de solution de concentration $${C[1]}\\ ${GL}$ peut-on préparer ?`,
      a: `$V = \\dfrac{m}{C_m} = \\dfrac{${m[1]}}{${C[1]}} ${res(m[0] / C[0], 2)}${u('L')}$, soit $${sig(VL * 1000, 2)}${u('mL')}$.`,
    };
  }
  if (kind === 'dil') {
    const F = rng.pick([2, 4, 5, 10, 20, 25]);
    const Cm = D(rng.pick([20, 40, 50, 100]), 2);
    const Vf = D(rng.pick([50.0, 100.0, 200.0, 250.0]), 3);
    const Cf = Cm[0] / F;
    return {
      q: `On dispose d'une solution mère de concentration en masse $${Cm[1]}\\ ${GL}$. Quel volume de solution mère faut-il prélever pour préparer $${Vf[1]}$ mL de solution fille de concentration $${sig(Cf, 2)}\\ ${GL}$ ? Préciser le facteur de dilution.`,
      a: t`Au cours de la dilution, la masse de soluté se conserve : $C_{m} \times V_{m} = C_{f} \times V_{f}$, donc $V_{m} = \dfrac{C_f \times V_f}{C_m} = \dfrac{${sig(Cf, 2)} \times ${Vf[1]}}{${Cm[1]}} ${res((Cf * Vf[0]) / Cm[0], 3)}${u('mL')}$. Facteur de dilution : $F = \dfrac{C_m}{C_f} = ${F}$.`,
    };
  }
  const F = rng.pick([5, 10, 20, 50]);
  return {
    q: `On dilue $${F}$ fois une solution ${s} de concentration $${C[1]}\\ ${GL}$. Quelle est la concentration de la solution obtenue ?`,
    a: t`$C_f = \dfrac{C_m}{F} = \dfrac{${C[1]}}{${F}} ${res(C[0] / F, 2)}\ ${GL}$`,
  };
}

const concentration: Generator = {
  id: 'concentration',
  title: 'Concentration en masse et dilution',
  subject: 'physique',
  theme: 'Matière et solutions',
  levels: ['2de'],
  desc: 'Cm = m/V, masse à peser, volume de solution, dilution et facteur de dilution.',
  count: [1, 6, 3],
  countLabel: 'questions',
  generate(rng, n, d) {
    return { intro: '', items: distinct(n, (i) => concentrationItem(rng, i, d)), numbering: 'alpha', cols: 1 };
  },
};

// ─── Quantité de matière ───────────────────────────────────────────────────

const MOLECULES: [string, string][] = [
  ['l\'eau', 'H2O'], ['le dioxyde de carbone', 'CO2'], ['le méthane', 'CH4'], ['l\'éthanol', 'C2H6O'], ['le glucose', 'C6H12O6'],
  ['le chlorure de sodium', 'NaCl'], ['l\'ammoniac', 'NH3'], ['le saccharose', 'C12H22O11'], ['le carbonate de calcium', 'CaCO3'],
  ['l\'acide sulfurique', 'H2SO4'], ['le propane', 'C3H8'], ['l\'aspirine', 'C9H8O4'], ['la caféine', 'C8H10N4O2'],
];
const GMOL = t`\mathrm{g\cdot mol^{-1}}`;
/** « 9,0 g d'eau », « de dioxyde de carbone ». */
const of = (name: string) => name.replace(/^l'/, 'd\'').replace(/^le /, 'de ').replace(/^la /, 'de ');
/** « la masse molaire de l'eau », « du méthane », « de la caféine ». */
const ofDef = (name: string) => name.replace(/^l'/, 'de l\'').replace(/^le /, 'du ').replace(/^la /, 'de la ');

function molarText(f: string): string {
  const parts = elementsOf(f);
  const sym = parts.map(([el, n]) => `${n === 1 ? '' : `${n} \\times `}M(\\mathrm{${el}})`).join(' + ');
  const num = parts.map(([el, n]) => `${n === 1 ? '' : `${n} \\times `}${sig(ATOMIC_MASS[el], el === 'H' ? 2 : 3)}`).join(' + ');
  return `M(${formulaTex(f)}) = ${sym} = ${num} = ${sig(molarMass(f), 3)}\\ ${GMOL}`;
}

function moleItem(rng: Rng, i: number, d: Difficulty, used: Set<string>): Item {
  const kinds = d === 1 ? ['M', 'n'] : d === 2 ? ['n', 'm', 'M'] : ['N', 'Nm', 'm'];
  const kind = kinds[i % kinds.length];
  const [name, f] = rng.pick(MOLECULES);
  for (const [el] of elementsOf(f)) used.add(el);
  const M = molarMass(f);
  const F = formulaTex(f);
  if (kind === 'M') {
    return { q: `Calculer la masse molaire moléculaire ${ofDef(name)} $${F}$.`, a: `$${molarText(f)}$` };
  }
  const n = D(rng.pick([0.10, 0.20, 0.25, 0.50, 1.5, 2.0, 0.050]), 2);
  if (kind === 'n') {
    const m = D(n[0] * M, 3);
    return {
      q: `Quelle quantité de matière contient un échantillon de $${m[1]}$ g ${of(name)} $${F}$ ?`,
      a: lines(`$${molarText(f)}$`, `$n = \\dfrac{m}{M} = \\dfrac{${m[1]}}{${sig(M, 3)}} ${res(m[0] / M, 2)}${u('mol')}$`),
    };
  }
  if (kind === 'm') {
    return {
      q: `Quelle masse ${of(name)} $${F}$ faut-il prélever pour disposer de $${n[1]}$ mol ?`,
      a: lines(`$${molarText(f)}$`, `$m = n \\times M = ${n[1]} \\times ${sig(M, 3)} ${res(n[0] * M, 2)}${u('g')}$`),
    };
  }
  if (kind === 'N') {
    return {
      q: `Combien d'entités (molécules ou groupements) contient un échantillon de $${n[1]}$ mol ${of(name)} ?`,
      a: `$N = n \\times N_A = ${n[1]} \\times 6{,}02 \\times 10^{23} ${res(n[0] * 6.02e23, 2)}$`,
    };
  }
  const m = D(n[0] * M, 3);
  return {
    q: `Combien de molécules contient un échantillon de $${m[1]}$ g ${of(name)} $${F}$ ?`,
    a: lines(`$${molarText(f)}$`, `$n = \\dfrac{m}{M} = \\dfrac{${m[1]}}{${sig(M, 3)}} ${res(m[0] / M, 2)}${u('mol')}$ et $N = n \\times N_A ${res((m[0] / M) * 6.02e23, 2)}$`),
  };
}

const quantiteMatiere: Generator = {
  id: 'quantite-matiere',
  title: 'Quantité de matière',
  subject: 'physique',
  theme: 'Matière et solutions',
  levels: ['2de', '1re'],
  desc: 'Masse molaire moléculaire, n = m/M, masse à prélever, nombre d\'entités (constante d\'Avogadro).',
  count: [1, 6, 3],
  countLabel: 'questions',
  generate(rng, n, d) {
    const used = new Set<string>();
    const items = distinct(n, (i) => moleItem(rng, i, d, used));
    const els = Object.keys(ATOMIC_MASS).filter((el) => used.has(el));
    return {
      intro: d === 3 ? 'Données : constante d\'Avogadro $N_A = 6{,}02 \\times 10^{23}\\ \\mathrm{mol^{-1}}$ et masses molaires atomiques.' : 'Données : masses molaires atomiques.',
      table: [['Élément', ...els.map((el) => `$\\mathrm{${el}}$`)], [`$M$ (en $${GMOL}$)`, ...els.map((el) => `$${sig(ATOMIC_MASS[el], el === 'H' ? 2 : 3)}$`)]],
      items,
      numbering: 'alpha',
      cols: 1,
    };
  },
};

// ─── Équations de réaction ─────────────────────────────────────────────────

const sideTex = (side: Side, blank: boolean) => side.map(([k, f]) => `${blank ? '\\ldots\\,' : k === 1 ? '' : `${k}\\,`}${formulaTex(f)}`).join(' + ');

const equilibrer: Generator = {
  id: 'equations-reaction',
  title: 'Ajuster une équation de réaction',
  subject: 'physique',
  theme: 'Transformations chimiques',
  levels: ['4e', '3e', '2de'],
  desc: 'Conservation des éléments et des charges : combustions, oxydations, réactions avec des ions.',
  count: [2, 10, 5],
  countLabel: 'équations',
  generate(rng, n, d) {
    const same = rng.shuffle(REACTIONS.filter((r) => r.level === d));
    const easier = rng.shuffle(REACTIONS.filter((r) => r.level < d));
    const harder = rng.shuffle(REACTIONS.filter((r) => r.level > d));
    const pool = [...same, ...easier, ...harder].slice(0, n);
    return {
      intro: 'Ajuster les équations de réaction suivantes en complétant les pointillés (un coefficient égal à 1 n\'est pas écrit dans le corrigé).',
      items: pool.map((r) => ({
        q: `$${sideTex(r.r, true)} \\longrightarrow ${sideTex(r.p, true)}$`,
        a: `$${sideTex(r.r, false)} \\longrightarrow ${sideTex(r.p, false)}$`,
      })),
      numbering: 'alpha',
      cols: 1,
    };
  },
};

export const PHYSIQUE: Generator[] = [conversions, notationScientifique, vitesse, masseVolumique, poids, ohm, energie, concentration, quantiteMatiere, equilibrer];
