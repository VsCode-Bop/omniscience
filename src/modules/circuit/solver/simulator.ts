/**
 * Moteur de simulation de circuits : analyse nodale modifiée (MNA).
 *
 * Inconnues : potentiels des nœuds + courants dans les sources de tension idéales.
 * - Les fils, ampèremètres, interrupteurs fermés et masses sont des conducteurs idéaux :
 *   leurs extrémités sont fusionnées en « super-nœuds » (union-find). Le courant dans
 *   chaque fil est ensuite reconstitué par la loi des nœuds sur un arbre couvrant.
 * - Condensateurs et bobines : modèles compagnons (trapèzes ; Euler implicite pendant
 *   deux pas après chaque changement de topologie pour éviter les oscillations numériques).
 * - Diodes et DEL : modèle de Shockley linéarisé, itérations de Newton-Raphson avec
 *   limitation de tension (pnjlim, comme SPICE).
 * - La matrice des circuits linéaires n'est factorisée (LU) qu'une fois par topologie.
 */
import { LUSolver } from '../../../core/math/linalg';
import { LED_COLORS } from '../model/catalog';
import type { ElementData, ElementType } from '../model/types';

const GMIN = 1e-12;
const VT = 0.025852; // tension thermique à 300 K
const DIODE = { Is: 2.52e-9, n: 1.752 }; // type 1N4148
const LED_N = 2;
const LED_IREF = 0.01;
/** Au-delà de ce courant, la caractéristique exponentielle est prolongée linéairement (évite les débordements). */
const DIODE_ILIM = 10;

export interface ElementState {
  /** Tension V(a) − V(b). */
  v: number;
  /** Intensité de a vers b (sens conventionnel). */
  i: number;
  vPrev: number;
  iPrev: number;
  /** Diodes : tension de linéarisation de Newton. */
  vd: number;
  burnt: boolean;
  /** Éclairement relatif (lampe, DEL). */
  glow: number;
}

export type IssueKind = 'short' | 'source-loop' | 'singular' | 'burnt' | 'convergence' | 'overvoltage';

export interface Issue {
  kind: IssueKind;
  message: string;
  ids: string[];
}

interface Stamp {
  el: ElementData;
  st: ElementState;
  pa: number;
  pb: number;
  sa: number;
  sb: number;
  a: number;
  b: number;
  vs: number;
  active: boolean;
  wire: boolean;
  geq: number;
  jeq: number;
  Is: number;
  nVt: number;
  vcrit: number;
  vmax: number;
}

class UnionFind {
  private readonly parent: Int32Array;
  constructor(n: number) {
    this.parent = new Int32Array(n).map((_, i) => i);
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]];
      i = this.parent[i];
    }
    return i;
  }
  union(a: number, b: number): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    this.parent[ra] = rb;
    return true;
  }
}

const num = (el: ElementData, key: string) => Number(el.props[key]);

export function isWireLike(el: ElementData): boolean {
  return el.type === 'wire' || el.type === 'ammeter' || el.type === 'ground' || (el.type === 'switch' && el.props.closed === true);
}

const DYNAMIC: ReadonlySet<ElementType> = new Set(['capacitor', 'inductor', 'acsource']);

/** Tension délivrée par le GBF à l'instant t. */
export function waveValue(el: ElementData, t: number): number {
  const amp = num(el, 'amp');
  const f = num(el, 'f');
  const offset = num(el, 'offset') || 0;
  const frac = (((f * t) % 1) + 1) % 1;
  switch (el.props.wave) {
    case 'square':
      return offset + (frac < 0.5 ? amp : -amp);
    case 'triangle':
      return offset + amp * (frac < 0.25 ? 4 * frac : frac < 0.75 ? 2 - 4 * frac : 4 * frac - 4);
    default:
      return offset + amp * Math.sin(2 * Math.PI * frac);
  }
}

/** Caractéristique de Shockley i(v) et sa pente, prolongée linéairement au-delà de vmax. */
function diodeIV(v: number, Is: number, nVt: number, vmax: number): [number, number] {
  if (v <= vmax) {
    const ex = Math.exp(v / nVt);
    return [Is * (ex - 1), (Is * ex) / nVt];
  }
  const ex = Math.exp(vmax / nVt);
  const g = (Is * ex) / nVt;
  return [Is * (ex - 1) + g * (v - vmax), g];
}

function pnjlim(vnew: number, vold: number, vt: number, vcrit: number): number {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / vt;
      return arg > 0 ? vold + vt * Math.log(arg) : vcrit;
    }
    return vt * Math.log(vnew / vt);
  }
  return vnew;
}

export class Simulator {
  time = 0;
  dt = 1e-5;
  readonly states = new Map<string, ElementState>();
  issues: Issue[] = [];
  /** Appelé après chaque pas réussi (enregistrement de l'oscilloscope). */
  onStep: (() => void) | null = null;

  private elements: ElementData[] = [];
  private stamps: Stamp[] = [];
  private pointKeys: string[] = [];
  private pointIndex = new Map<string, number>();
  private pointSuper = new Int32Array(0);
  private superIndex = new Int32Array(0);
  private superComp = new Int32Array(0);
  private superV = new Float64Array(0);
  private nodeCount = 0;
  private size = 0;
  private A = new Float64Array(0);
  private z = new Float64Array(0);
  private x = new Float64Array(0);
  private lu = new LUSolver(0);
  private nonlinear = false;
  private needsBuild = true;
  private factored = false;
  private lastMethod: 'be' | 'trap' | null = null;
  private lastDt = 0;
  private stepsSinceChange = 0;
  private topologyIssues: Issue[] = [];
  private treeOrder: number[] = [];
  private parentEdge = new Int32Array(0);
  private parentPoint = new Int32Array(0);
  private pending = 0;

  constructor(elements: ElementData[] = []) {
    this.setElements(elements);
  }

  get hasDynamics(): boolean {
    return this.elements.some((e) => DYNAMIC.has(e.type));
  }

  /** Remplace le circuit en conservant l'état des composants inchangés (charge des condensateurs…). */
  setElements(elements: ElementData[]): void {
    this.elements = elements;
    const ids = new Set(elements.map((e) => e.id));
    for (const id of [...this.states.keys()]) if (!ids.has(id)) this.states.delete(id);
    for (const el of elements) if (!this.states.has(el.id)) this.states.set(el.id, this.initialState(el));
    this.needsBuild = true;
    this.stepsSinceChange = 0;
  }

  reset(): void {
    this.time = 0;
    this.pending = 0;
    this.states.clear();
    for (const el of this.elements) this.states.set(el.id, this.initialState(el));
    this.needsBuild = true;
    this.stepsSinceChange = 0;
  }

  repair(id: string): void {
    const st = this.states.get(id);
    if (st) {
      st.burnt = false;
      st.vd = 0;
      this.needsBuild = true;
    }
  }

  private initialState(el: ElementData): ElementState {
    const v0 = el.type === 'capacitor' ? num(el, 'v0') || 0 : 0;
    return { v: v0, i: 0, vPrev: v0, iPrev: 0, vd: 0, burnt: false, glow: 0 };
  }

  // ─── Topologie ────────────────────────────────────────────────────────────

  private point(x: number, y: number): number {
    const key = `${x},${y}`;
    let i = this.pointIndex.get(key);
    if (i === undefined) {
      i = this.pointKeys.length;
      this.pointKeys.push(key);
      this.pointIndex.set(key, i);
    }
    return i;
  }

  private build(): void {
    this.needsBuild = false;
    this.factored = false;
    this.pointKeys = [];
    this.pointIndex = new Map();
    const GND = this.point(Number.NaN, Number.NaN); // point virtuel commun à toutes les masses
    const raw = this.elements.map((el) => ({
      el,
      pa: this.point(el.x1, el.y1),
      pb: el.type === 'ground' ? GND : this.point(el.x2, el.y2),
    }));
    const P = this.pointKeys.length;

    // 1. Super-nœuds : fusion des extrémités des conducteurs idéaux.
    const uf = new UnionFind(P);
    for (const r of raw) if (isWireLike(r.el)) uf.union(r.pa, r.pb);
    const rootToSuper = new Map<number, number>();
    this.pointSuper = new Int32Array(P);
    for (let p = 0; p < P; p++) {
      const root = uf.find(p);
      if (!rootToSuper.has(root)) rootToSuper.set(root, rootToSuper.size);
      this.pointSuper[p] = rootToSuper.get(root)!;
    }
    const S = rootToSuper.size;
    const hasGround = raw.some((r) => r.el.type === 'ground');
    const gndSuper = this.pointSuper[GND];

    // 2. Composantes conductrices : une référence de potentiel par composante.
    const conducts = (r: (typeof raw)[number]) => {
      if (isWireLike(r.el) || r.el.type === 'voltmeter' || r.el.type === 'switch') return false;
      return !this.states.get(r.el.id)?.burnt;
    };
    const comp = new UnionFind(S);
    for (const r of raw) if (conducts(r)) comp.union(this.pointSuper[r.pa], this.pointSuper[r.pb]);
    const refOfComp = new Map<number, number>();
    if (hasGround) refOfComp.set(comp.find(gndSuper), gndSuper);
    for (const r of raw) {
      if ((r.el.type === 'battery' || r.el.type === 'acsource') && conducts(r)) {
        const c = comp.find(this.pointSuper[r.pa]);
        if (!refOfComp.has(c)) refOfComp.set(c, this.pointSuper[r.pa]); // borne − du premier générateur
      }
    }
    this.superIndex = new Int32Array(S);
    this.superComp = new Int32Array(S);
    let n = 0;
    for (let s = 0; s < S; s++) {
      const c = comp.find(s);
      this.superComp[s] = c;
      if (!refOfComp.has(c)) refOfComp.set(c, s);
      this.superIndex[s] = refOfComp.get(c) === s ? -1 : n++;
    }
    this.nodeCount = n;

    // 3. Sources de tension idéales : courts-circuits et boucles de sources.
    this.topologyIssues = [];
    const loops = new UnionFind(S);
    let m = 0;
    this.nonlinear = false;
    this.stamps = raw.map(({ el, pa, pb }) => {
      const sa = this.pointSuper[pa];
      const sb = this.pointSuper[pb];
      const st = this.states.get(el.id)!;
      const stamp: Stamp = {
        el, st, pa, pb, sa, sb,
        a: this.superIndex[sa], b: this.superIndex[sb],
        vs: -1, active: true, wire: isWireLike(el),
        geq: 0, jeq: 0, Is: 0, nVt: 0, vcrit: 0, vmax: 0,
      };
      if (el.type === 'voltmeter' || (el.type === 'switch' && !stamp.wire) || st.burnt) stamp.active = false;
      const idealSource = el.type === 'acsource' || (el.type === 'battery' && !(num(el, 'r') > 0));
      if (idealSource) {
        if (sa === sb) {
          stamp.active = false;
          this.topologyIssues.push({
            kind: 'short', ids: [el.id],
            message: 'Court-circuit : les bornes du générateur sont reliées par un fil, un ampèremètre ou un interrupteur fermé. Intensité dangereusement élevée !',
          });
        } else if (!loops.union(sa, sb)) {
          stamp.active = false;
          this.topologyIssues.push({
            kind: 'source-loop', ids: [el.id],
            message: 'Générateurs idéaux branchés en dérivation directe : situation impossible (ajoutez une résistance interne).',
          });
        } else {
          stamp.vs = m++;
        }
      }
      if ((el.type === 'diode' || el.type === 'led') && stamp.active) {
        this.nonlinear = true;
        if (el.type === 'led') {
          const vf = LED_COLORS[String(el.props.color)]?.vf ?? 1.8;
          stamp.nVt = LED_N * VT;
          stamp.Is = LED_IREF / Math.expm1(vf / stamp.nVt);
        } else {
          stamp.nVt = DIODE.n * VT;
          stamp.Is = DIODE.Is;
        }
        stamp.vcrit = stamp.nVt * Math.log(stamp.nVt / (Math.SQRT2 * stamp.Is));
        stamp.vmax = stamp.nVt * Math.log(DIODE_ILIM / stamp.Is + 1);
      }
      return stamp;
    });
    for (const s of this.stamps) if (s.vs >= 0) s.vs += n;

    this.size = n + m;
    this.A = new Float64Array(this.size * this.size);
    this.z = new Float64Array(this.size);
    this.x = new Float64Array(this.size);
    this.lu = new LUSolver(this.size);
    this.superV = new Float64Array(S);
    this.buildWireTree(P);
  }

  /** Arbre couvrant du graphe des conducteurs idéaux (parcours en largeur). */
  private buildWireTree(P: number): void {
    const adj: [number, number][][] = Array.from({ length: P }, () => []);
    this.stamps.forEach((s, k) => {
      if (s.wire && s.pa !== s.pb) {
        adj[s.pa].push([s.pb, k]);
        adj[s.pb].push([s.pa, k]);
      }
    });
    this.parentEdge = new Int32Array(P).fill(-1);
    this.parentPoint = new Int32Array(P).fill(-1);
    const seen = new Uint8Array(P);
    this.treeOrder = [];
    for (let root = 0; root < P; root++) {
      if (seen[root]) continue;
      seen[root] = 1;
      const queue = [root];
      for (let q = 0; q < queue.length; q++) {
        const u = queue[q];
        this.treeOrder.push(u);
        for (const [v, k] of adj[u]) {
          if (seen[v]) continue;
          seen[v] = 1;
          this.parentEdge[v] = k;
          this.parentPoint[v] = u;
          queue.push(v);
        }
      }
    }
  }

  // ─── Assemblage du système ────────────────────────────────────────────────

  private conductance(a: number, b: number, g: number): void {
    const { A, size: N } = this;
    if (a >= 0) A[a * N + a] += g;
    if (b >= 0) A[b * N + b] += g;
    if (a >= 0 && b >= 0) {
      A[a * N + b] -= g;
      A[b * N + a] -= g;
    }
  }

  /** Source de courant j circulant de a vers b à travers le composant. */
  private current(a: number, b: number, j: number): void {
    if (a >= 0) this.z[a] -= j;
    if (b >= 0) this.z[b] += j;
  }

  private assemble(method: 'be' | 'trap', t: number): void {
    const { A, z, size: N, dt } = this;
    A.fill(0);
    z.fill(0);
    for (let i = 0; i < this.nodeCount; i++) A[i * N + i] += GMIN;
    for (const s of this.stamps) {
      if (!s.active || s.wire) continue;
      const { el, st, a, b } = s;
      switch (el.type) {
        case 'resistor':
        case 'motor':
          this.conductance(a, b, 1 / num(el, 'R'));
          break;
        case 'lamp':
          this.conductance(a, b, num(el, 'P') / num(el, 'U') ** 2);
          break;
        case 'capacitor': {
          const C = num(el, 'C');
          s.geq = method === 'trap' ? (2 * C) / dt : C / dt;
          s.jeq = method === 'trap' ? -(s.geq * st.vPrev + st.iPrev) : -s.geq * st.vPrev;
          this.conductance(a, b, s.geq);
          this.current(a, b, s.jeq);
          break;
        }
        case 'inductor': {
          const L = num(el, 'L');
          s.geq = method === 'trap' ? dt / (2 * L) : dt / L;
          s.jeq = method === 'trap' ? st.iPrev + s.geq * st.vPrev : st.iPrev;
          this.conductance(a, b, s.geq);
          this.current(a, b, s.jeq);
          break;
        }
        case 'battery':
        case 'acsource': {
          const E = el.type === 'battery' ? num(el, 'E') : waveValue(el, t);
          if (s.vs >= 0) {
            const k = s.vs;
            if (a >= 0) {
              A[a * N + k] += 1;
              A[k * N + a] -= 1;
            }
            if (b >= 0) {
              A[b * N + k] -= 1;
              A[k * N + b] += 1;
            }
            z[k] = E;
          } else {
            const r = num(el, 'r');
            this.conductance(a, b, 1 / r);
            this.current(a, b, E / r);
          }
          break;
        }
        case 'isource':
          this.current(a, b, num(el, 'I'));
          break;
        case 'diode':
        case 'led': {
          const [id, g] = diodeIV(st.vd, s.Is, s.nVt, s.vmax);
          const gd = g + GMIN;
          this.conductance(a, b, gd);
          this.current(a, b, id - gd * st.vd);
          break;
        }
      }
    }
  }

  private nodeV(idx: number): number {
    return idx >= 0 ? this.x[idx] : 0;
  }

  // ─── Pas de temps ─────────────────────────────────────────────────────────

  /** Avance d'un pas dt. Retourne false si le système n'a pas pu être résolu. */
  step(): boolean {
    if (this.needsBuild) this.build();
    const method = this.stepsSinceChange < 2 ? 'be' : 'trap';
    const t = this.time + this.dt;
    const issues: Issue[] = [...this.topologyIssues];
    let ok = true;

    if (this.size > 0) {
      if (!this.nonlinear) {
        this.assemble(method, t);
        if (!this.factored || method !== this.lastMethod || this.dt !== this.lastDt) {
          ok = this.lu.factor(this.A);
          this.factored = ok;
        }
        if (ok) this.lu.solve(this.z, this.x);
      } else {
        let converged = false;
        for (let iter = 0; iter < 80 && ok; iter++) {
          this.assemble(method, t);
          ok = this.lu.factor(this.A);
          if (!ok) break;
          this.lu.solve(this.z, this.x);
          converged = true;
          for (const s of this.stamps) {
            if (!s.active || (s.el.type !== 'diode' && s.el.type !== 'led')) continue;
            const vnew = this.nodeV(s.a) - this.nodeV(s.b);
            const vlim = pnjlim(vnew, s.st.vd, s.nVt, s.vcrit);
            if (Math.abs(vlim - s.st.vd) > 1e-7 + 1e-6 * Math.abs(s.st.vd)) converged = false;
            s.st.vd = vlim;
          }
          if (converged) break;
        }
        this.factored = false;
        if (ok && !converged) {
          issues.push({ kind: 'convergence', ids: [], message: 'Calcul non convergé (circuit très non linéaire) : résultats approximatifs.' });
        }
      }
      this.lastMethod = method;
      this.lastDt = this.dt;
    }

    if (!ok) {
      issues.push({ kind: 'singular', ids: [], message: 'Circuit impossible à résoudre : vérifiez qu\'aucune branche n\'est incohérente (sources en série ouvertes…).' });
      this.issues = issues;
      return false;
    }
    this.commit(issues);
    this.time = t;
    this.stepsSinceChange++;
    this.issues = issues;
    this.onStep?.();
    return true;
  }

  private commit(issues: Issue[]): void {
    const S = this.superV.length;
    for (let s = 0; s < S; s++) this.superV[s] = this.nodeV(this.superIndex[s]);
    let maxV = 0;
    for (let s = 0; s < S; s++) maxV = Math.max(maxV, Math.abs(this.superV[s]));
    if (maxV > 1e5) {
      issues.push({ kind: 'overvoltage', ids: [], message: 'Tension anormalement élevée : une source de courant ou une bobine débite dans un circuit ouvert.' });
    }

    const burnt: string[] = [];
    for (const s of this.stamps) {
      const { el, st } = s;
      st.v = this.superV[s.sa] - this.superV[s.sb];
      if (!s.active) {
        st.i = 0;
        if (el.type === 'voltmeter' && this.superComp[s.sa] !== this.superComp[s.sb]) st.v = Number.NaN;
        st.glow = 0;
        continue;
      }
      if (s.wire) continue;
      switch (el.type) {
        case 'resistor':
        case 'motor':
          st.i = st.v / num(el, 'R');
          break;
        case 'lamp': {
          const U = num(el, 'U');
          const P = num(el, 'P');
          st.i = (st.v * P) / (U * U);
          const power = st.v * st.i;
          st.glow = power / P;
          if (power > 2.2 * P) {
            st.burnt = true;
            burnt.push(el.id);
          }
          break;
        }
        case 'capacitor':
        case 'inductor':
          st.i = s.geq * st.v + s.jeq;
          st.vPrev = st.v;
          st.iPrev = st.i;
          break;
        case 'battery':
        case 'acsource':
          st.i = s.vs >= 0 ? this.x[s.vs] : st.v / num(el, 'r') + num(el, 'E') / num(el, 'r');
          break;
        case 'isource':
          st.i = num(el, 'I');
          break;
        case 'diode':
        case 'led':
          st.i = diodeIV(st.vd, s.Is, s.nVt, s.vmax)[0];
          if (el.type === 'led') {
            st.glow = Math.max(0, st.i) / 0.02;
            if (st.i > num(el, 'Imax')) {
              st.burnt = true;
              burnt.push(el.id);
            }
          }
          break;
      }
    }
    this.solveWireCurrents();
    if (burnt.length) {
      this.needsBuild = true;
      this.stepsSinceChange = 0;
    }
    const allBurnt = this.stamps.filter((s) => s.st.burnt).map((s) => s.el.id);
    if (allBurnt.length) {
      issues.push({ kind: 'burnt', ids: allBurnt, message: 'Composant grillé (intensité ou tension trop élevée). Sélectionnez-le pour le remplacer.' });
    }
  }

  /**
   * Courant dans les conducteurs idéaux : à chaque point, la somme des courants
   * apportés par les autres composants doit repartir par les fils (loi des nœuds),
   * que l'on propage des feuilles vers la racine de l'arbre couvrant.
   */
  private solveWireCurrents(): void {
    const acc = new Float64Array(this.pointKeys.length);
    for (const s of this.stamps) {
      if (s.wire) {
        s.st.i = 0;
        continue;
      }
      acc[s.pa] -= s.st.i;
      acc[s.pb] += s.st.i;
    }
    for (let k = this.treeOrder.length - 1; k >= 0; k--) {
      const u = this.treeOrder[k];
      const e = this.parentEdge[u];
      if (e < 0) continue;
      const flow = acc[u]; // courant de u vers son parent
      const s = this.stamps[e];
      s.st.i = s.pa === u ? flow : -flow;
      acc[this.parentPoint[u]] += flow;
    }
  }

  /** Avance de `simSeconds` en temps simulé, dans la limite d'un budget de calcul (ms). */
  advance(simSeconds: number, budgetMs = 10): { steps: number; slowed: boolean } {
    this.pending += simSeconds;
    const t0 = performance.now();
    let steps = 0;
    while (this.pending >= this.dt) {
      if (!this.step()) {
        this.pending = 0;
        break;
      }
      this.pending -= this.dt;
      steps++;
      if ((steps & 15) === 0 && performance.now() - t0 > budgetMs) {
        this.pending = 0;
        return { steps, slowed: true };
      }
    }
    return { steps, slowed: false };
  }

  // ─── Lecture des résultats ────────────────────────────────────────────────

  /** Potentiel d'un point de la grille (undefined s'il n'appartient à aucun composant). */
  pointVoltage(x: number, y: number): number | undefined {
    const p = this.pointIndex.get(`${x},${y}`);
    if (p === undefined || this.needsBuild) return undefined;
    return this.superV[this.pointSuper[p]];
  }

  /** Courants arrivant au point (x, y) depuis chacun des composants qui y sont branchés. */
  currentsAt(x: number, y: number): { id: string; i: number }[] {
    const p = this.pointIndex.get(`${x},${y}`);
    if (p === undefined) return [];
    const out: { id: string; i: number }[] = [];
    for (const s of this.stamps) {
      if (s.pa === p) out.push({ id: s.el.id, i: -s.st.i });
      if (s.pb === p) out.push({ id: s.el.id, i: s.st.i });
    }
    return out;
  }
}
