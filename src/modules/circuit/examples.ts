/** Circuits d'exemple, du collège à la terminale. */
import { normalizeProps } from './model/catalog';
import { DEFAULT_OPTIONS, type CircuitOptions, type CircuitState, type ElementData, type ElementType, type PropValue, type ScopeChannel } from './model/types';

type Spec = [ElementType, number, number, number, number, Record<string, PropValue>?];

function circuit(specs: Spec[], opts: Partial<CircuitOptions> = {}, scope: [number, 'v' | 'i'][] = []): CircuitState {
  const elements: ElementData[] = specs.map(([type, x1, y1, x2, y2, props], i) => ({
    id: `e${i + 1}`, type, x1, y1, x2, y2, props: normalizeProps(type, props),
  }));
  const channels: (ScopeChannel | null)[] = [null, null];
  scope.forEach(([index, q], i) => (channels[i] = { id: elements[index].id, q }));
  return { v: 1, elements, opts: { ...DEFAULT_OPTIONS, ...opts }, scope: channels };
}

export interface CircuitExample {
  title: string;
  level: string;
  hint: string;
  make: () => CircuitState;
}

const LAMP = { U: 3.5, P: 0.7 };

export const EXAMPLES: CircuitExample[] = [
  {
    title: 'Circuit en série',
    level: 'Cycle 4',
    hint: 'Les deux lampes brillent faiblement : elles se partagent la tension de la pile. Ouvrez K : tout s\'éteint.',
    make: () => circuit([
      ['battery', 2, 10, 2, 4, { E: 4.5 }],
      ['wire', 2, 4, 5, 4],
      ['switch', 5, 4, 9, 4, { closed: true }],
      ['wire', 9, 4, 12, 4],
      ['lamp', 12, 4, 16, 4, LAMP],
      ['wire', 16, 4, 18, 4],
      ['lamp', 18, 4, 18, 10, LAMP],
      ['wire', 18, 10, 2, 10],
    ]),
  },
  {
    title: 'Circuit en dérivation et loi des nœuds',
    level: 'Cycle 4',
    hint: 'I = I₁ + I₂ : survolez un nœud pour vérifier la loi des nœuds. Les lampes brillent davantage qu\'en série.',
    make: () => circuit([
      ['battery', 2, 12, 2, 4, { E: 4.5 }],
      ['wire', 2, 4, 6, 4],
      ['ammeter', 6, 4, 10, 4],
      ['wire', 10, 4, 14, 4],
      ['lamp', 14, 4, 14, 8, LAMP],
      ['ammeter', 14, 8, 14, 12],
      ['wire', 14, 4, 22, 4],
      ['lamp', 22, 4, 22, 8, LAMP],
      ['ammeter', 22, 8, 22, 12],
      ['wire', 22, 12, 14, 12],
      ['wire', 14, 12, 2, 12],
    ]),
  },
  {
    title: 'Loi d\'Ohm : U = R × I',
    level: 'Cycle 4',
    hint: 'Modifiez la tension de la pile ou la résistance : le quotient U / I reste égal à R.',
    make: () => circuit([
      ['battery', 2, 10, 2, 4, { E: 6 }],
      ['wire', 2, 4, 6, 4],
      ['ammeter', 6, 4, 10, 4],
      ['wire', 10, 4, 14, 4],
      ['resistor', 14, 4, 14, 10, { R: 100 }],
      ['wire', 14, 10, 2, 10],
      ['wire', 14, 4, 18, 4],
      ['voltmeter', 18, 4, 18, 10],
      ['wire', 18, 10, 14, 10],
    ], { measures: true }),
  },
  {
    title: 'DEL et résistance de protection',
    level: 'Cycle 4',
    hint: 'Supprimez la résistance (remplacez-la par un fil) : la DEL grille ! Inversez la DEL (Maj+F) : elle ne s\'allume plus.',
    make: () => circuit([
      ['battery', 2, 10, 2, 4, { E: 6 }],
      ['wire', 2, 4, 5, 4],
      ['switch', 5, 4, 9, 4, { closed: true }],
      ['resistor', 9, 4, 14, 4, { R: 220 }],
      ['led', 14, 4, 14, 10, { color: 'red' }],
      ['wire', 14, 10, 2, 10],
    ], { measures: true }),
  },
  {
    title: 'Court-circuit d\'une lampe',
    level: 'Cycle 4',
    hint: 'K fermé court-circuite L2 : elle s\'éteint et L1 brille plus fort. Ouvrez K pour comparer.',
    make: () => circuit([
      ['battery', 2, 10, 2, 4, { E: 4.5 }],
      ['wire', 2, 4, 6, 4],
      ['lamp', 6, 4, 10, 4, LAMP],
      ['wire', 10, 4, 12, 4],
      ['lamp', 12, 4, 16, 4, LAMP],
      ['wire', 16, 4, 18, 4],
      ['wire', 18, 4, 18, 10],
      ['wire', 18, 10, 2, 10],
      ['wire', 12, 4, 12, 1],
      ['switch', 12, 1, 16, 1, { closed: true }],
      ['wire', 16, 1, 16, 4],
    ]),
  },
  {
    title: 'Pont diviseur de tension',
    level: 'Seconde',
    hint: 'U₂ = E × R₂ / (R₁ + R₂). La masse fixe la référence des potentiels (survolez les nœuds).',
    make: () => circuit([
      ['battery', 2, 12, 2, 4, { E: 12 }],
      ['wire', 2, 4, 10, 4],
      ['resistor', 10, 4, 10, 8, { R: 1000 }],
      ['resistor', 10, 8, 10, 12, { R: 2000 }],
      ['wire', 10, 12, 2, 12],
      ['wire', 10, 8, 14, 8],
      ['voltmeter', 14, 8, 14, 12],
      ['wire', 14, 12, 10, 12],
      ['ground', 2, 12, 2, 12],
    ], { potentials: true }),
  },
  {
    title: 'Charge et décharge d\'un condensateur',
    level: 'Terminale',
    hint: 'τ = RC = 1 s. Ouvrez K1 puis fermez K2 pour observer la décharge à l\'oscilloscope.',
    make: () => circuit([
      ['battery', 2, 10, 2, 4, { E: 5 }],
      ['wire', 2, 4, 4, 4],
      ['switch', 4, 4, 8, 4, { closed: true }],
      ['resistor', 8, 4, 12, 4, { R: 1000 }],
      ['capacitor', 12, 4, 12, 10, { C: 1e-3 }],
      ['wire', 12, 10, 2, 10],
      ['wire', 12, 4, 16, 4],
      ['switch', 16, 4, 20, 4, { closed: false }],
      ['resistor', 20, 4, 20, 10, { R: 1000 }],
      ['wire', 20, 10, 12, 10],
    ], { speed: 1, current: 'conventional' }, [[4, 'v'], [3, 'i']]),
  },
  {
    title: 'Oscillations libres d\'un circuit RLC',
    level: 'Terminale / Supérieur',
    hint: 'Le condensateur est chargé à 5 V. Période propre T₀ = 2π√(LC) ≈ 6,3 ms ; la résistance amortit les oscillations.',
    make: () => circuit([
      ['capacitor', 2, 4, 2, 10, { C: 10e-6, v0: 5 }],
      ['wire', 2, 4, 6, 4],
      ['inductor', 6, 4, 10, 4, { L: 0.1 }],
      ['resistor', 10, 4, 14, 4, { R: 5 }],
      ['wire', 14, 4, 14, 10],
      ['wire', 14, 10, 10, 10],
      ['switch', 10, 10, 6, 10, { closed: true }],
      ['wire', 6, 10, 2, 10],
    ], { speed: 0.01, current: 'electrons' }, [[0, 'v'], [2, 'i']]),
  },
  {
    title: 'Redressement simple alternance',
    level: 'Terminale / BTS',
    hint: 'La diode ne laisse passer que les alternances positives : comparez les deux voies de l\'oscilloscope.',
    make: () => circuit([
      ['acsource', 2, 10, 2, 4, { amp: 10, f: 50 }],
      ['wire', 2, 4, 6, 4],
      ['diode', 6, 4, 10, 4],
      ['wire', 10, 4, 14, 4],
      ['resistor', 14, 4, 14, 10, { R: 1000 }],
      ['wire', 14, 10, 2, 10],
      ['ground', 2, 10, 2, 10],
    ], { speed: 0.01 }, [[0, 'v'], [4, 'v']]),
  },
];
