/**
 * Mise en forme des nombres « à la française » : virgule décimale, signe moins
 * typographique, notation scientifique ×10ⁿ et préfixes SI pour les grandeurs physiques.
 */

const MINUS = '−';
const SUPERSCRIPTS: Record<string, string> = {
  '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

function frenchify(s: string): string {
  return s.replace('.', ',').replace(/^-/, MINUS);
}

/** Nombre avec `digits` chiffres significatifs, ex. fmt(2.50001) → "2,5". */
export function fmt(x: number, digits = 4): string {
  if (Number.isNaN(x)) return 'indéfini';
  if (x === Infinity) return '+∞';
  if (x === -Infinity) return `${MINUS}∞`;
  if (Math.abs(x) < 1e-12) return '0';
  const abs = Math.abs(x);
  if (abs >= 1e7 || abs < 1e-4) {
    const [mantissa, exp] = x.toExponential(digits - 1).split('e');
    const e = String(Number(exp)).replace(/./g, (c) => SUPERSCRIPTS[c] ?? c);
    return `${frenchify(trimZeros(mantissa))} × 10${e}`;
  }
  return frenchify(trimZeros(x.toPrecision(digits)));
}

/** Coordonnées d'un point : (2,5 ; −1). Le point-virgule évite l'ambiguïté avec la virgule décimale. */
export function fmtPoint(x: number, y: number, digits = 4): string {
  return `(${fmt(x, digits)} ; ${fmt(y, digits)})`;
}

const SI_PREFIXES: [number, string][] = [
  [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'],
];

/** Grandeur physique avec préfixe SI : fmtSI(0.0123, 'A') → "12,3 mA". */
export function fmtSI(x: number, unit: string, digits = 3): string {
  if (!Number.isFinite(x)) return `${fmt(x)} ${unit}`;
  const abs = Math.abs(x);
  if (abs < 1e-13) return `0 ${unit}`;
  for (const [factor, prefix] of SI_PREFIXES) {
    if (abs >= factor * 0.9995 || factor === 1e-12) {
      const v = x / factor;
      return `${frenchify(trimZeros(v.toPrecision(digits)))} ${prefix}${unit}`;
    }
  }
  return `${fmt(x)} ${unit}`;
}

/**
 * Lit une valeur saisie par l'utilisateur, avec virgule ou point décimal
 * et préfixes SI facultatifs : "4,7k" → 4700, "100µ" → 1e-4, "2.2 m" → 0.0022.
 */
export function parseSI(input: string): number {
  const s = input.trim().replace(',', '.').replace(/\s+/g, '').replace('−', '-');
  const m = /^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)([GMkmuµnp]?)[a-zA-ZΩ]*$/.exec(s);
  if (!m) return Number.NaN;
  const factors: Record<string, number> = { G: 1e9, M: 1e6, k: 1e3, '': 1, m: 1e-3, u: 1e-6, µ: 1e-6, n: 1e-9, p: 1e-12 };
  return parseFloat(m[1]) * factors[m[2]];
}
