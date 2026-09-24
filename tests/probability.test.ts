import { describe, expect, it } from 'vitest';
import { binomialCoefficient, evaluate, lawSpec, LAWS, logGamma, normalCdf, normalQuantile } from '../src/modules/probability/distributions';
import { histogram, linearRegression, parsePairs, parseSeries, Random, summarize } from '../src/modules/probability/stats';

const law = (id: Parameters<typeof lawSpec>[0], p: Record<string, number>) => lawSpec(id).make(p);

describe('fonctions spéciales', () => {
  it('ln Γ et coefficients binomiaux', () => {
    expect(logGamma(5)).toBeCloseTo(Math.log(24), 12);
    expect(logGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 12);
    expect(binomialCoefficient(10, 3)).toBe(120);
    expect(binomialCoefficient(52, 5)).toBe(2598960);
    expect(binomialCoefficient(5, 7)).toBe(0);
  });

  it('loi normale centrée réduite', () => {
    expect(normalCdf(0)).toBe(0.5);
    expect(normalCdf(1.96)).toBeCloseTo(0.9750021048517795, 13);
    expect(normalCdf(1)).toBeCloseTo(0.8413447460685429, 13);
    expect(normalCdf(-3)).toBeCloseTo(0.0013498980316301, 14);
    expect(normalQuantile(0.975)).toBeCloseTo(1.959963984540054, 10);
    expect(normalQuantile(0.05)).toBeCloseTo(-1.6448536269514729, 10);
    for (const p of [1e-6, 0.01, 0.3, 0.5, 0.9, 0.999]) expect(normalCdf(normalQuantile(p))).toBeCloseTo(p, 12);
  });
});

describe('lois', () => {
  it('chaque loi : masse totale 1, espérance et variance cohérentes', () => {
    for (const spec of LAWS) {
      const L = spec.make(spec.defaults);
      if (spec.discrete) {
        let m = 0;
        let e = 0;
        let v = 0;
        for (let k = L.range[0] - 5; k <= L.range[1] + 200; k++) m += L.pdf(k);
        for (let k = L.range[0] - 5; k <= L.range[1] + 200; k++) e += k * L.pdf(k);
        for (let k = L.range[0] - 5; k <= L.range[1] + 200; k++) v += (k - e) ** 2 * L.pdf(k);
        expect(m, spec.name).toBeCloseTo(1, 6);
        expect(e, spec.name).toBeCloseTo(L.mean, 5);
        expect(v, spec.name).toBeCloseTo(L.variance, 4);
      } else {
        expect(L.cdf(L.range[1]) - L.cdf(L.range[0]), spec.name).toBeGreaterThan(0.99);
      }
    }
  });

  it('binomiale B(20 ; 0,3)', () => {
    const B = law('binomial', { n: 20, p: 0.3 });
    expect(B.pdf(6)).toBeCloseTo(0.19163898275344238, 12);
    expect(B.cdf(5)).toBeCloseTo(0.41637082, 7);
    expect(evaluate(B, { kind: 'between', a: 4, b: 8 }).value).toBeCloseTo(B.cdf(8) - B.cdf(3), 12);
    expect(evaluate(B, { kind: 'ge', a: 10 }).value).toBeCloseTo(1 - B.cdf(9), 12);
    // Plus petit k tel que P(X ≤ k) ≥ 0,95
    const k = evaluate(B, { kind: 'quantile', alpha: 0.95 }).bounds![0];
    expect(B.cdf(k)).toBeGreaterThanOrEqual(0.95);
    expect(B.cdf(k - 1)).toBeLessThan(0.95);
  });

  it('intervalle de fluctuation d\'une binomiale', () => {
    const B = law('binomial', { n: 100, p: 0.5 });
    const r = evaluate(B, { kind: 'interval', level: 0.95 });
    expect(r.bounds).toEqual([40, 60]);
    expect(r.value).toBeGreaterThanOrEqual(0.95);
  });

  it('normale : P(μ − 2σ ≤ X ≤ μ + 2σ) ≈ 0,954', () => {
    const N = law('normal', { mu: 10, sigma: 2 });
    expect(evaluate(N, { kind: 'between', a: 6, b: 14 }).value).toBeCloseTo(0.9544997361036416, 12);
    const I = evaluate(N, { kind: 'interval', level: 0.95 }).bounds!;
    expect(I[0]).toBeCloseTo(10 - 2 * 1.959963984540054, 9);
  });

  it('géométrique, Poisson, exponentielle', () => {
    const G = law('geometric', { p: 0.2 });
    expect(G.pdf(3)).toBeCloseTo(0.8 * 0.8 * 0.2, 14);
    expect(G.cdf(3)).toBeCloseTo(1 - 0.8 ** 3, 14);
    expect(G.quantile(0.5)).toBe(4);
    const P = law('poisson', { lambda: 4 });
    expect(P.pdf(2)).toBeCloseTo(Math.exp(-4) * 8, 14);
    const E = law('exponential', { lambda: 0.5 });
    expect(E.cdf(2)).toBeCloseTo(1 - Math.exp(-1), 14);
    expect(E.quantile(0.5)).toBeCloseTo(2 * Math.LN2, 14);
  });
});

describe('statistiques descriptives', () => {
  it('lecture des saisies', () => {
    expect(parseSeries('12 15 ; 14,5\n8').series).toEqual({ values: [8, 12, 14.5, 15], counts: [1, 1, 1, 1] });
    expect(parseSeries('10 ; 3\n12 ; 5\n15 ; 2').series).toEqual({ values: [10, 12, 15], counts: [3, 5, 2] });
    expect(parseSeries('1 2 x 3').errors).toBe(1);
  });

  it('indicateurs (conventions du lycée)', () => {
    const s = summarize(parseSeries('2 4 4 5 7 8 9 10 12 15').series)!;
    expect(s.n).toBe(10);
    expect(s.mean).toBeCloseTo(7.6, 12);
    expect(s.median).toBe(7.5);
    expect(s.q1).toBe(4); // rang ⌈10/4⌉ = 3
    expect(s.q3).toBe(10); // rang ⌈30/4⌉ = 8
    expect(s.variance).toBeCloseTo(14.64, 10);
    expect(s.modes).toEqual([4]);
    const w = summarize(parseSeries('10 ; 3\n12 ; 5\n15 ; 2').series)!;
    expect(w.mean).toBeCloseTo(12, 12);
    expect(w.median).toBe(12);
  });

  it('histogramme : chaque valeur dans une classe', () => {
    const series = parseSeries('0 1 2 3 4 5 6 7 8 9 10').series;
    const h = histogram(series, undefined, 0, 5);
    expect(h.edges).toEqual([0, 5, 10, 15]);
    expect(h.counts).toEqual([5, 5, 1]);
  });

  it('régression linéaire', () => {
    const { xs, ys } = parsePairs('1 ; 3\n2 ; 5\n3 ; 7,1\n4 ; 8,9');
    const r = linearRegression(xs, ys)!;
    expect(r.a).toBeCloseTo(1.98, 10);
    expect(r.b).toBeCloseTo(1.05, 10);
    expect(r.r).toBeGreaterThan(0.99);
  });
});

describe('hasard', () => {
  it('générateur reproductible et uniforme', () => {
    const a = new Random(42);
    const b = new Random(42);
    expect(a.next()).toBe(b.next());
    const r = new Random(7);
    const counts = [0, 0, 0, 0, 0, 0];
    const cum = [1, 2, 3, 4, 5, 6];
    for (let i = 0; i < 60000; i++) counts[r.pick(cum)]++;
    for (const c of counts) expect(Math.abs(c - 10000)).toBeLessThan(400);
  });
});
