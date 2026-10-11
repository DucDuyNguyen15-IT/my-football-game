import { describe, expect, it } from 'vitest';
import { nextFloat, nextGaussian, nextInt, seedRng, type RngState } from './rng';

/** Rút `n` giá trị liên tiếp, luồn state qua từng lần gọi. */
function draw<T>(seed: RngState, n: number, next: (s: RngState) => [T, RngState]): T[] {
  const out: T[] = [];
  let s = seed;
  for (let i = 0; i < n; i++) {
    const [v, s2] = next(s);
    out.push(v);
    s = s2;
  }
  return out;
}

describe('rng (mulberry32)', () => {
  it('cùng seed cho cùng chuỗi', () => {
    expect(draw(seedRng(42), 100, nextFloat)).toEqual(draw(seedRng(42), 100, nextFloat));
  });

  it('seed khác cho chuỗi khác', () => {
    expect(draw(seedRng(1), 10, nextFloat)).not.toEqual(draw(seedRng(2), 10, nextFloat));
  });

  it('state là số nguyên 32-bit không dấu (serialize được)', () => {
    const [, s] = nextFloat(seedRng(-7.9));
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(2 ** 32);
  });

  it('nextFloat nằm trong [0, 1)', () => {
    for (const v of draw(seedRng(7), 10_000, nextFloat)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt nằm trong [min, max] và ra đủ mọi giá trị', () => {
    const values = draw(seedRng(3), 2_000, (s) => nextInt(s, 1, 6));
    expect(new Set(values)).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });

  it('nextGaussian có trung bình ~0 và độ lệch chuẩn ~1', () => {
    const xs = draw(seedRng(11), 20_000, nextGaussian);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    expect(mean).toBeCloseTo(0, 1);
    expect(sd).toBeCloseTo(1, 1);
    expect(xs.every(Number.isFinite)).toBe(true);
  });
});
