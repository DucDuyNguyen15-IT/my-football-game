// Tiện ích thống kê cho test phân phối (chi-bình phương) + PRNG có seed để test không flaky.
import type { Rng } from '../src/domain/rng';

/** mulberry32 → Rng tất định. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return (max) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * max);
  };
}

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

function lnGamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  const zz = z - 1;
  let x = LANCZOS[0]!;
  for (let i = 1; i < 9; i++) x += LANCZOS[i]! / (zz + i);
  const t = zz + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Q(a, x) = Γ(a, x) / Γ(a) — hàm gamma không đầy đủ chuẩn hoá phía trên. */
function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  const lnPre = -x + a * Math.log(x) - lnGamma(a);
  if (x < a + 1) {
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 1000; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
    }
    return 1 - sum * Math.exp(lnPre);
  }
  // Phân số liên tục (Lentz).
  let b = x + 1 - a;
  let c = 1e300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  return Math.exp(lnPre) * h;
}

/** p-value của thống kê chi-bình phương `stat` với `df` bậc tự do. */
export function chiSquarePValue(stat: number, df: number): number {
  return gammaQ(df / 2, stat / 2);
}

/** Thống kê chi-bình phương của tần suất quan sát so với xác suất kỳ vọng. */
export function chiSquareStat(observed: readonly number[], probs: readonly number[]): number {
  const n = observed.reduce((a, b) => a + b, 0);
  return observed.reduce((s, o, i) => {
    const e = n * probs[i]!;
    return s + (o - e) ** 2 / e;
  }, 0);
}
