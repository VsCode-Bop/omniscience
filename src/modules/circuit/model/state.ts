/** Validation des circuits reçus par lien de partage (données non fiables). */
import { CATALOG, normalizeProps } from './catalog';
import { DEFAULT_OPTIONS, type CircuitState, type CurrentDisplay, type ElementData, type ElementType, type ScopeChannel } from './types';

const MAX_ELEMENTS = 400;
const LIMIT = 1000;
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && Math.abs(v) <= LIMIT;
const CURRENT: CurrentDisplay[] = ['none', 'conventional', 'electrons', 'both'];

export function sanitizeCircuit(input: unknown): CircuitState | null {
  if (!input || typeof input !== 'object') return null;
  const s = input as Record<string, unknown>;
  if (!Array.isArray(s.elements)) return null;
  const ids = new Set<string>();
  const elements: ElementData[] = [];
  for (const raw of s.elements.slice(0, MAX_ELEMENTS)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const type = r.type as ElementType;
    if (typeof type !== 'string' || !(type in CATALOG)) continue;
    if (![r.x1, r.y1, r.x2, r.y2].every(isInt)) continue;
    let id = typeof r.id === 'string' && /^[\w-]{1,16}$/.test(r.id) ? r.id : '';
    if (!id || ids.has(id)) id = `e${ids.size + elements.length + 1}_${Math.random().toString(36).slice(2, 6)}`;
    ids.add(id);
    elements.push({
      id,
      type,
      x1: r.x1 as number,
      y1: r.y1 as number,
      x2: r.x2 as number,
      y2: r.y2 as number,
      props: normalizeProps(type, r.props as Record<string, unknown> | undefined),
    });
  }
  const o = (s.opts ?? {}) as Record<string, unknown>;
  const speed = typeof o.speed === 'number' && o.speed >= 1e-6 && o.speed <= 10 ? o.speed : DEFAULT_OPTIONS.speed;
  const scope: (ScopeChannel | null)[] = [0, 1].map((i) => {
    const c = Array.isArray(s.scope) ? (s.scope[i] as Record<string, unknown> | null) : null;
    return c && typeof c.id === 'string' && ids.has(c.id) && (c.q === 'v' || c.q === 'i') ? { id: c.id, q: c.q } : null;
  });
  return {
    v: 1,
    elements,
    opts: {
      current: CURRENT.includes(o.current as CurrentDisplay) ? (o.current as CurrentDisplay) : DEFAULT_OPTIONS.current,
      values: o.values !== false,
      measures: o.measures === true,
      potentials: o.potentials === true,
      speed,
    },
    scope,
  };
}
