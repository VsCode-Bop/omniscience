/**
 * Mouvement d'un projectile dans un champ de pesanteur uniforme, avec ou sans
 * frottements (force linéaire −k·v⃗ ou quadratique −k·v·v⃗), intégré par Runge-Kutta 4.
 * Sans frottements, les grandeurs remarquables sont aussi calculées exactement.
 */

export type Drag = 'none' | 'linear' | 'quadratic';

export interface LaunchParams {
  /** Vitesse initiale (m/s). */
  v0: number;
  /** Angle de tir par rapport à l'horizontale (degrés). */
  angle: number;
  /** Hauteur initiale (m). */
  h: number;
  /** Masse (kg). */
  m: number;
  /** Intensité de la pesanteur (N/kg). */
  g: number;
  drag: Drag;
  /** Coefficient de frottement (kg/s en linéaire, kg/m en quadratique). */
  k: number;
}

export interface Sample {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
}

export interface Trajectory {
  params: LaunchParams;
  samples: Sample[];
  /** Durée du vol (jusqu'au sol y = 0), ou durée simulée si le sol n'est pas atteint. */
  T: number;
  landed: boolean;
  /** Abscisse du point d'impact (portée). */
  range: number;
  /** Point le plus haut (flèche). */
  apex: Sample;
  /** Vitesse et angle (degrés, sous l'horizontale) à l'impact. */
  impactSpeed: number;
  impactAngle: number;
}

const MAX_T = 600;

function accel(p: LaunchParams, vx: number, vy: number): [number, number] {
  if (p.drag === 'none' || p.k <= 0) return [0, -p.g];
  if (p.drag === 'linear') return [(-p.k / p.m) * vx, -p.g - (p.k / p.m) * vy];
  const v = Math.hypot(vx, vy);
  return [(-p.k / p.m) * v * vx, -p.g - (p.k / p.m) * v * vy];
}

/** Durée caractéristique pour choisir le pas d'intégration. */
function timeScale(p: LaunchParams): number {
  const a = (p.angle * Math.PI) / 180;
  const vy = p.v0 * Math.sin(a);
  const tFree = (vy + Math.sqrt(Math.max(0, vy * vy + 2 * p.g * p.h))) / p.g;
  return Math.max(0.05, Number.isFinite(tFree) ? tFree : 10);
}

export function simulate(p: LaunchParams, steps = 2400): Trajectory {
  const a = (p.angle * Math.PI) / 180;
  let x = 0;
  let y = p.h;
  let vx = p.v0 * Math.cos(a);
  let vy = p.v0 * Math.sin(a);
  const dt = Math.min(0.02, timeScale(p) / steps);
  const samples: Sample[] = [];
  let t = 0;
  let landed = false;
  const push = () => {
    const [ax, ay] = accel(p, vx, vy);
    samples.push({ t, x, y, vx, vy, ax, ay });
  };
  push();
  if (p.g <= 0 && p.v0 === 0) return finish(p, samples, false);
  while (t < MAX_T && samples.length < 200000) {
    // Runge-Kutta 4 sur (x, y, vx, vy)
    const [a1x, a1y] = accel(p, vx, vy);
    const [a2x, a2y] = accel(p, vx + (a1x * dt) / 2, vy + (a1y * dt) / 2);
    const [a3x, a3y] = accel(p, vx + (a2x * dt) / 2, vy + (a2y * dt) / 2);
    const [a4x, a4y] = accel(p, vx + a3x * dt, vy + a3y * dt);
    const nx = x + (dt / 6) * (vx + 2 * (vx + (a1x * dt) / 2) + 2 * (vx + (a2x * dt) / 2) + (vx + a3x * dt));
    const ny = y + (dt / 6) * (vy + 2 * (vy + (a1y * dt) / 2) + 2 * (vy + (a2y * dt) / 2) + (vy + a3y * dt));
    const nvx = vx + (dt / 6) * (a1x + 2 * a2x + 2 * a3x + a4x);
    const nvy = vy + (dt / 6) * (a1y + 2 * a2y + 2 * a3y + a4y);
    if (ny < 0) {
      // Impact : interpolation linéaire entre les deux pas.
      const f = y / (y - ny);
      t += f * dt;
      x += f * (nx - x);
      vx += f * (nvx - vx);
      vy += f * (nvy - vy);
      y = 0;
      push();
      landed = true;
      break;
    }
    t += dt;
    x = nx;
    y = ny;
    vx = nvx;
    vy = nvy;
    push();
  }
  return finish(p, samples, landed);
}

function finish(p: LaunchParams, samples: Sample[], landed: boolean): Trajectory {
  const last = samples[samples.length - 1];
  let apex = samples[0];
  for (const s of samples) if (s.y > apex.y) apex = s;
  // Sans frottements : sommet exact (la discrétisation le manquerait de peu).
  if (p.drag === 'none' || p.k <= 0) {
    const a = (p.angle * Math.PI) / 180;
    const vy0 = p.v0 * Math.sin(a);
    if (vy0 > 0 && p.g > 0) {
      const tA = vy0 / p.g;
      if (tA <= last.t) apex = { t: tA, x: p.v0 * Math.cos(a) * tA, y: p.h + (vy0 * vy0) / (2 * p.g), vx: p.v0 * Math.cos(a), vy: 0, ax: 0, ay: -p.g };
    }
  }
  const speed = Math.hypot(last.vx, last.vy);
  return {
    params: p,
    samples,
    T: last.t,
    landed,
    range: last.x,
    apex,
    impactSpeed: speed,
    impactAngle: (Math.atan2(-last.vy, last.vx) * 180) / Math.PI,
  };
}

/** État interpolé à l'instant t. */
export function stateAt(tr: Trajectory, t: number): Sample {
  const s = tr.samples;
  if (t <= 0) return s[0];
  if (t >= tr.T) return s[s.length - 1];
  // Recherche dichotomique de l'intervalle.
  let lo = 0;
  let hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = s[lo];
  const b = s[hi];
  const h = b.t - a.t || 1;
  const f = (t - a.t) / h;
  const mix = (u: number, v: number) => u + (v - u) * f;
  // Positions : interpolation d'Hermite cubique (exacte pour un mouvement uniformément accéléré).
  const h00 = 2 * f ** 3 - 3 * f ** 2 + 1;
  const h10 = f ** 3 - 2 * f ** 2 + f;
  const h01 = -2 * f ** 3 + 3 * f ** 2;
  const h11 = f ** 3 - f ** 2;
  const herm = (p0: number, v0: number, p1: number, v1: number) => h00 * p0 + h10 * h * v0 + h01 * p1 + h11 * h * v1;
  return {
    t,
    x: herm(a.x, a.vx, b.x, b.vx),
    y: herm(a.y, a.vy, b.y, b.vy),
    vx: mix(a.vx, b.vx), vy: mix(a.vy, b.vy), ax: mix(a.ax, b.ax), ay: mix(a.ay, b.ay),
  };
}

export interface Energies {
  ec: number;
  epp: number;
  em: number;
}

export function energies(p: LaunchParams, s: Sample): Energies {
  const ec = 0.5 * p.m * (s.vx * s.vx + s.vy * s.vy);
  const epp = p.m * p.g * s.y;
  return { ec, epp, em: ec + epp };
}

export const PLANETS = {
  terre: { name: 'Terre', g: 9.81 },
  lune: { name: 'Lune', g: 1.62 },
  mars: { name: 'Mars', g: 3.71 },
  jupiter: { name: 'Jupiter', g: 24.79 },
} as const;
export type Planet = keyof typeof PLANETS | 'autre';
