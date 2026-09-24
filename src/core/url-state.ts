import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

/**
 * Liens d'état : la configuration d'un module est sérialisée en JSON, compressée
 * (lz-string, sûr pour les URL) et placée dans le fragment : #/grapheuse?s=…
 * Rien ne transite par un serveur : le lien EST la sauvegarde.
 */

export interface Route {
  moduleId: string;
  state: string | null;
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const params = new URLSearchParams(query);
  return { moduleId: decodeURIComponent(path || ''), state: params.get('s') };
}

export function buildHash(moduleId: string, encodedState?: string | null): string {
  return `#/${moduleId}${encodedState ? `?s=${encodedState}` : ''}`;
}

export function encodeState(state: unknown): string {
  return compressToEncodedURIComponent(JSON.stringify(state));
}

export function decodeState(encoded: string | null): unknown {
  if (!encoded) return null;
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

export function shareUrl(moduleId: string, state: unknown): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}${buildHash(moduleId, state === undefined ? null : encodeState(state))}`;
}
