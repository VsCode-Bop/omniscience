import { describe, expect, it } from 'vitest';
import { Calculator, preprocess, type CalcResult } from '../src/modules/calculator/engine';
import { identify, Q, quadraticRoots, factorRational, numericRoots } from '../src/modules/calculator/exact';

const run = (input: string, c = new Calculator()) => c.run(input);
const exact = (r: CalcResult) => (r.kind === 'value' ? r.exact?.text : undefined);
const text = (r: CalcResult) => (r.kind === 'symbolic' || r.kind === 'assign' ? r.text : r.kind === 'value' ? r.approx : r.message);
const tex = (r: CalcResult) => (r.kind === 'symbolic' || r.kind === 'assign' ? r.tex : r.kind === 'value' ? r.exact?.tex : '');

describe('saisie à la française', () => {
  it('virgule décimale, point-virgule, flèche d\'affectation', () => {
    expect(preprocess('2,5 + 1')).toBe('2.5 + 1');
    expect(preprocess('pgcd(84;36)')).toBe('pgcd(84,36)');
    expect(preprocess('[[1,2],[3,4]]')).toBe('[[1,2],[3,4]]');
    expect(preprocess('3 → a')).toBe('a = 3');
    expect(preprocess('√2 × π')).toBe('sqrt(2) * pi');
  });

  it('ln népérien, log décimal', () => {
    expect(exact(run('ln(e^3)'))).toBe('3');
    expect(exact(run('log(1000)'))).toBe('3');
  });
});

describe('calcul exact', () => {
  it('fractions exactes, grands entiers', () => {
    expect(exact(run('1/3 + 1/6'))).toBe('1/2');
    expect(exact(run('0,1 + 0,2'))).toBe('3/10');
    expect(exact(run('2^100'))).toBe('1267650600228229401496703205376');
    expect(exact(run('(2/3)^-2'))).toBe('9/4');
  });

  it('radicaux et π reconnus (vérifiés à 64 chiffres)', () => {
    expect(exact(run('sqrt(8)'))).toBe('2√2');
    expect(exact(run('sqrt(2)/2 + 1/sqrt(2)'))).toBe('√2');
    expect(exact(run('cos(pi/6)'))).toBe('√3/2');
    expect(exact(run('(1+sqrt(5))/2'))).toBe('(1 + √5)/2');
    expect(exact(run('2*pi/3 + pi/3'))).toBe('π');
    expect(exact(run('sin(1)'))).toBeUndefined();
  });

  it('pas de fausse reconnaissance pour une saisie décimale', () => {
    expect(exact(run('0.333333 * 3'))).toBe('999999/1000000');
  });

  it('variables, fonctions et ans', () => {
    const c = new Calculator();
    run('a = 5', c);
    expect(exact(run('a^2 + 1', c))).toBe('26');
    run('f(x) = x^2 + 1', c);
    expect(exact(run('f(3)', c))).toBe('10');
    expect(exact(run('ans * 2', c))).toBe('20');
    expect(c.variables().map((v) => v.name)).toEqual(['a', 'f']);
  });

  it('unités, complexes, matrices exactes', () => {
    expect(text(run('36 km/h to m/s'))).toBe('10 m/s');
    expect(text(run('(1+2i)*(3-i)'))).toBe('5 + 5i');
    expect(tex(run('[[1,2],[3,4]]^-1'))).toBe('\\begin{pmatrix}-2&1\\\\\\frac{3}{2}&-\\frac{1}{2}\\end{pmatrix}');
    expect(tex(run('[[1,1],[1,0]]^10'))).toBe('\\begin{pmatrix}89&55\\\\55&34\\end{pmatrix}');
  });

  it('erreurs en français', () => {
    expect(run('2 +').kind).toBe('error');
    expect(text(run('2 +'))).toBe('expression incomplète');
    expect(text(run('toto(3)'))).toMatch(/fonction inconnue/);
  });

  it('les expressions ne peuvent pas évaluer de texte ni importer', () => {
    expect(run('evaluate("2+2")').kind).toBe('error');
    expect(run('import({a: 1})').kind).toBe('error');
  });
});

describe('calcul formel', () => {
  it('développer et réduire', () => {
    expect(tex(run('developper((x+1)^2*(x-3))'))).toBe('x^{3}-x^{2}-5x-3');
    expect(tex(run('x^2 + 2x + x'))).toBe('x^{2}+3x');
  });

  it('factoriser', () => {
    expect(tex(run('factoriser(x^2 - 5x + 6)'))).toBe('\\left(x-2\\right)\\left(x-3\\right)');
    expect(tex(run('factoriser(2x^2 - 2)'))).toBe('2\\left(x+1\\right)\\left(x-1\\right)');
    expect(tex(run('factoriser(x^2 - 2)'))).toBe('\\left(x+\\sqrt{2}\\right)\\left(x-\\sqrt{2}\\right)');
    expect(tex(run('factoriser(x^3 - x)'))).toBe('x\\left(x+1\\right)\\left(x-1\\right)');
    expect(tex(run('factoriser(360)'))).toBe('2^{3}\\times 3^{2}\\times 5');
  });

  it('dériver (ln népérien)', () => {
    expect(tex(run('deriver(ln(x)/x)'))).toBe('\\frac{1-\\ln\\left( x\\right)}{{ x}^{2}}');
  });

  it('résoudre : solutions exactes avec radicaux', () => {
    expect(tex(run('resoudre(x^2 - 5x + 6 = 0)'))).toBe('\\mathcal{S}=\\left\\{2\\,;\\,3\\right\\}');
    expect(tex(run('résoudre(x^2 - x - 1 = 0)'))).toBe('\\mathcal{S}=\\left\\{\\frac{1 - \\sqrt{5}}{2}\\,;\\,\\frac{1 + \\sqrt{5}}{2}\\right\\}');
    expect(tex(run('resoudre(x^2 + 1 = 0)'))).toBe('\\mathcal{S}=\\varnothing');
    expect(text(run('resoudre(cos(x) = x)'))).toBe('S ≈ { 0,7390851332 }');
  });

  it('primitive et intégrale', () => {
    expect(tex(run('primitive(3x^2 + 2x)'))).toBe('x^{3}+x^{2}+C');
    expect(exact(run('integrale(x^2; 0; 3)'))).toBe('9');
    const r = run('integrale(sin(x); 0; pi)');
    expect(r.kind === 'value' && Math.abs(Number(r.approx.replace(',', '.')) - 2) < 1e-9).toBe(true);
  });
});

describe('outils exacts', () => {
  it('reconnaissance directe', () => {
    const check = (v: number) => (expr: string) => Math.abs(Function(`return ${expr.replace(/sqrt/g, 'Math.sqrt').replace(/pi/g, 'Math.PI')}`)() - v) < 1e-12;
    expect(identify({ value: 0.75, check: check(0.75) })?.text).toBe('3/4');
    // Un contrôle en double précision accepterait une fraction proche : le moteur vérifie à 64 chiffres.
    const strict = (expr: string) => expr.includes('sqrt') && check(Math.sqrt(12))(expr);
    expect(identify({ value: Math.sqrt(12), check: strict })?.text).toBe('2√3');
  });

  it('trinôme et racines rationnelles', () => {
    expect(quadraticRoots(new Q(0n), new Q(-2n)).roots.map((r) => r.text)).toEqual(['−√2', '√2']);
    const f = factorRational([new Q(-6n), new Q(11n), new Q(-6n), new Q(1n)]); // (x−1)(x−2)(x−3)
    expect(f.roots.map(([r]) => r.toNumber())).toEqual([1, 2, 3]);
    expect(numericRoots([new Q(-2n), new Q(0n), new Q(0n), new Q(1n)])[0]).toBeCloseTo(Math.cbrt(2), 10);
  });
});
