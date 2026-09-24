import { describe, expect, it } from 'vitest';
import { energies, simulate, stateAt, type LaunchParams } from '../src/modules/mechanics/physics';

const base: LaunchParams = { v0: 20, angle: 45, h: 0, m: 1, g: 9.81, drag: 'none', k: 0 };

describe('projectile sans frottements', () => {
  it('portée, durée et flèche exactes', () => {
    const tr = simulate(base);
    expect(tr.landed).toBe(true);
    expect(tr.range).toBeCloseTo((20 * 20) / 9.81, 4); // v0² sin(2α) / g
    expect(tr.T).toBeCloseTo((2 * 20 * Math.SQRT1_2) / 9.81, 5);
    expect(tr.apex.y).toBeCloseTo((20 * 20 * 0.5) / (2 * 9.81), 8);
    expect(tr.impactSpeed).toBeCloseTo(20, 4);
    expect(tr.impactAngle).toBeCloseTo(45, 3);
  });

  it('portée maximale à 45° (même hauteur)', () => {
    const ranges = [30, 40, 45, 50, 60].map((angle) => simulate({ ...base, angle }).range);
    expect(Math.max(...ranges)).toBe(ranges[2]);
    expect(ranges[0]).toBeCloseTo(ranges[4], 3); // angles complémentaires
  });

  it('tir depuis une hauteur et chute libre', () => {
    const tr = simulate({ ...base, v0: 0, angle: 0, h: 20 });
    expect(tr.T).toBeCloseTo(Math.sqrt((2 * 20) / 9.81), 5);
    expect(tr.range).toBeCloseTo(0, 10);
  });

  it('énergie mécanique conservée', () => {
    const tr = simulate({ ...base, h: 5, m: 0.5 });
    const em0 = energies(tr.params, tr.samples[0]).em;
    for (const t of [0.3, 1, 2, tr.T]) expect(energies(tr.params, stateAt(tr, t)).em).toBeCloseTo(em0, 6);
  });
});

describe('frottements', () => {
  it('frottement linéaire : solution analytique', () => {
    const p: LaunchParams = { ...base, drag: 'linear', k: 0.2, m: 1 };
    const tr = simulate(p);
    const tau = p.m / p.k;
    const vx0 = 20 * Math.SQRT1_2;
    const vy0 = vx0;
    const t = 1.2;
    const s = stateAt(tr, t);
    expect(s.x).toBeCloseTo(vx0 * tau * (1 - Math.exp(-t / tau)), 4);
    const vLim = p.g * tau;
    expect(s.y).toBeCloseTo((vy0 + vLim) * tau * (1 - Math.exp(-t / tau)) - vLim * t, 4);
  });

  it('les frottements réduisent la portée et dissipent l\'énergie', () => {
    const free = simulate(base);
    const drag = simulate({ ...base, drag: 'quadratic', k: 0.01 });
    expect(drag.range).toBeLessThan(free.range);
    const e0 = energies(drag.params, drag.samples[0]).em;
    expect(energies(drag.params, drag.samples[drag.samples.length - 1]).em).toBeLessThan(e0);
    // Avec frottements, la portée maximale est obtenue pour un angle inférieur à 45°.
    const r40 = simulate({ ...base, v0: 40, angle: 40, drag: 'quadratic', k: 0.02 }).range;
    const r45 = simulate({ ...base, v0: 40, angle: 45, drag: 'quadratic', k: 0.02 }).range;
    expect(r40).toBeGreaterThan(r45);
  });
});
