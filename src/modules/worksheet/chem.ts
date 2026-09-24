/**
 * Formules chimiques : lecture (atomes, parenthèses, charge) et écriture LaTeX.
 * Sert aux masses molaires et à la vérification des équations ajustées.
 */

export const ATOMIC_MASS: Record<string, number> = {
  H: 1.0, C: 12.0, N: 14.0, O: 16.0, Na: 23.0, Mg: 24.3, Al: 27.0, S: 32.1, Cl: 35.5, K: 39.1, Ca: 40.1, Fe: 55.8, Cu: 63.5, Zn: 65.4,
};

export interface Parsed {
  atoms: Map<string, number>;
  charge: number;
}

/** « Fe(OH)3 », « Cu^{2+} », « HO^- » → atomes et charge. */
export function parseFormula(formula: string): Parsed {
  const [body, chargePart] = formula.split('^');
  let charge = 0;
  if (chargePart) {
    const m = /^\{?(\d*)([+-])\}?$/.exec(chargePart);
    if (!m) throw new Error(`Charge illisible : ${formula}`);
    charge = (m[1] ? Number(m[1]) : 1) * (m[2] === '+' ? 1 : -1);
  }
  let i = 0;
  const group = (): Map<string, number> => {
    const out = new Map<string, number>();
    const add = (el: string, n: number) => out.set(el, (out.get(el) ?? 0) + n);
    while (i < body.length && body[i] !== ')') {
      let part: Map<string, number>;
      if (body[i] === '(') {
        i++;
        part = group();
        i++; // ')'
      } else {
        const m = /^[A-Z][a-z]?/.exec(body.slice(i));
        if (!m) throw new Error(`Formule illisible : ${formula}`);
        i += m[0].length;
        part = new Map([[m[0], 1]]);
      }
      const n = /^\d+/.exec(body.slice(i));
      const k = n ? Number(n[0]) : 1;
      if (n) i += n[0].length;
      for (const [el, c] of part) add(el, c * k);
    }
    return out;
  };
  return { atoms: group(), charge };
}

/** Écriture LaTeX : C6H12O6 → \mathrm{C_{6}H_{12}O_{6}}, Cu^{2+} → \mathrm{Cu^{2+}}. */
export function formulaTex(formula: string): string {
  const [body, charge] = formula.split('^');
  const b = body.replace(/(\d+)/g, '_{$1}');
  const c = charge ? `^{${charge.replace(/[{}]/g, '')}}` : '';
  return `\\mathrm{${b}${c}}`;
}

export function molarMass(formula: string): number {
  let m = 0;
  for (const [el, n] of parseFormula(formula).atoms) {
    const a = ATOMIC_MASS[el];
    if (a === undefined) throw new Error(`Masse molaire inconnue : ${el}`);
    m += a * n;
  }
  return Math.round(m * 10) / 10;
}

/** Éléments d'une formule dans l'ordre d'apparition. */
export function elementsOf(formula: string): [string, number][] {
  return [...parseFormula(formula).atoms];
}

export type Side = [number, string][];
export interface Reaction {
  r: Side;
  p: Side;
  level: 1 | 2 | 3;
}

/** Équations de réaction ajustées (coefficients vérifiés par les tests). */
export const REACTIONS: Reaction[] = [
  { r: [[2, 'H2'], [1, 'O2']], p: [[2, 'H2O']], level: 1 },
  { r: [[2, 'Mg'], [1, 'O2']], p: [[2, 'MgO']], level: 1 },
  { r: [[2, 'Cu'], [1, 'O2']], p: [[2, 'CuO']], level: 1 },
  { r: [[2, 'C'], [1, 'O2']], p: [[2, 'CO']], level: 1 },
  { r: [[2, 'Na'], [1, 'Cl2']], p: [[2, 'NaCl']], level: 1 },
  { r: [[1, 'N2'], [3, 'H2']], p: [[2, 'NH3']], level: 1 },
  { r: [[2, 'H2O2']], p: [[2, 'H2O'], [1, 'O2']], level: 1 },
  { r: [[1, 'CH4'], [2, 'O2']], p: [[1, 'CO2'], [2, 'H2O']], level: 2 },
  { r: [[1, 'C3H8'], [5, 'O2']], p: [[3, 'CO2'], [4, 'H2O']], level: 2 },
  { r: [[1, 'C2H6O'], [3, 'O2']], p: [[2, 'CO2'], [3, 'H2O']], level: 2 },
  { r: [[3, 'Fe'], [2, 'O2']], p: [[1, 'Fe3O4']], level: 2 },
  { r: [[4, 'Fe'], [3, 'O2']], p: [[2, 'Fe2O3']], level: 2 },
  { r: [[4, 'Al'], [3, 'O2']], p: [[2, 'Al2O3']], level: 2 },
  { r: [[1, 'C6H12O6'], [6, 'O2']], p: [[6, 'CO2'], [6, 'H2O']], level: 2 },
  { r: [[1, 'Zn'], [2, 'H^+']], p: [[1, 'Zn^{2+}'], [1, 'H2']], level: 2 },
  { r: [[1, 'Cu^{2+}'], [2, 'HO^-']], p: [[1, 'Cu(OH)2']], level: 2 },
  { r: [[2, 'C2H6'], [7, 'O2']], p: [[4, 'CO2'], [6, 'H2O']], level: 3 },
  { r: [[2, 'C4H10'], [13, 'O2']], p: [[8, 'CO2'], [10, 'H2O']], level: 3 },
  { r: [[1, 'Fe^{3+}'], [3, 'HO^-']], p: [[1, 'Fe(OH)3']], level: 3 },
  { r: [[2, 'Al'], [6, 'H^+']], p: [[2, 'Al^{3+}'], [3, 'H2']], level: 3 },
  { r: [[1, 'Fe2O3'], [3, 'CO']], p: [[2, 'Fe'], [3, 'CO2']], level: 3 },
  { r: [[1, 'CaCO3'], [2, 'H^+']], p: [[1, 'Ca^{2+}'], [1, 'CO2'], [1, 'H2O']], level: 3 },
  { r: [[2, 'C8H18'], [25, 'O2']], p: [[16, 'CO2'], [18, 'H2O']], level: 3 },
];

/** Bilan des atomes et des charges d'un côté de l'équation. */
export function sideBalance(side: Side): { atoms: Map<string, number>; charge: number } {
  const atoms = new Map<string, number>();
  let charge = 0;
  for (const [k, f] of side) {
    const p = parseFormula(f);
    for (const [el, n] of p.atoms) atoms.set(el, (atoms.get(el) ?? 0) + k * n);
    charge += k * p.charge;
  }
  return { atoms, charge };
}
