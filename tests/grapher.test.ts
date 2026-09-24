import { describe, expect, it } from 'vitest';
import { findExtrema, findIntersections, findRoots, findSingularities, limitAt, limitAtInfinity } from '../src/modules/grapher/analysis';
import { classify, Program } from '../src/modules/grapher/expr';
import { sampleCartesian, sampleParametric } from '../src/modules/grapher/sampling';
import { piLabel, piTicks } from '../src/modules/grapher/ticks';
import { Viewport } from '../src/modules/grapher/viewport';

const program = (...srcs: string[]) => new Program(srcs.map((src, i) => ({ id: String(i), src })));

describe('classification des lignes', () => {
  it('reconnaît les différentes formes', () => {
    expect(classify('f(x) = x^2')).toMatchObject({ shape: 'define', name: 'f', arg: 'x' });
    expect(classify('a = 2')).toMatchObject({ shape: 'define', name: 'a' });
    expect(classify('(cos(t), sin(t))')).toMatchObject({ shape: 'tuple' });
    expect(classify('(x+1)*(x-1)')).toMatchObject({ shape: 'plain' });
    expect(classify('  ')).toEqual({ shape: 'empty' });
  });
});

describe('compilation des expressions', () => {
  it('compile une fonction nommée et sa dérivée formelle', () => {
    const p = program('f(x) = x^3 - 3x');
    const [f] = p.rows;
    expect(f.kind).toBe('function');
    expect(f.fn!(2)).toBe(2);
    expect(f.dfn!(2)).toBe(9);
    expect(f.derivTex).toContain('x');
  });

  it('gère les produits implicites et les curseurs', () => {
    const p = program('f(x) = ax^2 + bx + c', 'a = 2', 'b = -1', 'c = 3');
    const [f, a] = p.rows;
    expect(f.error).toBeUndefined();
    expect(f.missing).toEqual([]);
    expect(a.kind).toBe('param');
    expect(f.fn!(2)).toBe(2 * 4 - 2 + 3);
    p.setParam('a', 0);
    expect(f.fn!(2)).toBe(1);
  });

  it('signale les paramètres non définis (création de curseurs)', () => {
    const p = program('y = kx + m');
    expect(p.rows[0].missing.sort()).toEqual(['k', 'm']);
    expect(p.rows[0].fn!(3)).toBe(4); // valeur provisoire 1
  });

  it('applique les conventions françaises ln / log', () => {
    const p = program('ln(e^2)', 'log(1000)', "f(x) = ln(x)", "g(x) = f'(x)");
    expect(p.rows[0].fn!(0)).toBeCloseTo(2, 12);
    expect(p.rows[1].fn!(0)).toBeCloseTo(3, 12);
    expect(p.rows[3].fn!(4)).toBeCloseTo(0.25, 10);
  });

  it('interprète x(x+1) comme un produit', () => {
    expect(program('x(x+1)').rows[0].fn!(3)).toBe(12);
  });

  it('compose les fonctions utilisateur', () => {
    const p = program('f(x) = x + 1', 'g(x) = f(x)^2', "h(x) = g'(x)");
    expect(p.rows[1].fn!(2)).toBe(9);
    expect(p.rows[1].dfn!(2)).toBeCloseTo(6, 10);
    expect(p.rows[2].fn!(2)).toBeCloseTo(6, 8);
  });

  it('détecte les définitions circulaires et les erreurs', () => {
    const p = program('f(x) = g(x)', 'g(x) = f(x)', 'x^', 'sinx(2)', 'pi = 3');
    expect(p.rows[0].error).toMatch(/circulaire/);
    expect(p.rows[1].error).toMatch(/circulaire/);
    expect(p.rows[2].error).toMatch(/Syntaxe/);
    expect(p.rows[3].error).toMatch(/inconnue/);
    expect(p.rows[4].error).toMatch(/réservé/);
  });

  it('reconnaît courbes polaires, paramétriques, points et droites verticales', () => {
    const p = program('r = 1 + cos(θ)', '(cos(t), sin(t))', 'A = (1, 2)', 'x = 3', 'k = 2a', 'a = 4');
    expect(p.rows.map((r) => r.kind)).toEqual(['polar', 'parametric', 'point', 'vline', 'constant', 'param']);
    expect(p.rows[0].fn!(0)).toBe(2);
    expect(p.rows[2].px!()).toBe(1);
    expect(p.P.k).toBe(8);
  });

  it("n'exécute aucun code arbitraire", () => {
    const p = program('constructor("return 1")()', 'f(x) = __proto__');
    for (const row of p.rows) expect(row.kind === 'error' || row.fn?.(1) !== undefined).toBe(true);
    expect(p.rows[0].kind).toBe('error');
  });
});

describe('analyse', () => {
  it('trouve racines, extremums et intersections', () => {
    const f = (x: number) => x * x - 2 * x - 3;
    expect(findRoots(f, -10, 10)).toEqual([-1, 3]);
    expect(findExtrema(f, -10, 10)).toEqual([{ x: 1, y: -4, kind: 'min' }]);
    expect(findRoots((x) => (x - 2) ** 2, -5, 5)).toEqual([2]);
    expect(findIntersections(Math.sin, Math.cos, 0, 3)[0]).toBeCloseTo(Math.PI / 4, 9);
  });

  it("ne prend pas une asymptote pour une racine", () => {
    expect(findRoots((x) => 1 / x, -5, 5)).toEqual([]);
    expect(findExtrema((x) => 1 / x, -5, 5)).toEqual([]);
  });

  it('estime les limites', () => {
    expect(limitAtInfinity((x) => (2 * x + 1) / (x - 3), 1)).toEqual({ kind: 'value', value: 2 });
    expect(limitAtInfinity(Math.exp, 1)).toEqual({ kind: '+inf' });
    expect(limitAtInfinity(Math.exp, -1)).toEqual({ kind: 'value', value: 0 });
    expect(limitAtInfinity(Math.log, 1)).toEqual({ kind: '+inf' });
    expect(limitAtInfinity(Math.sin, 1).kind).toBe('none');
    expect(limitAtInfinity(Math.sqrt, -1)).toEqual({ kind: 'undefined' });
    expect(limitAt((x) => 1 / x, 0, 1)).toEqual({ kind: '+inf' });
    expect(limitAt((x) => 1 / x, 0, -1)).toEqual({ kind: '-inf' });
    expect(limitAt((x) => Math.sin(x) / x, 0, 1)).toEqual({ kind: 'value', value: 1 });
  });

  it('localise asymptotes verticales et bords du domaine', () => {
    const s = findSingularities((x) => (x * x + 1) / (x - 1), -5, 5);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ x: 1, kind: 'asymptote', left: { kind: '-inf' }, right: { kind: '+inf' } });
    const ln = findSingularities(Math.log, -2, 5);
    expect(ln[0]).toMatchObject({ x: 0, kind: 'edge', right: { kind: '-inf' } });
  });
});

describe('échantillonnage', () => {
  const vp = new Viewport(-5, 5, -5, 5, 500, 500);

  it('coupe le tracé aux asymptotes', () => {
    const lines = sampleCartesian((x) => 1 / x, vp);
    expect(lines).toHaveLength(2);
  });

  it('coupe le tracé hors du domaine et atteint son bord', () => {
    const lines = sampleCartesian(Math.sqrt, vp);
    expect(lines).toHaveLength(1);
    expect(lines[0][0]).toBeCloseTo(vp.xToPx(0), 1);
  });

  it('trace un cercle paramétré fermé', () => {
    const lines = sampleParametric(Math.cos, Math.sin, 0, 2 * Math.PI, vp);
    expect(lines).toHaveLength(1);
    const l = lines[0];
    expect(Math.hypot(l[0] - l[l.length - 2], l[1] - l[l.length - 1])).toBeLessThan(0.01);
  });
});

describe('graduations', () => {
  it('écrit les multiples de π', () => {
    expect(piLabel(0, 2)).toBe('0');
    expect(piLabel(1, 2)).toBe('π/2');
    expect(piLabel(-2, 2)).toBe('−π');
    expect(piLabel(3, 4)).toBe('3π/4');
    const t = piTicks(-4, 4, 50);
    expect(t.major.map((m) => m.label)).toContain('π');
  });
});

describe('dérivée formelle', () => {
  it('présente la dérivée d\'un quotient sous la forme (u\'v − uv\')/v²', () => {
    const [f, g] = program('f(x) = (x^2 + 1)/(x - 1)', 'g(x) = (2x + 1)/(x - 3)').rows;
    const tex = f.derivTex!.replace(/\s/g, '');
    expect(tex).toContain('{x}^{2}-2\\,x-1');
    expect(tex).toContain('{\\left(x-1\\right)}^{2}');
    expect(f.dfn!(3)).toBeCloseTo((9 - 6 - 1) / 4, 12);
    expect(g.dfn!(0)).toBeCloseTo(-7 / 9, 12);
    expect(g.derivTex).toContain('-7');
  });

  it('découpe les produits implicites avant les puissances et fonctions', () => {
    const p = program('f(x) = 3xsin(x)', 'g(x) = ax^2', 'a = 2');
    expect(p.rows[0].fn!(1)).toBeCloseTo(3 * Math.sin(1), 12);
    expect(p.rows[1].fn!(3)).toBe(18);
  });
});
