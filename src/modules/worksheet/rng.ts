/**
 * Générateur pseudo-aléatoire reproductible : une même graine redonne exactement la
 * même fiche (liens de partage, versions A/B, corrigé imprimé plus tard).
 * Hachage xmur3 de la graine, puis générateur sfc32 (période ≈ 2¹²⁸).
 */

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: string) {
    const next = xmur3(seed);
    this.a = next();
    this.b = next();
    this.c = next();
    this.d = next();
    for (let i = 0; i < 15; i++) this.next();
  }

  /** Réel uniforme dans [0 ; 1[. */
  next(): number {
    this.a >>>= 0; this.b >>>= 0; this.c >>>= 0; this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** Entier uniforme dans [min ; max] (bornes incluses). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Entier non nul dans [min ; max]. */
  nz(min: number, max: number): number {
    for (;;) {
      const v = this.int(min, max);
      if (v !== 0) return v;
    }
  }

  /** Entier dans [min ; max] différent des valeurs exclues. */
  intExcept(min: number, max: number, ...except: number[]): number {
    for (let i = 0; i < 200; i++) {
      const v = this.int(min, max);
      if (!except.includes(v)) return v;
    }
    return min;
  }

  sign(): 1 | -1 {
    return this.next() < 0.5 ? 1 : -1;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  /** k éléments distincts, dans un ordre aléatoire. */
  sample<T>(items: readonly T[], k: number): T[] {
    return this.shuffle([...items]).slice(0, k);
  }
}

const SEED_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Graine courte, lisible et sans caractères ambigus (0/O, 1/I). */
export function randomSeed(length = 5): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => SEED_ALPHABET[b % SEED_ALPHABET.length]).join('');
}

export function isSeed(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9A-Za-z-]{1,16}$/.test(s);
}
