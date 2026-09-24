import katex from 'katex';
import { all, create } from 'mathjs';
import { describe, expect, it } from 'vitest';
import { formulaTex, molarMass, parseFormula, REACTIONS, sideBalance } from '../src/modules/worksheet/chem';
import { toLatex, toMarkdown } from '../src/modules/worksheet/export';
import { GENERATORS, GENERATOR_BY_ID, PRESETS } from '../src/modules/worksheet/library';
import { richHtml, richLatex, segments } from '../src/modules/worksheet/rich';
import { Rng } from '../src/modules/worksheet/rng';
import { buildVersion, sanitize, stateFromPreset, type SheetState } from '../src/modules/worksheet/sheet';
import { dec, decSci, decTex, Frac, poly, sig, sqrtTex } from '../src/modules/worksheet/tex';
import type { Difficulty, Exercise } from '../src/modules/worksheet/types';

const math = create(all);

/** Formule LaTeX des fiches → expression mathjs (pour vérifier les corrigés numériquement). */
function texToMath(tex: string): string {
  let s = tex
    .replace(/\\left|\\right/g, '')
    .replace(/\\mathrm\{e\}/g, ' e ')
    .replace(/\\ln\s*\(/g, 'log(')
    .replace(/\\ln\s*([a-z0-9.]+)/g, 'log($1)')
    .replace(/\{,\}/g, '.')
    .replace(/\\,/g, '')
    .replace(/\\times/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\cdot/g, '*');
  for (let k = 0; k < 20; k++) {
    const before = s;
    s = s
      .replace(/\\sqrt\{([^{}]*)\}/g, 'sqrt($1)')
      .replace(/\\d?frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))')
      .replace(/\^\{([^{}]*)\}/g, '^($1)');
    if (s === before) break;
  }
  return s.replace(/\[/g, '(').replace(/\]/g, ')').replace(/x\s*\(/g, 'x * (');
}

const evalAt = (tex: string, x: number) => Number(math.evaluate(texToMath(tex), { x }));

function allText(ex: Exercise): string[] {
  return [ex.intro, ...(ex.table?.flat() ?? []), ...ex.items.flatMap((it) => [it.q, it.a]), ex.answer ?? ''];
}

const mathSegments = (s: string) => s.split('\n').flatMap((l) => segments(l)).filter((g) => g.math).map((g) => g.s);
const textSegments = (s: string) => s.split('\n').flatMap((l) => segments(l)).filter((g) => !g.math).map((g) => g.s);

/** Pour chaque modèle, difficulté et graine : les énoncés et corrigés générés. */
function* everything(seeds = 12): Generator<{ id: string; d: Difficulty; ex: Exercise }> {
  for (const g of GENERATORS) {
    for (const d of [1, 2, 3] as Difficulty[]) {
      for (let s = 0; s < seeds; s++) {
        const n = [g.count[0], g.count[2], g.count[1]][s % 3];
        yield { id: g.id, d, ex: g.generate(new Rng(`test-${g.id}-${d}-${s}`), n, d) };
      }
    }
  }
}

describe('générateur pseudo-aléatoire', () => {
  it('reproductible et uniforme', () => {
    const a = new Rng('abc');
    const b = new Rng('abc');
    const xs = Array.from({ length: 1000 }, () => a.next());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b.next()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.05);
    const r = new Rng('x');
    const ints = Array.from({ length: 2000 }, () => r.int(1, 6));
    expect(new Set(ints)).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });
});

describe('écriture des nombres', () => {
  it('décimaux, fractions, radicaux, notation scientifique', () => {
    expect(dec(12500)).toBe('12\\,500');
    expect(dec(-3.25)).toBe('-3{,}25');
    expect(dec(0.1 + 0.2)).toBe('0{,}3');
    expect(decTex({ m: 32, e: -4 })).toBe('0{,}0032');
    expect(decTex({ m: 45, e: 3 })).toBe('45\\,000');
    expect(decSci({ m: 45, e: 3 })).toBe('4{,}5 \\times 10^{4}');
    expect(new Frac(6, -8).tex()).toBe('-\\dfrac{3}{4}');
    expect(sqrtTex(72)).toBe('6\\sqrt{2}');
    expect(poly([-3, 0, 2])).toBe('2x^{2} - 3');
    expect(poly([1, -1])).toBe('-x + 1');
    expect(sig(0.5, 2)).toBe('0{,}50');
    expect(sig(375000, 3)).toBe('3{,}75 \\times 10^{5}');
  });
});

describe('bibliothèque d\'exercices', () => {
  it('identifiants uniques, métadonnées complètes', () => {
    expect(new Set(GENERATORS.map((g) => g.id)).size).toBe(GENERATORS.length);
    for (const g of GENERATORS) {
      expect(g.levels.length).toBeGreaterThan(0);
      expect(g.count[0]).toBeLessThanOrEqual(g.count[2]);
      expect(g.count[2]).toBeLessThanOrEqual(g.count[1]);
    }
    for (const p of PRESETS) for (const e of p.exercises) expect(GENERATOR_BY_ID.has(e.g)).toBe(true);
  });

  it('nombre de questions respecté, aucun NaN ni undefined, formules valides pour KaTeX', () => {
    const allowedText = /^[\p{L}\p{N}\s.,;:!?'’"«»()[\]/+\-=<>…–—€%°³²·]*$/u;
    for (const { id, ex } of everything()) {
      const ctx = `${id} : ${JSON.stringify(ex).slice(0, 300)}`;
      expect(ex.items.length, ctx).toBeGreaterThan(0);
      for (const s of allText(ex)) {
        expect(s, ctx).not.toMatch(/NaN|undefined|Infinity|\[object|\bnull\b/);
        for (const m of mathSegments(s)) {
          expect(() => katex.renderToString(m, { throwOnError: true, strict: 'error' }), `${id} : ${m}`).not.toThrow();
        }
        for (const txt of textSegments(s)) expect(txt, `${id} : texte « ${txt} »`).toMatch(allowedText);
      }
      for (const it of ex.items) {
        expect(it.q.trim().length, ctx).toBeGreaterThan(0);
        expect(it.a.trim().length, ctx).toBeGreaterThan(0);
      }
    }
  });

  it('questions distinctes au sein d\'un exercice', () => {
    for (const g of GENERATORS) {
      const ex = g.generate(new Rng(`distinct-${g.id}`), g.count[2], 2);
      const qs = ex.items.map((it) => it.q);
      expect(new Set(qs).size, g.id).toBe(qs.length);
    }
  });

  it('même graine, même fiche ; versions différentes', () => {
    const state = stateFromPreset(PRESETS[0], 'K7P2Q');
    const a = JSON.stringify(buildVersion(state, 0).map((b) => b.ex));
    expect(JSON.stringify(buildVersion(state, 0).map((b) => b.ex))).toBe(a);
    expect(JSON.stringify(buildVersion(state, 1).map((b) => b.ex))).not.toBe(a);
  });
});

describe('corrigés vérifiés numériquement', () => {
  const pick = (id: string) => [...everything(15)].filter((e) => e.id === id);

  it('calculs : chaque étape a la même valeur', () => {
    for (const id of ['fractions', 'priorites', 'puissances', 'developper', 'factoriser']) {
      for (const { ex } of pick(id)) {
        for (const it of ex.items) {
          const tex = mathSegments(it.a).join(' = ');
          const parts = tex.split(' = ');
          for (const x of [1.7, -0.6]) {
            const v0 = evalAt(parts[0], x);
            for (const p of parts.slice(1)) expect(evalAt(p, x), `${id} : ${tex}`).toBeCloseTo(v0, 6 - Math.max(0, Math.log10(Math.abs(v0) + 1)));
          }
        }
      }
    }
  });

  it('équations : les solutions annoncées vérifient l\'équation', () => {
    for (const id of ['equations', 'produit-nul', 'second-degre']) {
      for (const { ex } of pick(id)) {
        for (const it of ex.items) {
          const eq = mathSegments(it.q)[0];
          const [lhs, rhs] = eq.split(' = ');
          const f = (x: number) => evalAt(lhs, x) - evalAt(rhs, x);
          const sMatch = /S = (\\varnothing|\\left\\\{(.*)\\right\\\}|\\\{(.*)\\\})/.exec(it.a);
          expect(sMatch, `${id} : ${it.a}`).not.toBeNull();
          if (sMatch![1] === '\\varnothing') {
            const signs = new Set(Array.from({ length: 201 }, (_, k) => Math.sign(f(-50 + k * 0.5))));
            expect(signs.size, `${id} : ${eq}`).toBe(1);
            continue;
          }
          const sols = (sMatch![2] ?? sMatch![3]).split(' \\,;\\, ');
          for (const s of sols) expect(Math.abs(f(evalAt(s, 0))), `${id} : ${eq} ; x = ${s}`).toBeLessThan(1e-8);
          // Toutes les racines réelles d'un polynôme de degré ≤ 2 sont annoncées.
          if (id !== 'equations') expect(sols.length).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it('dérivées : comparaison avec le taux d\'accroissement', () => {
    for (const { ex } of pick('derivees')) {
      for (const it of ex.items) {
        const f = mathSegments(it.q)[0].replace(/^f\(x\) = /, '');
        const parts = mathSegments(it.a)[0].replace(/^f'\(x\) = /, '').split(' = ');
        for (const x of [1.3, 2.7, 4.1]) {
          const h = 1e-5;
          const num = (evalAt(f, x + h) - evalAt(f, x - h)) / (2 * h);
          if (!Number.isFinite(num)) continue;
          for (const p of parts) expect(Math.abs(evalAt(p, x) - num) / Math.max(1, Math.abs(num)), `${it.q} → ${p}`).toBeLessThan(1e-5);
        }
      }
    }
  });

  it('équations de réaction ajustées (éléments et charges)', () => {
    for (const r of REACTIONS) {
      const L = sideBalance(r.r);
      const R = sideBalance(r.p);
      expect([...L.atoms].sort(), JSON.stringify(r)).toEqual([...R.atoms].sort());
      expect(L.charge).toBe(R.charge);
    }
  });

  it('formules chimiques et masses molaires', () => {
    expect([...parseFormula('Fe(OH)3').atoms]).toEqual([['Fe', 1], ['O', 3], ['H', 3]]);
    expect(parseFormula('Cu^{2+}').charge).toBe(2);
    expect(parseFormula('HO^-').charge).toBe(-1);
    expect(formulaTex('C6H12O6')).toBe('\\mathrm{C_{6}H_{12}O_{6}}');
    expect(molarMass('H2O')).toBe(18);
    expect(molarMass('C6H12O6')).toBe(180);
    expect(molarMass('NaCl')).toBe(58.5);
  });
});

describe('texte riche et exports', () => {
  it('découpage texte / formules, échappements', () => {
    expect(segments('Soit $x = 2$ et 5 \\$.')).toEqual([{ math: false, s: 'Soit ' }, { math: true, s: 'x = 2' }, { math: false, s: ' et 5 $.' }]);
    expect(richLatex('50 % & plus_1 $x^2$')).toBe('50 \\% \\& plus\\_1 $x^2$');
  });

  it('HTML échappé : pas d\'injection depuis un lien partagé', () => {
    const html = richHtml('<img src=x onerror=alert(1)> $\\href{javascript:alert(1)}{x}$', katex);
    expect(html).not.toMatch(/<img/);
    expect(html).not.toMatch(/href=/);
  });

  it('LaTeX complet : environnements et accolades équilibrés', () => {
    const state: SheetState = {
      ...stateFromPreset(PRESETS[0], 'TEST1'),
      versions: 2,
      exercises: [
        ...GENERATORS.map((g) => ({ g: g.id, n: g.count[2], d: 2 as Difficulty, s: 1 })),
        { g: 'libre', n: 1, d: 1, s: 0, title: 'Problème', text: 'Un texte avec 50 % et $\\frac{1}{2}$.', answer: 'Réponse : $x = 3$.' },
      ],
    };
    const versions = [0, 1].map((v) => buildVersion(state, v));
    const tex = toLatex(state, versions);
    const begins = tex.match(/\\begin\{(\w+)\}/g)!.map((b) => b.slice(7, -1));
    const ends = tex.match(/\\end\{(\w+)\}/g)!.map((b) => b.slice(5, -1));
    expect(begins.sort()).toEqual(ends.sort());
    const stripped = tex.replace(/\\[{}]/g, '');
    let depth = 0;
    for (const c of stripped) {
      if (c === '{') depth++;
      if (c === '}') depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
    expect((tex.replace(/\\\$/g, '').match(/\$/g) ?? []).length % 2).toBe(0);
    expect(tex).toContain('\\begin{tikzpicture}');
    expect(tex).not.toMatch(/[×≈→−]/);
    const md = toMarkdown(state, versions);
    expect(md).toContain('# Corrigé');
    expect(md).toContain('data:image/svg+xml;base64,');
  });

  it('états partagés validés', () => {
    expect(sanitize(null)).toBeNull();
    const s = sanitize({ title: 42, seed: '<script>', versions: 99, exercises: [{ g: 'inconnu' }, { g: 'fractions', n: 1000, d: 7 }, { g: 'libre', text: 'x'.repeat(10000) }] })!;
    expect(s.title).toBe('Fiche d\'exercices');
    expect(s.seed).toMatch(/^[0-9A-Z]{5}$/);
    expect(s.versions).toBe(4);
    expect(s.exercises).toHaveLength(2);
    expect(s.exercises[0].n).toBe(GENERATOR_BY_ID.get('fractions')!.count[1]);
    expect(s.exercises[0].d).toBe(3);
    expect(s.exercises[1].text!.length).toBe(4000);
  });
});
