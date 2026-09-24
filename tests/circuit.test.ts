import { describe, expect, it } from 'vitest';
import { defaultProps } from '../src/modules/circuit/model/catalog';
import type { ElementData, ElementType, PropValue } from '../src/modules/circuit/model/types';
import { Simulator, waveValue } from '../src/modules/circuit/solver/simulator';

let uid = 0;
function el(type: ElementType, x1: number, y1: number, x2: number, y2: number, props: Record<string, PropValue> = {}): ElementData {
  return { id: `e${++uid}`, type, x1, y1, x2, y2, props: { ...defaultProps(type), ...props } };
}

/** Boucle rectangulaire : générateur à gauche (a en bas = −), composants en haut. */
function simulate(elements: ElementData[], steps = 1, dt = 1e-5): Simulator {
  const sim = new Simulator(elements);
  sim.dt = dt;
  for (let i = 0; i < steps; i++) sim.step();
  return sim;
}

const I = (sim: Simulator, e: ElementData) => sim.states.get(e.id)!.i;
const U = (sim: Simulator, e: ElementData) => sim.states.get(e.id)!.v;

describe('circuits en courant continu', () => {
  it('vérifie la loi d\'Ohm avec ampèremètre et voltmètre', () => {
    const bat = el('battery', 0, 4, 0, 0, { E: 6 });
    const amm = el('ammeter', 0, 0, 4, 0);
    const res = el('resistor', 4, 0, 4, 4, { R: 100 });
    const back = el('wire', 4, 4, 0, 4);
    const volt = el('voltmeter', 4, 0, 8, 0);
    const volt2 = el('wire', 8, 0, 8, 4);
    const volt3 = el('wire', 8, 4, 4, 4);
    const sim = simulate([bat, amm, res, back, volt, volt2, volt3]);
    expect(sim.issues).toEqual([]);
    expect(I(sim, res)).toBeCloseTo(0.06, 9);
    expect(I(sim, amm)).toBeCloseTo(0.06, 9); // le courant entre par la borne A
    expect(I(sim, bat)).toBeCloseTo(0.06, 9); // débité par la borne +
    expect(U(sim, volt)).toBeCloseTo(6, 9);
    expect(I(sim, volt)).toBe(0);
  });

  it('respecte la loi des nœuds en dérivation', () => {
    const bat = el('battery', 0, 4, 0, 0, { E: 4.5 });
    const w1 = el('wire', 0, 0, 4, 0);
    const r1 = el('resistor', 4, 0, 4, 4, { R: 100 });
    const w2 = el('wire', 4, 0, 8, 0);
    const r2 = el('resistor', 8, 0, 8, 4, { R: 50 });
    const w3 = el('wire', 8, 4, 4, 4);
    const w4 = el('wire', 4, 4, 0, 4);
    const sim = simulate([bat, w1, r1, w2, r2, w3, w4]);
    expect(I(sim, r1)).toBeCloseTo(0.045, 9);
    expect(I(sim, r2)).toBeCloseTo(0.09, 9);
    expect(I(sim, w1)).toBeCloseTo(0.135, 9);
    expect(I(sim, w2)).toBeCloseTo(0.09, 9);
    // Somme des courants arrivant au nœud (4, 0) : nulle.
    const sum = sim.currentsAt(4, 0).reduce((s, c) => s + c.i, 0);
    expect(Math.abs(sum)).toBeLessThan(1e-12);
  });

  it('calcule un pont diviseur référencé à la masse', () => {
    const bat = el('battery', 0, 6, 0, 0, { E: 12 });
    const r1 = el('resistor', 0, 0, 4, 0, { R: 1000 });
    const r2 = el('resistor', 4, 0, 4, 6, { R: 2000 });
    const w = el('wire', 4, 6, 0, 6);
    const gnd = el('ground', 0, 6, 0, 6);
    const sim = simulate([bat, r1, r2, w, gnd]);
    expect(sim.pointVoltage(4, 0)).toBeCloseTo(8, 6);
    expect(sim.pointVoltage(0, 0)).toBeCloseTo(12, 6);
    expect(sim.pointVoltage(0, 6)).toBe(0);
  });

  it('prend en compte la résistance interne (U = E − rI)', () => {
    const bat = el('battery', 0, 4, 0, 0, { E: 9, r: 1 });
    const r = el('resistor', 0, 0, 4, 0, { R: 8 });
    const w = el('wire', 4, 0, 0, 4);
    const sim = simulate([bat, r, w]);
    expect(I(sim, r)).toBeCloseTo(1, 9);
    expect(-U(sim, bat)).toBeCloseTo(8, 9);
  });

  it('détecte le court-circuit d\'un générateur idéal', () => {
    const bat = el('battery', 0, 4, 0, 0);
    const w = el('wire', 0, 0, 0, 4);
    const sim = simulate([bat, w]);
    expect(sim.issues.map((i) => i.kind)).toContain('short');
  });

  it('met en évidence le court-circuit d\'une lampe', () => {
    const bat = el('battery', 0, 4, 0, 0, { E: 7 });
    const l1 = el('lamp', 0, 0, 4, 0, { U: 3.5, P: 0.7 });
    const l2 = el('lamp', 4, 0, 8, 0, { U: 3.5, P: 0.7 });
    const shunt = el('wire', 4, 0, 8, 0);
    const back = el('wire', 8, 0, 0, 4);
    const sim = simulate([bat, l1, l2, shunt, back]);
    expect(I(sim, l2)).toBeCloseTo(0, 12);
    // L1 reçoit toute la tension : 7 V pour 3,5 V nominaux → elle grille (surtension).
    expect(sim.states.get(l1.id)!.burnt).toBe(true);
  });

  it('coupe le circuit quand l\'interrupteur est ouvert', () => {
    const bat = el('battery', 0, 4, 0, 0, { E: 4.5 });
    const k = el('switch', 0, 0, 4, 0, { closed: false });
    const r = el('resistor', 4, 0, 0, 4);
    const sim = simulate([bat, k, r]);
    expect(I(sim, r)).toBeCloseTo(0, 12);
    expect(Math.abs(U(sim, k))).toBeCloseTo(4.5, 6); // toute la tension aux bornes de K
  });
});

describe('semi-conducteurs', () => {
  it('diode passante : tension de seuil ≈ 0,7 V', () => {
    const bat = el('battery', 0, 4, 0, 0, { E: 5 });
    const r = el('resistor', 0, 0, 4, 0, { R: 1000 });
    const d = el('diode', 4, 0, 4, 4);
    const w = el('wire', 4, 4, 0, 4);
    const sim = simulate([bat, r, d, w]);
    expect(U(sim, d)).toBeGreaterThan(0.6);
    expect(U(sim, d)).toBeLessThan(0.75);
    expect(I(sim, d)).toBeCloseTo((5 - U(sim, d)) / 1000, 6);
  });

  it('diode bloquée en inverse', () => {
    const bat = el('battery', 0, 4, 0, 0, { E: 5 });
    const r = el('resistor', 0, 0, 4, 0, { R: 1000 });
    const d = el('diode', 4, 4, 4, 0);
    const w = el('wire', 4, 4, 0, 4);
    const sim = simulate([bat, r, d, w]);
    expect(Math.abs(I(sim, d))).toBeLessThan(1e-8);
  });

  it('une DEL sans résistance de protection grille', () => {
    const bat = el('battery', 0, 4, 0, 0, { E: 9 });
    const led = el('led', 0, 0, 4, 0);
    const w = el('wire', 4, 0, 0, 4);
    const sim = simulate([bat, led, w], 3);
    expect(sim.states.get(led.id)!.burnt).toBe(true);
    expect(sim.issues.map((i) => i.kind)).toContain('burnt');
  });

  it('une DEL rouge protégée par 220 Ω s\'allume normalement', () => {
    const bat = el('battery', 0, 4, 0, 0, { E: 5 });
    const r = el('resistor', 0, 0, 4, 0, { R: 220 });
    const led = el('led', 4, 0, 4, 4, { color: 'red' });
    const w = el('wire', 4, 4, 0, 4);
    const sim = simulate([bat, r, led, w]);
    const st = sim.states.get(led.id)!;
    expect(st.burnt).toBe(false);
    expect(st.v).toBeGreaterThan(1.7);
    expect(st.v).toBeLessThan(1.9);
    expect(st.i).toBeGreaterThan(0.013);
  });
});

describe('régimes transitoires', () => {
  it('charge d\'un condensateur : 63 % de E au bout de τ = RC', () => {
    const bat = el('battery', 0, 4, 0, 0, { E: 5 });
    const r = el('resistor', 0, 0, 4, 0, { R: 1000 });
    const c = el('capacitor', 4, 0, 4, 4, { C: 1e-3 });
    const w = el('wire', 4, 4, 0, 4);
    const sim = simulate([bat, r, c, w], 1000, 1e-3); // 1 s = τ
    expect(U(sim, c)).toBeCloseTo(5 * (1 - Math.exp(-1)), 2);
  });

  it('établissement du courant dans une bobine (τ = L/R)', () => {
    const bat = el('battery', 0, 4, 0, 0, { E: 10 });
    const r = el('resistor', 0, 0, 4, 0, { R: 100 });
    const l = el('inductor', 4, 0, 4, 4, { L: 1 });
    const w = el('wire', 4, 4, 0, 4);
    const sim = simulate([bat, r, l, w], 1000, 1e-5); // 10 ms = τ
    expect(I(sim, l)).toBeCloseTo(0.1 * (1 - Math.exp(-1)), 3);
  });

  it('oscillations LC : période 2π√(LC)', () => {
    const c = el('capacitor', 0, 4, 0, 0, { C: 10e-6, v0: 5 });
    const l = el('inductor', 0, 0, 4, 0, { L: 0.1 });
    const w = el('wire', 4, 0, 0, 4);
    const sim = new Simulator([c, l, w]);
    sim.dt = 1e-6;
    const T = 2 * Math.PI * Math.sqrt(0.1 * 10e-6);
    let prev = U(sim, c);
    let firstZero = Number.NaN;
    for (let k = 0; k < 4000 && Number.isNaN(firstZero); k++) {
      sim.step();
      const v = U(sim, c);
      if (prev > 0 && v <= 0) firstZero = sim.time;
      prev = v;
    }
    expect(firstZero).toBeCloseTo(T / 4, 4);
  });
});

describe('générateur basse fréquence', () => {
  it('produit les formes d\'onde attendues', () => {
    const gbf = el('acsource', 0, 0, 0, 4, { amp: 2, f: 1 });
    expect(waveValue(gbf, 0.25)).toBeCloseTo(2, 12);
    gbf.props.wave = 'square';
    expect(waveValue(gbf, 0.75)).toBe(-2);
    gbf.props.wave = 'triangle';
    expect(waveValue(gbf, 0.125)).toBeCloseTo(1, 12);
  });
});
