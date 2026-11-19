/**
 * PRNG có seed (mulberry32). State là một số nguyên 32-bit không dấu nằm trong `MatchState`,
 * nên cùng seed + cùng chuỗi input = cùng kết quả (PRD §5). Mọi hàm thuần: trả về `[giá trị, state mới]`.
 */
import { cos2pi, ln } from './math/det';

export type RngState = number;

/** Chuẩn hoá seed bất kỳ thành uint32. */
export const seedRng = (seed: number): RngState => Math.trunc(seed) >>> 0;

/** Số thực trong [0, 1). */
export function nextFloat(state: RngState): [number, RngState] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

/** Số nguyên trong [min, max] (cả hai đầu). */
export function nextInt(state: RngState, min: number, max: number): [number, RngState] {
  const [f, next] = nextFloat(state);
  return [min + Math.floor(f * (max - min + 1)), next];
}

/** Phân phối chuẩn N(0, 1) (Box–Muller). */
export function nextGaussian(state: RngState): [number, RngState] {
  const [u1, s1] = nextFloat(state);
  const [u2, s2] = nextFloat(s1);
  // 1 - u1 nằm trong (0, 1] nên ln không bao giờ là -Infinity. ln/cos2pi thuần số học: giữ replay
  // giống nhau trên mọi engine JS (ADR-0011).
  return [Math.sqrt(-2 * ln(1 - u1)) * cos2pi(2 * Math.PI * u2), s2];
}
