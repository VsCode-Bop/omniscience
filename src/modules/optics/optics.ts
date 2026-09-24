/**
 * Optique géométrique : lentilles minces dans l'approximation de Gauss, tracé de
 * rayons à travers un système de lentilles, réfraction vectorielle (Snell-Descartes),
 * dispersion (loi de Cauchy) et couleur d'une longueur d'onde.
 */

// ─── Lentilles minces ────────────────────────────────────────────────────────

export interface Lens {
  /** Position du centre optique sur l'axe (cm). */
  x: number;
  /** Distance focale image f′ (cm) : > 0 convergente, < 0 divergente. */
  f: number;
}

export interface Conjugate {
  /** Abscisse de l'image (Infinity si l'image est rejetée à l'infini). */
  x: number;
  /** Hauteur (algébrique) de l'image. */
  h: number;
  /** Grandissement γ = OA′/OA. */
  gamma: number;
  /** OA et OA′ (mesures algébriques). */
  oa: number;
  oaPrime: number;
  /** Image réelle (rayons convergeant effectivement) ou virtuelle. */
  real: boolean;
  /** Objet virtuel (placé après la lentille). */
  virtualObject: boolean;
  atInfinity: boolean;
}

/** Relation de conjugaison de Descartes : 1/OA′ − 1/OA = 1/f′. */
export function conjugate(lens: Lens, objX: number, objH: number): Conjugate {
  const oa = objX - lens.x;
  const v = 1 / lens.f + 1 / oa;
  if (Math.abs(v) < 1e-12 || !Number.isFinite(oa) || oa === 0) {
    return { x: oa === 0 ? lens.x : Infinity, h: oa === 0 ? objH : Infinity, gamma: oa === 0 ? 1 : Infinity, oa, oaPrime: oa === 0 ? 0 : Infinity, real: false, virtualObject: oa > 0, atInfinity: oa !== 0 };
  }
  const oaPrime = 1 / v;
  const gamma = oaPrime / oa;
  return { x: lens.x + oaPrime, h: gamma * objH, gamma, oa, oaPrime, real: oaPrime > 0, virtualObject: oa > 0, atInfinity: false };
}

/** Image d'un objet à l'infini vu sous l'angle θ (radians) : dans le plan focal image. */
export function imageOfInfinity(lens: Lens, theta: number): { x: number; h: number } {
  return { x: lens.x + lens.f, h: lens.f * Math.tan(theta) };
}

/** Rayon paraxial : droite y = y0 + s·(x − x0), parcourue dans le sens des x croissants. */
export interface Ray {
  x0: number;
  y0: number;
  s: number;
}

/** Segments d'un rayon à travers les lentilles (triées par x), jusqu'à xEnd. */
export function traceRay(ray: Ray, lenses: Lens[], xEnd: number): { points: [number, number][]; segments: Ray[] } {
  const sorted = [...lenses].sort((a, b) => a.x - b.x);
  let { x0, y0, s } = ray;
  const points: [number, number][] = [[x0, y0]];
  const segments: Ray[] = [{ x0, y0, s }];
  for (const L of sorted) {
    if (L.x <= x0) continue;
    const y = y0 + s * (L.x - x0);
    points.push([L.x, y]);
    // Lentille mince : la pente diminue de y/f′.
    s = s - y / L.f;
    x0 = L.x;
    y0 = y;
    segments.push({ x0, y0, s });
  }
  points.push([xEnd, y0 + s * (xEnd - x0)]);
  return { points, segments };
}

/** Vergence (dioptries) à partir de f′ en cm. */
export const vergence = (fCm: number) => 100 / fCm;

// ─── Réfraction ──────────────────────────────────────────────────────────────

export type Vec = [number, number];

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1];

/**
 * Réfraction d'une direction unitaire d à travers une surface de normale unitaire n
 * (orientée vers le milieu d'incidence). Renvoie null en cas de réflexion totale.
 */
export function refract(d: Vec, n: Vec, n1: number, n2: number): Vec | null {
  const eta = n1 / n2;
  const cosi = -dot(d, n);
  const k = 1 - eta * eta * (1 - cosi * cosi);
  if (k < 0) return null;
  const c = eta * cosi - Math.sqrt(k);
  return [eta * d[0] + c * n[0], eta * d[1] + c * n[1]];
}

export function reflect(d: Vec, n: Vec): Vec {
  const k = 2 * dot(d, n);
  return [d[0] - k * n[0], d[1] - k * n[1]];
}

/** Loi de Snell-Descartes : angle de réfraction (degrés), ou null (réflexion totale). */
export function snell(i1Deg: number, n1: number, n2: number): number | null {
  const s = (n1 * Math.sin((i1Deg * Math.PI) / 180)) / n2;
  if (Math.abs(s) > 1) return null;
  return (Math.asin(s) * 180) / Math.PI;
}

/** Angle limite de réfraction (degrés) lorsque n1 > n2. */
export function criticalAngle(n1: number, n2: number): number | null {
  return n1 > n2 ? (Math.asin(n2 / n1) * 180) / Math.PI : null;
}

/**
 * Coefficient de réflexion en intensité (Fresnel, lumière non polarisée) : sert à
 * doser l'intensité du rayon réfléchi partiellement.
 */
export function fresnel(i1Deg: number, n1: number, n2: number): number {
  const i = (i1Deg * Math.PI) / 180;
  const st = (n1 / n2) * Math.sin(i);
  if (Math.abs(st) >= 1) return 1;
  const ci = Math.cos(i);
  const ct = Math.sqrt(1 - st * st);
  const rs = ((n1 * ci - n2 * ct) / (n1 * ci + n2 * ct)) ** 2;
  const rp = ((n1 * ct - n2 * ci) / (n1 * ct + n2 * ci)) ** 2;
  return (rs + rp) / 2;
}

// ─── Dispersion ──────────────────────────────────────────────────────────────

export interface Glass {
  name: string;
  /** Loi de Cauchy n(λ) = A + B/λ² (λ en nm). */
  A: number;
  B: number;
}

export const GLASSES: Record<string, Glass> = {
  crown: { name: 'Verre crown', A: 1.5046, B: 4200 },
  flint: { name: 'Verre flint', A: 1.5890, B: 10800 },
  eau: { name: 'Eau', A: 1.3199, B: 3000 },
};

export function cauchy(g: Glass, lambdaNm: number): number {
  return g.A + g.B / (lambdaNm * lambdaNm);
}

/** Couleur (approximative) d'une longueur d'onde visible, 380 à 780 nm. */
export function wavelengthColor(l: number): string {
  let r = 0;
  let g = 0;
  let b = 0;
  if (l >= 380 && l < 440) {
    r = -(l - 440) / 60;
    b = 1;
  } else if (l < 490) {
    g = (l - 440) / 50;
    b = 1;
  } else if (l < 510) {
    g = 1;
    b = -(l - 510) / 20;
  } else if (l < 580) {
    r = (l - 510) / 70;
    g = 1;
  } else if (l < 645) {
    r = 1;
    g = -(l - 645) / 65;
  } else if (l <= 780) r = 1;
  // Atténuation aux extrémités du spectre visible.
  const f = l < 420 ? 0.3 + (0.7 * (l - 380)) / 40 : l > 700 ? 0.3 + (0.7 * (780 - l)) / 80 : 1;
  const c = (v: number) => Math.round(255 * Math.pow(Math.max(0, v * f), 0.8));
  return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
}

export interface PrismPath {
  lambda: number;
  n: number;
  /** Points du rayon : entrée, sortie (ou réflexion), extrémité. */
  points: Vec[];
  /** Déviation totale (degrés), si le rayon ressort par la seconde face. */
  deviation: number | null;
  /** Angles (degrés) : incidence, réfraction, incidence interne, émergence. */
  i: number;
  r: number;
  r2: number;
  i2: number | null;
}

/**
 * Prisme d'angle au sommet A (degrés), sommet en (0, 0), base horizontale en bas,
 * faces symétriques. Le rayon incident arrive de la gauche sur la face gauche, au
 * point situé à la distance `hit` du sommet, avec l'incidence i (degrés).
 */
export function tracePrism(Adeg: number, side: number, hit: number, iDeg: number, n: number, lambda: number, length: number): PrismPath {
  const A = (Adeg * Math.PI) / 180;
  const half = A / 2;
  // Faces : du sommet vers le bas, de part et d'autre de la verticale.
  const leftDir: Vec = [-Math.sin(half), -Math.cos(half)];
  const rightDir: Vec = [Math.sin(half), -Math.cos(half)];
  const nLeft: Vec = [-Math.cos(half), Math.sin(half)]; // normale sortante, face gauche
  const nRight: Vec = [Math.cos(half), Math.sin(half)];
  const P: Vec = [leftDir[0] * hit, leftDir[1] * hit];
  // Direction incidente : angle i avec la normale entrante (−nLeft), le rayon « monte » vers la face.
  const i = (iDeg * Math.PI) / 180;
  const inward: Vec = [-nLeft[0], -nLeft[1]];
  const tangent: Vec = [-leftDir[0], -leftDir[1]]; // le long de la face, vers le sommet
  const d: Vec = [Math.cos(i) * inward[0] + Math.sin(i) * tangent[0], Math.cos(i) * inward[1] + Math.sin(i) * tangent[1]];
  const start: Vec = [P[0] - d[0] * length, P[1] - d[1] * length];
  const t1 = refract(d, nLeft, 1, n)!;
  // Intersection avec la face droite : Q = t·rightDir (0 ≤ t ≤ side).
  const denom = t1[0] * rightDir[1] - t1[1] * rightDir[0];
  const u = (P[0] * rightDir[1] - P[1] * rightDir[0]) / -denom;
  const Q: Vec = [P[0] + t1[0] * u, P[1] + t1[1] * u];
  const tOnFace = Q[0] * rightDir[0] + Q[1] * rightDir[1];
  const r = Math.acos(Math.min(1, -dot(t1, nLeft))) * (180 / Math.PI);
  const r2 = Math.acos(Math.min(1, dot(t1, nRight))) * (180 / Math.PI);
  if (!(u > 0) || tOnFace < 0 || tOnFace > side) {
    // Le rayon atteint la base : on l'arrête là (cas marginal).
    const bottomY = -Math.cos(half) * side;
    const k = (bottomY - P[1]) / t1[1];
    const B: Vec = [P[0] + t1[0] * k, P[1] + t1[1] * k];
    return { lambda, n, points: [start, P, B], deviation: null, i: iDeg, r, r2, i2: null };
  }
  const out = refract(t1, [-nRight[0], -nRight[1]], n, 1);
  if (!out) {
    const refl = reflect(t1, [-nRight[0], -nRight[1]]);
    return { lambda, n, points: [start, P, Q, [Q[0] + refl[0] * length * 0.4, Q[1] + refl[1] * length * 0.4]], deviation: null, i: iDeg, r, r2, i2: null };
  }
  const end: Vec = [Q[0] + out[0] * length, Q[1] + out[1] * length];
  const dev = (Math.acos(Math.max(-1, Math.min(1, dot(d, out)))) * 180) / Math.PI;
  const i2 = (Math.acos(Math.min(1, dot(out, nRight))) * 180) / Math.PI;
  return { lambda, n, points: [start, P, Q, end], deviation: dev, i: iDeg, r, r2, i2 };
}
