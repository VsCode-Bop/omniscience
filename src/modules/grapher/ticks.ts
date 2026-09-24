import { fmt } from '../../core/math/format';
import { niceStep } from '../../core/math/numeric';

export interface AxisTicks {
  major: { value: number; label: string }[];
  minor: number[];
}

const MAX_TICKS = 400;

function range(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  const start = Math.ceil(min / step);
  const end = Math.floor(max / step);
  if (end - start > MAX_TICKS) return out;
  for (let k = start; k <= end; k++) out.push(k * step);
  return out;
}

/** Graduations décimales : pas 1, 2 ou 5 × 10ⁿ, environ tous les `targetPx` pixels. */
export function linearTicks(min: number, max: number, pxPerUnit: number, targetPx = 90): AxisTicks {
  const step = niceStep(targetPx / pxPerUnit);
  const mantissa = Math.round(step / 10 ** Math.floor(Math.log10(step)));
  const minorStep = step / (mantissa === 2 ? 4 : 5);
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const major = range(min, max, step).map((v) => {
    const value = Math.abs(v) < step * 1e-9 ? 0 : v;
    return { value, label: decimals > 6 || Math.abs(value) >= 1e7 ? fmt(value, 3) : fmt(Number(value.toFixed(decimals)), 12) };
  });
  return { major, minor: range(min, max, minorStep) };
}

/** Écriture d'un multiple rationnel de π : 0, π, −π/2, 3π/4… */
export function piLabel(num: number, den: number): string {
  if (num === 0) return '0';
  const g = gcd(Math.abs(num), den);
  const n = num / g;
  const d = den / g;
  const sign = n < 0 ? '−' : '';
  const a = Math.abs(n);
  const top = a === 1 ? 'π' : `${a}π`;
  return d === 1 ? `${sign}${top}` : `${sign}${top}/${d}`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Graduations en multiples de π (trigonométrie). */
export function piTicks(min: number, max: number, pxPerUnit: number, targetPx = 90): AxisTicks {
  // Pas candidats exprimés en fractions de π : [numérateur, dénominateur].
  const candidates: [number, number][] = [[1, 12], [1, 6], [1, 4], [1, 3], [1, 2], [1, 1], [2, 1], [4, 1], [8, 1], [16, 1], [32, 1]];
  const [sn, sd] = candidates.find(([n, d]) => (n / d) * Math.PI * pxPerUnit >= targetPx) ?? [64, 1];
  const step = (sn / sd) * Math.PI;
  if ((max - min) / step > MAX_TICKS) return linearTicks(min, max, pxPerUnit, targetPx);
  const major = range(min, max, step).map((v) => {
    const k = Math.round(v / step);
    return { value: k * step, label: piLabel(k * sn, sd) };
  });
  const minorDiv = sd === 1 && sn === 1 ? 4 : 2;
  return { major, minor: range(min, max, step / minorDiv) };
}
