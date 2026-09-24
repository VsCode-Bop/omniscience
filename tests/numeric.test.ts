import { describe, expect, it } from 'vitest';
import { fmt, fmtPoint, fmtSI, parseSI } from '../src/core/math/format';
import { LUSolver } from '../src/core/math/linalg';
import { brentRoot, derivative, gamma, goldenMin, integrate, niceCeil, niceStep } from '../src/core/math/numeric';
import { decodeState, encodeState, parseHash } from '../src/core/url-state';

describe('analyse numérique', () => {
  it('trouve les racines par la méthode de Brent', () => {
    expect(brentRoot((x) => x * x - 2, 0, 2)).toBeCloseTo(Math.SQRT2, 12);
    expect(brentRoot(Math.cos, 0, 3)).toBeCloseTo(Math.PI / 2, 12);
    expect(brentRoot((x) => x * x + 1, -1, 1)).toBeNaN();
  });

  it('minimise par section dorée', () => {
    expect(goldenMin((x) => (x - 1.3) ** 2, -5, 5)).toBeCloseTo(1.3, 7);
  });

  it('dérive numériquement avec précision', () => {
    expect(derivative(Math.sin, 1)).toBeCloseTo(Math.cos(1), 9);
    expect(derivative((x) => x ** 3, 2)).toBeCloseTo(12, 8);
  });

  it('intègre par Simpson adaptatif', () => {
    expect(integrate(Math.sin, 0, Math.PI)).toBeCloseTo(2, 9);
    expect(integrate((x) => x * x, 0, 3)).toBeCloseTo(9, 10);
    expect(integrate((x) => x, 2, 0)).toBeCloseTo(-2, 10);
    expect(integrate((x) => Math.sqrt(x), -1, 1)).toBeNaN();
  });

  it('prolonge la factorielle par Gamma', () => {
    expect(gamma(6)).toBe(120);
    expect(gamma(0.5)).toBeCloseTo(Math.sqrt(Math.PI), 12);
    expect(gamma(4.5)).toBeCloseTo(11.631728396567448, 10);
    expect(gamma(-0.5)).toBeCloseTo(-2 * Math.sqrt(Math.PI), 11);
    expect(gamma(-2)).toBeNaN();
  });

  it('choisit des pas de graduation « ronds »', () => {
    expect(niceStep(0.13)).toBe(0.1);
    expect(niceStep(2.7)).toBe(2);
    expect(niceStep(4)).toBe(5);
    expect(niceStep(80)).toBe(100);
    expect(niceCeil(1.3)).toBe(2);
    expect(niceCeil(2)).toBe(2);
    expect(niceCeil(0.0031)).toBe(0.005);
    expect(niceCeil(6)).toBe(10);
  });
});

describe('algèbre linéaire', () => {
  it('résout un système par LU avec pivot partiel', () => {
    const lu = new LUSolver(3);
    // Premier pivot nul : le pivot partiel est indispensable.
    const A = new Float64Array([0, 2, 1, 1, 1, 1, 2, 1, 3]);
    expect(lu.factor(A)).toBe(true);
    const x = lu.solve(new Float64Array([7, 6, 13]));
    expect([...x].map((v) => Math.round(v * 1e10) / 1e10)).toEqual([1, 2, 3]);
  });

  it('détecte une matrice singulière', () => {
    const lu = new LUSolver(2);
    expect(lu.factor(new Float64Array([1, 2, 2, 4]))).toBe(false);
  });
});

describe('formatage à la française', () => {
  it('utilise la virgule décimale et le signe moins typographique', () => {
    expect(fmt(2.5)).toBe('2,5');
    expect(fmt(-0.125)).toBe('−0,125');
    expect(fmt(1 / 3)).toBe('0,3333');
    expect(fmt(1.5e-7)).toBe('1,5 × 10⁻⁷');
    expect(fmt(Infinity)).toBe('+∞');
    expect(fmtPoint(1, -2)).toBe('(1 ; −2)');
  });

  it('affiche les grandeurs avec préfixes SI', () => {
    expect(fmtSI(0.0123, 'A')).toBe('12,3 mA');
    expect(fmtSI(4700, 'Ω')).toBe('4,7 kΩ');
    expect(fmtSI(2.2e-6, 'F')).toBe('2,2 µF');
    expect(fmtSI(0, 'V')).toBe('0 V');
  });

  it('lit les valeurs saisies avec préfixes et virgule', () => {
    expect(parseSI('4,7k')).toBe(4700);
    expect(parseSI('100 µF')).toBeCloseTo(1e-4, 15);
    expect(parseSI('2.2m')).toBeCloseTo(0.0022, 15);
    expect(parseSI('12 V')).toBe(12);
    expect(parseSI('abc')).toBeNaN();
  });
});

describe("liens d'état", () => {
  it('encode et décode un état dans le fragment', () => {
    const state = { rows: [{ src: 'f(x) = x^2 + 1' }], view: [-5, 5, -3, 3] };
    const encoded = encodeState(state);
    expect(encoded).toMatch(/^[A-Za-z0-9+\-$]+$/);
    expect(decodeState(encoded)).toEqual(state);
    expect(parseHash(`#/grapheuse?s=${encoded}`)).toEqual({ moduleId: 'grapheuse', state: encoded });
    expect(decodeState('%%%corrompu')).toBeNull();
  });
});
