import { describe, expect, it } from 'vitest';
import { determinant, Fraction, inverse, mul, power, rref, solve, transpose, type Matrix } from '../src/modules/arithmetic/matrix';
import {
  divisorCount, divisors, divisorSum, divmod, euclidSteps, extendedEuclid, factorize, factorText, fmtBig, gcd, isPrime, lcm, modPow, parseBigInt, sieve,
} from '../src/modules/arithmetic/numbers';

const M = (rows: (number | string)[][]): Matrix => rows.map((r) => r.map((x) => Fraction.parse(String(x))!));
const S = (m: Matrix) => m.map((r) => r.map((x) => x.toString()));

describe('arithmétique', () => {
  it('division euclidienne, PGCD, PPCM', () => {
    expect(divmod(-7n, 3n)).toEqual([-3n, 2n]);
    expect(gcd(84n, 36n)).toBe(12n);
    expect(lcm(84n, 36n)).toBe(252n);
    const steps = euclidSteps(84n, 36n);
    expect(steps.map((s) => [s.a, s.b, s.q, s.r])).toEqual([[84n, 36n, 2n, 12n], [36n, 12n, 3n, 0n]]);
  });

  it('Bézout', () => {
    const { d, u, v } = extendedEuclid(240n, 46n);
    expect(d).toBe(2n);
    expect(240n * u + 46n * v).toBe(2n);
  });

  it('primalité et décomposition', () => {
    expect([2n, 3n, 97n, 7919n, 2147483647n].every(isPrime)).toBe(true);
    expect([1n, 0n, 91n, 561n, 3215031751n].some(isPrime)).toBe(false);
    expect(factorize(360n)).toEqual([[2n, 3], [3n, 2], [5n, 1]]);
    expect(factorText(factorize(360n))).toBe('2³ × 3² × 5');
    // Grand nombre : rho de Pollard (1 000 000 007 × 998 244 353)
    expect(factorize(998244353n * 1000000007n)).toEqual([[998244353n, 1], [1000000007n, 1]]);
    const f = factorize(2n ** 61n - 1n);
    expect(f).toEqual([[2n ** 61n - 1n, 1]]);
  });

  it('diviseurs', () => {
    const f = factorize(28n);
    expect(divisors(f)).toEqual([1n, 2n, 4n, 7n, 14n, 28n]);
    expect(divisorCount(f)).toBe(6n);
    expect(divisorSum(f)).toBe(56n); // 28 est parfait
  });

  it('crible et puissances modulaires', () => {
    const spf = sieve(30);
    const primes = [...spf].map((p, i) => (p === i ? i : 0)).filter(Boolean);
    expect(primes).toEqual([2, 3, 5, 7, 11, 13, 17, 19, 23, 29]);
    expect(modPow(3n, 200n, 13n)).toBe(9n);
  });

  it('saisie et affichage', () => {
    expect(parseBigInt(' 12 345 ')).toBe(12345n);
    expect(parseBigInt('1,5')).toBeNull();
    expect(fmtBig(1234567n)).toBe('1 234 567');
    expect(fmtBig(-1234n)).toBe('−1234');
  });
});

describe('matrices exactes', () => {
  it('fractions', () => {
    expect(Fraction.parse('0,25')!.toString()).toBe('1/4');
    expect(Fraction.parse('-6/8')!.toString()).toBe('−3/4');
    expect(Fraction.parse('1.5e2')!.toString()).toBe('150');
    expect(Fraction.parse('abc')).toBeNull();
    expect(Fraction.parse('1/0')).toBeNull();
  });

  it('produit, transposée, puissance', () => {
    const A = M([[1, 2], [3, 4]]);
    expect(S(mul(A, M([[0, 1], [1, 0]])))).toEqual([['2', '1'], ['4', '3']]);
    expect(S(transpose(M([[1, 2, 3]])))).toEqual([['1'], ['2'], ['3']]);
    expect(S(power(M([[1, 1], [1, 0]]), 10))).toEqual([['89', '55'], ['55', '34']]);
  });

  it('déterminant et inverse en fractions', () => {
    const A = M([[2, 1], [5, 3]]);
    expect(determinant(A).toString()).toBe('1');
    expect(S(inverse(A).result)).toEqual([['3', '−1'], ['−5', '2']]);
    const B = M([[1, 2, 3], [0, 1, 4], [5, 6, 0]]);
    expect(determinant(B).toString()).toBe('1');
    expect(S(inverse(B).result)).toEqual([['−24', '18', '5'], ['20', '−15', '−4'], ['−5', '4', '1']]);
    const C = M([[2, 3], [1, 4]]);
    expect(S(inverse(C).result)).toEqual([['4/5', '−3/5'], ['−1/5', '2/5']]);
    expect(() => inverse(M([[1, 2], [2, 4]]))).toThrow(/non inversible/);
  });

  it('pivot de Gauss : rang et étapes', () => {
    const { rank, steps } = rref(M([[1, 2, 3], [2, 4, 6], [1, 0, 1]]));
    expect(rank).toBe(2);
    expect(steps[0].ops[0]).toMatch(/^L₂ ← L₂ − 2L₁$/);
  });

  it('systèmes linéaires', () => {
    const unique = solve(M([[2, 1], [1, -1]]), [Fraction.parse('5')!, Fraction.parse('1')!]).solution;
    expect(unique.kind === 'unique' && unique.x.map(String)).toEqual(['2', '1']);
    expect(solve(M([[1, 1], [1, 1]]), [Fraction.ONE, Fraction.of(2)]).solution.kind).toBe('none');
    expect(solve(M([[1, 1], [2, 2]]), [Fraction.ONE, Fraction.of(2)]).solution.kind).toBe('infinite');
  });
});
