/**
 * État partageable du module Mécanique et situations prêtes à projeter.
 */
import { PLANETS, type Drag, type Planet } from './physics';

export interface MechState {
  v: 1;
  v0: number;
  angle: number;
  h: number;
  m: number;
  planet: Planet;
  g: number;
  drag: Drag;
  k: number;
  tau: number;
  show: {
    chrono: boolean;
    velocity: boolean;
    accel: boolean;
    components: boolean;
    deltaV: boolean;
    ideal: boolean;
    keep: boolean;
    target: boolean;
  };
  target: { x: number; y: number; r: number };
  chart: 'positions' | 'vitesses' | 'energies';
}

export function defaultState(): MechState {
  return {
    v: 1, v0: 18, angle: 50, h: 0, m: 0.5, planet: 'terre', g: 9.81, drag: 'none', k: 0.02, tau: 0.2,
    show: { chrono: true, velocity: true, accel: false, components: false, deltaV: false, ideal: true, keep: false, target: false },
    target: { x: 25, y: 5, r: 0.5 },
    chart: 'positions',
  };
}

export interface MechExample {
  title: string;
  level: string;
  hint: string;
  make: () => MechState;
}

const with_ = (patch: Partial<MechState>, show: Partial<MechState['show']> = {}): MechState => {
  const d = defaultState();
  return { ...d, ...patch, show: { ...d.show, ...show } };
};

export const EXAMPLES: MechExample[] = [
  {
    title: 'Tir parabolique',
    level: 'Première',
    hint: 'Sans frottements, l\'accélération est égale à g⃗ : verticale, vers le bas, constante.',
    make: () => with_({ v0: 18, angle: 50 }, { accel: true }),
  },
  {
    title: 'Variation du vecteur vitesse',
    level: 'Seconde',
    hint: 'Δv⃗ entre deux positions encadrant Mᵢ est vertical et vers le bas : comme la force de pesanteur.',
    make: () => with_({ v0: 14, angle: 60, tau: 0.25 }, { deltaV: true, velocity: true }),
  },
  {
    title: 'Chute libre',
    level: 'Seconde',
    hint: 'Positions de plus en plus espacées : le mouvement est accéléré. v = g·t.',
    make: () => with_({ v0: 0, angle: 0, h: 45, tau: 0.25, chart: 'vitesses' }, { velocity: true, accel: true }),
  },
  {
    title: 'Tir horizontal depuis une falaise',
    level: 'Terminale',
    hint: 'La composante horizontale de la vitesse reste constante ; la composante verticale croît linéairement.',
    make: () => with_({ v0: 12, angle: 0, h: 30, chart: 'vitesses' }, { components: true }),
  },
  {
    title: 'Lancer franc au basket',
    level: 'Terminale',
    hint: 'Trouvez la vitesse initiale qui fait passer le ballon dans le panier (3,05 m de haut, 4,2 m de distance).',
    make: () => with_({ v0: 7.3, angle: 52, h: 2, m: 0.6, tau: 0.1, target: { x: 4.2, y: 3.05, r: 0.23 } }, { target: true, keep: true }),
  },
  {
    title: 'Sur la Lune',
    level: 'Seconde',
    hint: 'g est six fois plus faible sur la Lune : même lancer, portée et hauteur six fois plus grandes.',
    make: () => with_({ v0: 18, angle: 50, planet: 'lune', g: PLANETS.lune.g, tau: 1 }),
  },
  {
    title: 'Énergies d\'un projectile',
    level: 'Première',
    hint: 'Sans frottements, l\'énergie mécanique se conserve : ce que perd l\'énergie cinétique, l\'énergie potentielle le gagne.',
    make: () => with_({ v0: 15, angle: 60, h: 2, chart: 'energies' }),
  },
  {
    title: 'Frottements de l\'air : boulet de canon',
    level: 'Terminale',
    hint: 'Avec frottements, la trajectoire n\'est plus symétrique et la portée diminue.',
    make: () => with_({ v0: 70, angle: 45, m: 5, drag: 'quadratic', k: 0.004, tau: 0.5, chart: 'energies' }, { ideal: true }),
  },
  {
    title: 'Volant de badminton',
    level: 'Supérieur',
    hint: 'Frottements très importants : le volant retombe presque à la verticale, à sa vitesse limite.',
    make: () => with_({ v0: 30, angle: 45, m: 0.005, drag: 'quadratic', k: 0.00106, tau: 0.1, chart: 'vitesses' }, { ideal: false }),
  },
];

export function sanitizeState(raw: unknown): MechState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<MechState>;
  if (r.v !== 1) return null;
  const d = defaultState();
  const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
  const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
  const s = (r.show ?? {}) as Partial<MechState['show']>;
  const t = (r.target ?? {}) as Partial<MechState['target']>;
  return {
    v: 1,
    v0: num(r.v0, 0, 500, d.v0),
    angle: num(r.angle, -90, 90, d.angle),
    h: num(r.h, 0, 10000, d.h),
    m: num(r.m, 0.0001, 10000, d.m),
    planet: (['terre', 'lune', 'mars', 'jupiter', 'autre'] as const).includes(r.planet as Planet) ? (r.planet as Planet) : d.planet,
    g: num(r.g, 0.01, 1000, d.g),
    drag: r.drag === 'linear' || r.drag === 'quadratic' ? r.drag : 'none',
    k: num(r.k, 0, 100, d.k),
    tau: num(r.tau, 0.01, 10, d.tau),
    show: {
      chrono: bool(s.chrono, d.show.chrono), velocity: bool(s.velocity, d.show.velocity), accel: bool(s.accel, d.show.accel),
      components: bool(s.components, d.show.components), deltaV: bool(s.deltaV, d.show.deltaV), ideal: bool(s.ideal, d.show.ideal),
      keep: bool(s.keep, d.show.keep), target: bool(s.target, d.show.target),
    },
    target: { x: num(t.x, -1e4, 1e4, d.target.x), y: num(t.y, -1e4, 1e4, d.target.y), r: num(t.r, 0.01, 100, d.target.r) },
    chart: r.chart === 'vitesses' || r.chart === 'energies' ? r.chart : 'positions',
  };
}
