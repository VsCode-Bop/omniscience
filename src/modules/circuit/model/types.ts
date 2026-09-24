/** Modèle de données du simulateur de circuits (sérialisable dans les liens de partage). */

export type ElementType =
  | 'wire'
  | 'resistor'
  | 'lamp'
  | 'motor'
  | 'capacitor'
  | 'inductor'
  | 'battery'
  | 'acsource'
  | 'isource'
  | 'diode'
  | 'led'
  | 'switch'
  | 'ammeter'
  | 'voltmeter'
  | 'ground';

export type PropValue = number | string | boolean;

/**
 * Un composant relie deux points de la grille : a = (x1, y1) et b = (x2, y2).
 * Conventions (courant « de a vers b » positif) :
 *  - générateurs : a = borne −, b = borne + ;
 *  - diodes : a = anode, b = cathode ;
 *  - ampèremètre : le courant entre par a (borne A) et sort par b (COM) ;
 *  - voltmètre : U = V(a) − V(b) (a = borne V, b = COM) ;
 *  - masse : un seul point (x1, y1).
 */
export interface ElementData {
  id: string;
  type: ElementType;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  props: Record<string, PropValue>;
}

export type CurrentDisplay = 'none' | 'conventional' | 'electrons' | 'both';

export interface CircuitOptions {
  current: CurrentDisplay;
  values: boolean;
  measures: boolean;
  potentials: boolean;
  /** Secondes simulées par seconde réelle. */
  speed: number;
}

export interface ScopeChannel {
  id: string;
  q: 'v' | 'i';
}

export interface CircuitState {
  v: 1;
  elements: ElementData[];
  opts: CircuitOptions;
  scope: (ScopeChannel | null)[];
}

export const DEFAULT_OPTIONS: CircuitOptions = {
  current: 'both',
  values: true,
  measures: false,
  potentials: false,
  speed: 0.01,
};
