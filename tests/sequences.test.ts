import { describe, expect, it } from 'vitest';
import {
  conjectureLimit,
  detectMonotony,
  detectNature,
  fixedPoints,
  normalizeSequenceSource,
  SequenceProgram,
  thresholdPython,
  type SeqDef,
} from '../src/modules/sequences/model';
import { EXAMPLES, sanitizeState } from '../src/modules/sequences/state';

const explicit = (expr: string, n0 = 0, name: SeqDef['name'] = 'u'): SeqDef => ({ name, kind: 'explicit', expr, n0, init: [], color: 0 });
const recursive = (expr: string, init: string[], n0 = 0, name: SeqDef['name'] = 'u'): SeqDef => ({ name, kind: 'recursive', expr, n0, init, color: 0 });
const terms = (defs: SeqDef[], N: number, name: SeqDef['name'] = 'u', params: Record<string, number> = {}) => {
  const p = new SequenceProgram(defs, params);
  return { p, values: p.compute(N).get(name)! };
};

describe('notation des suites', () => {
  it('accepte les écritures usuelles d\'un terme', () => {
    expect(normalizeSequenceSource('0,5uₙ + 3')).toBe('0.5u(n) + 3');
    expect(normalizeSequenceSource('u_{n-1} + u_n')).toBe('u(n-1) + u(n)');
    expect(normalizeSequenceSource('2un + vn')).toBe('2u(n) + v(n)');
    expect(normalizeSequenceSource('max(1;2)')).toBe('max(1,2)');
  });

  it('distingue un terme d\'un produit : u(n+1) vs u(1 − u)', () => {
    const { p, values } = terms([recursive('3u(1 - u)', ['0,5'])], 2);
    expect(p.seqs[0].error).toBeUndefined();
    expect(values[1]).toBeCloseTo(0.75, 12);
    expect(values[2]).toBeCloseTo(3 * 0.75 * 0.25, 12);
  });
});

describe('calcul des termes', () => {
  it('suite explicite, premier rang n₀', () => {
    expect(terms([explicit('3 + 2n')], 4).values).toEqual([3, 5, 7, 9, 11]);
    expect(terms([explicit('1/n', 1)], 4).values).toEqual([1, 0.5, 1 / 3, 0.25]);
  });

  it('récurrence d\'ordre 1 dépendant de n', () => {
    const { values } = terms([recursive('u + 2n + 1', ['0'])], 5);
    expect(values).toEqual([0, 1, 4, 9, 16, 25]); // somme des impairs : n²
  });

  it('récurrence d\'ordre 2 (Fibonacci)', () => {
    const { p, values } = terms([recursive('u(n) + u(n-1)', ['1', '1'])], 9);
    expect(p.seqs[0].order).toBe(2);
    expect(values).toEqual([1, 1, 2, 3, 5, 8, 13, 21, 34, 55]);
  });

  it('suites liées, y compris un indice en avance', () => {
    const defs = [recursive('u(n) + u(n-1)', ['1', '1']), explicit('u(n+1) / u(n)', 0, 'v')];
    const { values } = terms(defs, 30, 'v');
    expect(values[30]).toBeCloseTo((1 + Math.sqrt(5)) / 2, 10);
  });

  it('définition par cas (Syracuse)', () => {
    const { values } = terms([recursive('u mod 2 == 0 ? u/2 : 3u + 1', ['6'])], 8);
    expect(values).toEqual([6, 3, 10, 5, 16, 8, 4, 2, 1]);
  });

  it('paramètres libres', () => {
    const { p, values } = terms([recursive('q u', ['2'])], 3, 'u', { q: 3 });
    expect(p.params).toEqual(['q']);
    expect(values).toEqual([2, 6, 18, 54]);
  });

  it('erreurs explicites', () => {
    expect(new SequenceProgram([explicit('u(n-1) + 1')]).seqs[0].error).toMatch(/Récurrente/);
    expect(new SequenceProgram([recursive('u(n+1)', ['1'])]).seqs[0].error).toMatch(/précédents/);
    expect(new SequenceProgram([explicit('v(n)')]).seqs[0].error).toMatch(/pas définie/);
    const circular = new SequenceProgram([explicit('v(n)'), explicit('u(n)', 0, 'v')]);
    circular.compute(3);
    expect(circular.seqs.some((s) => /circulaire/.test(s.error ?? ''))).toBe(true);
  });
});

describe('observations', () => {
  it('nature : arithmétique, géométrique, arithmético-géométrique', () => {
    expect(detectNature(terms([explicit('3 + 2n')], 20).values)).toEqual({ kind: 'arithmetic', r: 2 });
    expect(detectNature(terms([recursive('0,8u', ['10'])], 20).values)).toEqual({ kind: 'geometric', q: 0.8 });
    const { p, values } = terms([recursive('0,5u + 3', ['1'])], 20);
    expect(detectNature(values, p.mapOf('u'))).toEqual({ kind: 'arith-geo', a: 0.5, b: 3, l: 6 });
    // vₙ = uₙ − 6 reste reconnue géométrique malgré les erreurs d'arrondi quand uₙ → 6.
    const aux = terms([recursive('0,5u + 3', ['1']), explicit('u(n) - 6', 0, 'v')], 80, 'v');
    expect(detectNature(aux.values)).toEqual({ kind: 'geometric', q: 0.5 });
  });

  it('sens de variation, éventuellement à partir d\'un rang', () => {
    expect(detectMonotony(terms([explicit('n^2')], 10).values, 0)).toMatchObject({ kind: 'increasing', from: 0 });
    expect(detectMonotony(terms([explicit('(n - 3)^2')], 12).values, 0)).toMatchObject({ kind: 'increasing', from: 3 });
    expect(detectMonotony(terms([explicit('(-1)^n')], 10).values, 0).kind).toBe('none');
  });

  it('conjectures de limite', () => {
    expect(conjectureLimit(terms([recursive('(u + 2/u)/2', ['1'])], 10).values)).toEqual({ kind: 'converges', limit: 1.414213562 });
    expect(conjectureLimit(terms([explicit('1/n', 1)], 200).values, 1)).toEqual({ kind: 'converges', limit: 0 });
    expect(conjectureLimit(terms([explicit('(1 + 1/n)^n', 1)], 200).values, 1)).toMatchObject({ kind: 'converges' });
    expect(conjectureLimit(terms([recursive('u + 1/(n+1)', ['1'], 1)], 200).values, 1)).toEqual({ kind: 'infinite', sign: 1 });
    expect(conjectureLimit(terms([explicit('-sqrt(n)')], 100).values)).toEqual({ kind: 'infinite', sign: -1 });
    const cycle = conjectureLimit(terms([recursive('3,2u(1 - u)', ['0,2'])], 200).values);
    expect(cycle.kind).toBe('cycle');
    if (cycle.kind === 'cycle') expect(cycle.values).toHaveLength(2);
  });

  it('(1 + 1/n)ⁿ : limite proche de e', () => {
    const l = conjectureLimit(terms([explicit('(1 + 1/n)^n', 1)], 400).values, 1);
    expect(l.kind === 'converges' && Math.abs(l.limit - Math.E) < 5e-3).toBe(true);
  });

  it('points fixes et stabilité, sans confondre un pôle avec un point fixe', () => {
    const p = new SequenceProgram([recursive('1 + 1/u', ['1'])]);
    const fixed = fixedPoints(p.mapOf('u')!, -3, 3);
    expect(fixed.map((f) => f.x)).toEqual([-0.618033988750, 1.61803398875]);
    expect(Math.abs(fixed[1].slope)).toBeLessThan(1);
  });

  it('relation autonome requise pour la toile d\'araignée', () => {
    const p = new SequenceProgram([recursive('0,5u + 3', ['1']), recursive('v + n', ['0'], 0, 'v'), explicit('n', 0, 'w')]);
    expect(p.mapOf('u')?.(2)).toBe(4);
    expect(p.mapOf('v')).toBeNull();
    expect(p.mapOf('w')).toBeNull();
  });
});

describe('algorithme de seuil', () => {
  it('trouve le plus petit rang', () => {
    const p = new SequenceProgram([recursive('1,03u + 100', ['1000'])]);
    expect(p.threshold('u', '>', 5000)).toMatchObject({ n: 23 });
    expect(new SequenceProgram([recursive('u + 1/(n+1)', ['1'], 1)]).threshold('u', '>', 5)).toMatchObject({ n: 83 });
    expect(new SequenceProgram([recursive('0,5u + 3', ['1'])]).threshold('u', '>', 7, 1000)).toBeNull();
  });

  it('produit un programme Python fidèle', () => {
    const p = new SequenceProgram([recursive('a*u + 3', ['1'])], { a: 0.5 });
    const code = thresholdPython(p.seqs[0], '>', '5.9', p.P)!;
    expect(code).toContain('def seuil(A):');
    expect(code).toContain('    a = 0.5');
    expect(code).toContain('    while u <= A:');
    expect(code).toContain('        u = a * u + 3');
    expect(code).toContain('print(seuil(5.9))');
    const expl = new SequenceProgram([explicit('sqrt(n) + ln(n)', 1)]);
    const code2 = thresholdPython(expl.seqs[0], '>=', '10', expl.P)!;
    expect(code2).toContain('from math import *');
    expect(code2).toContain('while sqrt(n) + log(n) < A:');
  });
});

describe('état partagé', () => {
  it('tous les exemples se compilent sans erreur', () => {
    for (const ex of EXAMPLES) {
      const state = ex.make();
      expect(sanitizeState(JSON.parse(JSON.stringify(state)))).toEqual(state);
      const params = Object.fromEntries(Object.entries(state.params).map(([k, v]) => [k, v.value]));
      const p = new SequenceProgram(state.seqs, params);
      p.compute(state.N);
      for (const s of p.seqs) expect(s.error, `${ex.title} : ${s.def.name}`).toBeUndefined();
    }
  });

  it('rejette un état invalide', () => {
    expect(sanitizeState(null)).toBeNull();
    expect(sanitizeState({ v: 1, seqs: [{ name: 'z', kind: 'explicit', expr: 'n' }] })).toBeNull();
  });
});
