import { describe, expect, it } from 'vitest';
import { cauchy, conjugate, criticalAngle, fresnel, GLASSES, imageOfInfinity, refract, snell, tracePrism, traceRay, vergence, wavelengthColor } from '../src/modules/optics/optics';

describe('lentilles minces', () => {
  it('relation de conjugaison et grandissement', () => {
    const c = conjugate({ x: 0, f: 10 }, -30, 2);
    expect(c.oaPrime).toBeCloseTo(15, 12);
    expect(c.gamma).toBeCloseTo(-0.5, 12);
    expect(c.h).toBeCloseTo(-1, 12);
    expect(c.real).toBe(true);
  });

  it('loupe : image virtuelle, droite, agrandie', () => {
    const c = conjugate({ x: 0, f: 10 }, -5, 1);
    expect(c.oaPrime).toBeCloseTo(-10, 12);
    expect(c.gamma).toBeCloseTo(2, 12);
    expect(c.real).toBe(false);
  });

  it('objet au foyer objet : image à l\'infini', () => {
    expect(conjugate({ x: 0, f: 10 }, -10, 1).atInfinity).toBe(true);
  });

  it('lentille divergente : image virtuelle réduite', () => {
    const c = conjugate({ x: 0, f: -10 }, -20, 3);
    expect(c.oaPrime).toBeCloseTo(-20 / 3, 12);
    expect(c.real).toBe(false);
    expect(c.gamma).toBeCloseTo(1 / 3, 12);
  });

  it('les rayons tracés passent par l\'image (paraxial)', () => {
    const lens = { x: 0, f: 10 };
    const img = conjugate(lens, -30, 2);
    for (const s of [0, 0.05, -0.1, 0.2]) {
      const { segments } = traceRay({ x0: -30, y0: 2, s }, [lens], 100);
      const out = segments[segments.length - 1];
      expect(out.y0 + out.s * (img.x - out.x0)).toBeCloseTo(img.h, 10);
    }
  });

  it('lunette afocale : rayons parallèles en sortie', () => {
    const lenses = [{ x: 0, f: 40 }, { x: 50, f: 10 }];
    const a = traceRay({ x0: -20, y0: 1, s: 0.05 }, lenses, 200).segments.at(-1)!;
    const b = traceRay({ x0: -20, y0: -2, s: 0.05 }, lenses, 200).segments.at(-1)!;
    expect(a.s).toBeCloseTo(b.s, 12);
    expect(a.s / 0.05).toBeCloseTo(-4, 10); // grossissement −f1/f2
    expect(imageOfInfinity({ x: 0, f: 40 }, 0.05).x).toBe(40);
  });

  it('vergence', () => {
    expect(vergence(25)).toBe(4);
  });
});

describe('réfraction', () => {
  it('loi de Snell-Descartes et réflexion totale', () => {
    expect(snell(30, 1, 1.5)).toBeCloseTo((Math.asin(1 / 3) * 180) / Math.PI, 10);
    expect(snell(60, 1.5, 1)).toBeNull();
    expect(criticalAngle(1.5, 1)).toBeCloseTo(41.8103148958, 8);
    expect(criticalAngle(1, 1.5)).toBeNull();
  });

  it('réfraction vectorielle cohérente avec la loi scalaire', () => {
    const i = (40 * Math.PI) / 180;
    const t = refract([Math.sin(i), -Math.cos(i)], [0, 1], 1, 1.33)!;
    const r = (Math.asin(t[0]) * 180) / Math.PI;
    expect(r).toBeCloseTo(snell(40, 1, 1.33)!, 10);
    expect(Math.hypot(t[0], t[1])).toBeCloseTo(1, 12);
  });

  it('Fresnel : ≈ 4 % en incidence normale air/verre, 100 % en réflexion totale', () => {
    expect(fresnel(0, 1, 1.5)).toBeCloseTo(0.04, 6);
    expect(fresnel(60, 1.5, 1)).toBe(1);
  });
});

describe('prisme', () => {
  it('relations du prisme : A = r + r′ et D = i + i′ − A', () => {
    const n = 1.5;
    const p = tracePrism(60, 10, 4, 50, n, 589, 20);
    expect(p.r + p.r2).toBeCloseTo(60, 8);
    expect(p.deviation!).toBeCloseTo(p.i + p.i2! - 60, 8);
    expect(Math.sin((p.i * Math.PI) / 180)).toBeCloseTo(n * Math.sin((p.r * Math.PI) / 180), 10);
  });

  it('minimum de déviation au passage symétrique', () => {
    const n = 1.5;
    const iMin = (Math.asin(n * Math.sin(Math.PI / 6)) * 180) / Math.PI;
    const dMin = tracePrism(60, 10, 4, iMin, n, 589, 20).deviation!;
    expect(dMin).toBeCloseTo(2 * iMin - 60, 8);
    for (const di of [-5, 5]) expect(tracePrism(60, 10, 4, iMin + di, n, 589, 20).deviation!).toBeGreaterThan(dMin);
  });

  it('dispersion : le violet est plus dévié que le rouge', () => {
    const g = GLASSES.crown;
    expect(cauchy(g, 400)).toBeGreaterThan(cauchy(g, 700));
    const violet = tracePrism(60, 10, 4, 50, cauchy(g, 400), 400, 20).deviation!;
    const red = tracePrism(60, 10, 4, 50, cauchy(g, 700), 700, 20).deviation!;
    expect(violet).toBeGreaterThan(red);
    expect(wavelengthColor(650)).toMatch(/^rgb\(255, 0, 0\)|^rgb\(2\d\d, 0, 0\)/);
  });
});
