import { randomInt } from 'node:crypto';

/** Nguồn ngẫu nhiên: số nguyên đều trong [0, maxExclusive). Domain nhận tham số này để test bằng PRNG có seed. */
export type Rng = (maxExclusive: number) => number;

/** CSPRNG cho production (gacha, ép thẻ, seed trận) — không bao giờ dùng `Math.random`. */
export const cryptoRng: Rng = (maxExclusive) => randomInt(maxExclusive);
