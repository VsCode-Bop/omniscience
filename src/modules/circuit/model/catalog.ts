/** Catalogue des composants : propriétés, valeurs par défaut, textes pédagogiques. */
import { fmt, fmtSI } from '../../../core/math/format';
import type { ElementData, ElementType, PropValue } from './types';

export interface PropSpec {
  key: string;
  label: string;
  kind: 'number' | 'select' | 'boolean';
  unit?: string;
  default: PropValue;
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
  /** Valeurs usuelles proposées en un clic. */
  presets?: number[];
}

export type Group = 'base' | 'generators' | 'receptors' | 'semi' | 'measure';

export interface ComponentSpec {
  type: ElementType;
  name: string;
  /** Préfixe des repères (R1, L2, K1…). */
  prefix: string;
  group: Group;
  shortcut?: string;
  terminals: 1 | 2;
  props: PropSpec[];
  description: string;
  /** Valeur affichée à côté du symbole. */
  valueLabel?: (p: Record<string, PropValue>) => string;
}

export const GROUPS: Record<Group, string> = {
  base: 'Liaisons',
  generators: 'Générateurs',
  receptors: 'Récepteurs',
  semi: 'Semi-conducteurs',
  measure: 'Mesure',
};

export const LED_COLORS: Record<string, { label: string; vf: number; color: string }> = {
  red: { label: 'Rouge', vf: 1.8, color: '#ef4444' },
  orange: { label: 'Orange', vf: 2.0, color: '#f97316' },
  yellow: { label: 'Jaune', vf: 2.1, color: '#eab308' },
  green: { label: 'Verte', vf: 2.2, color: '#22c55e' },
  blue: { label: 'Bleue', vf: 3.0, color: '#3b82f6' },
  white: { label: 'Blanche', vf: 3.1, color: '#f8fafc' },
};

const num = (p: Record<string, PropValue>, k: string) => Number(p[k]);

export const CATALOG: Record<ElementType, ComponentSpec> = {
  wire: {
    type: 'wire', name: 'Fil de connexion', prefix: 'fil', group: 'base', shortcut: 'w', terminals: 2, props: [],
    description: 'Conducteur idéal (résistance nulle). Tous les points reliés par des fils sont au même potentiel.',
  },
  switch: {
    type: 'switch', name: 'Interrupteur', prefix: 'K', group: 'base', shortcut: 's', terminals: 2,
    props: [{ key: 'closed', label: 'Fermé', kind: 'boolean', default: false }],
    description: 'Ouvert : le circuit est coupé. Fermé : il se comporte comme un fil. Cliquez dessus pour le basculer.',
  },
  ground: {
    type: 'ground', name: 'Masse', prefix: 'masse', group: 'base', shortcut: 't', terminals: 1, props: [],
    description: 'Potentiel de référence (0 V). Toutes les masses sont reliées entre elles.',
  },
  battery: {
    type: 'battery', name: 'Pile / générateur continu', prefix: 'G', group: 'generators', shortcut: 'g', terminals: 2,
    props: [
      { key: 'E', label: 'Tension (f.é.m.)', kind: 'number', unit: 'V', default: 4.5, min: -1000, max: 1000, presets: [1.5, 4.5, 6, 9, 12] },
      { key: 'r', label: 'Résistance interne', kind: 'number', unit: 'Ω', default: 0, min: 0, max: 1e6, presets: [0, 0.5, 1.5] },
    ],
    description: 'Maintient une tension E entre ses bornes (grand trait = borne +). Avec r > 0 : U = E − r·I.',
    valueLabel: (p) => fmtSI(num(p, 'E'), 'V'),
  },
  acsource: {
    type: 'acsource', name: 'Générateur basse fréquence (GBF)', prefix: 'GBF', group: 'generators', terminals: 2,
    props: [
      { key: 'amp', label: 'Amplitude', kind: 'number', unit: 'V', default: 5, min: 0, max: 1000, presets: [1, 5, 10] },
      { key: 'f', label: 'Fréquence', kind: 'number', unit: 'Hz', default: 50, min: 0.001, max: 1e6, presets: [1, 50, 100, 1000] },
      { key: 'offset', label: 'Composante continue', kind: 'number', unit: 'V', default: 0, min: -1000, max: 1000 },
      {
        key: 'wave', label: 'Forme du signal', kind: 'select', default: 'sine',
        options: [{ value: 'sine', label: 'Sinusoïdal' }, { value: 'square', label: 'Carré' }, { value: 'triangle', label: 'Triangle' }],
      },
    ],
    description: 'Tension variable périodique u(t). Visualisez-la à l\'oscilloscope.',
    valueLabel: (p) => `${fmtSI(num(p, 'amp'), 'V')} ${fmtSI(num(p, 'f'), 'Hz')}`,
  },
  isource: {
    type: 'isource', name: 'Source de courant', prefix: 'S', group: 'generators', terminals: 2,
    props: [{ key: 'I', label: 'Intensité', kind: 'number', unit: 'A', default: 0.01, min: -100, max: 100, presets: [0.001, 0.01, 0.1, 1] }],
    description: 'Impose l\'intensité du courant dans sa branche (sens de la flèche).',
    valueLabel: (p) => fmtSI(num(p, 'I'), 'A'),
  },
  resistor: {
    type: 'resistor', name: 'Résistance (conducteur ohmique)', prefix: 'R', group: 'receptors', shortcut: 'r', terminals: 2,
    props: [{ key: 'R', label: 'Résistance', kind: 'number', unit: 'Ω', default: 100, min: 1e-3, max: 1e9, presets: [10, 100, 220, 470, 1000, 10000] }],
    description: 'Loi d\'Ohm : U = R × I. Convertit l\'énergie électrique en chaleur (effet Joule).',
    valueLabel: (p) => fmtSI(num(p, 'R'), 'Ω'),
  },
  lamp: {
    type: 'lamp', name: 'Lampe', prefix: 'L', group: 'receptors', shortcut: 'l', terminals: 2,
    props: [
      { key: 'U', label: 'Tension nominale', kind: 'number', unit: 'V', default: 3.5, min: 0.1, max: 1000, presets: [2.5, 3.5, 6, 12] },
      { key: 'P', label: 'Puissance nominale', kind: 'number', unit: 'W', default: 0.7, min: 1e-3, max: 1e4, presets: [0.3, 0.7, 1, 5] },
    ],
    description: 'Brille normalement sous sa tension nominale, faiblement en sous-tension, et grille en forte surtension.',
    valueLabel: (p) => `${fmt(num(p, 'U'), 3)} V – ${fmt(num(p, 'P'), 3)} W`,
  },
  motor: {
    type: 'motor', name: 'Moteur', prefix: 'M', group: 'receptors', shortcut: 'm', terminals: 2,
    props: [{ key: 'R', label: 'Résistance interne', kind: 'number', unit: 'Ω', default: 10, min: 0.01, max: 1e6 }],
    description: 'Tourne d\'autant plus vite que l\'intensité est grande ; le sens de rotation s\'inverse avec le sens du courant.',
  },
  capacitor: {
    type: 'capacitor', name: 'Condensateur', prefix: 'C', group: 'receptors', shortcut: 'c', terminals: 2,
    props: [
      { key: 'C', label: 'Capacité', kind: 'number', unit: 'F', default: 1e-3, min: 1e-15, max: 100, presets: [1e-6, 10e-6, 100e-6, 1e-3] },
      { key: 'v0', label: 'Tension initiale', kind: 'number', unit: 'V', default: 0, min: -1e4, max: 1e4 },
    ],
    description: 'Stocke des charges : i = C·du/dt. Sa tension ne peut pas varier brusquement (constante de temps τ = RC).',
    valueLabel: (p) => fmtSI(num(p, 'C'), 'F'),
  },
  inductor: {
    type: 'inductor', name: 'Bobine (inductance)', prefix: 'B', group: 'receptors', shortcut: 'b', terminals: 2,
    props: [{ key: 'L', label: 'Inductance', kind: 'number', unit: 'H', default: 0.1, min: 1e-9, max: 1e4, presets: [0.01, 0.1, 1] }],
    description: 'u = L·di/dt : elle s\'oppose aux variations du courant (constante de temps τ = L/R).',
    valueLabel: (p) => fmtSI(num(p, 'L'), 'H'),
  },
  diode: {
    type: 'diode', name: 'Diode', prefix: 'D', group: 'semi', shortcut: 'd', terminals: 2,
    props: [],
    description: 'Ne laisse passer le courant que de l\'anode vers la cathode (sens passant), avec une tension de seuil ≈ 0,6 V.',
  },
  led: {
    type: 'led', name: 'Diode électroluminescente (DEL)', prefix: 'DEL', group: 'semi', shortcut: 'e', terminals: 2,
    props: [
      {
        key: 'color', label: 'Couleur', kind: 'select', default: 'red',
        options: Object.entries(LED_COLORS).map(([value, c]) => ({ value, label: `${c.label} (seuil ≈ ${String(c.vf).replace('.', ',')} V)` })),
      },
      { key: 'Imax', label: 'Intensité maximale', kind: 'number', unit: 'A', default: 0.03, min: 1e-4, max: 10 },
    ],
    description: 'S\'allume dans le sens passant. Une résistance de protection est indispensable : au-delà de Imax, elle grille !',
  },
  ammeter: {
    type: 'ammeter', name: 'Ampèremètre', prefix: 'A', group: 'measure', shortcut: 'a', terminals: 2, props: [],
    description: 'Mesure l\'intensité. Se branche en SÉRIE ; le courant entre par la borne A (+) et sort par COM.',
  },
  voltmeter: {
    type: 'voltmeter', name: 'Voltmètre', prefix: 'V', group: 'measure', shortcut: 'v', terminals: 2, props: [],
    description: 'Mesure la tension U = V(+) − V(COM). Se branche en DÉRIVATION, aux bornes du dipôle étudié.',
  },
};

export const PALETTE_ORDER: ElementType[] = [
  'wire', 'switch', 'ground',
  'battery', 'acsource', 'isource',
  'resistor', 'lamp', 'motor', 'capacitor', 'inductor',
  'diode', 'led',
  'ammeter', 'voltmeter',
];

export function defaultProps(type: ElementType): Record<string, PropValue> {
  return Object.fromEntries(CATALOG[type].props.map((p) => [p.key, p.default]));
}

/** Complète / valide les propriétés (données issues d'un lien : non fiables). */
export function normalizeProps(type: ElementType, props: Record<string, unknown> | undefined): Record<string, PropValue> {
  const out = defaultProps(type);
  if (!props) return out;
  for (const spec of CATALOG[type].props) {
    const v = props[spec.key];
    if (spec.kind === 'number' && typeof v === 'number' && Number.isFinite(v)) {
      out[spec.key] = Math.min(spec.max ?? Infinity, Math.max(spec.min ?? -Infinity, v));
    } else if (spec.kind === 'boolean' && typeof v === 'boolean') {
      out[spec.key] = v;
    } else if (spec.kind === 'select' && typeof v === 'string' && spec.options?.some((o) => o.value === v)) {
      out[spec.key] = v;
    }
  }
  return out;
}

/** Repères lisibles (R1, R2, L1…) attribués dans l'ordre du circuit. */
export function labelElements(elements: ElementData[]): Map<string, string> {
  const counters = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const el of elements) {
    if (el.type === 'wire' || el.type === 'ground') continue;
    const prefix = CATALOG[el.type].prefix;
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    labels.set(el.id, `${prefix}${n}`);
  }
  return labels;
}
