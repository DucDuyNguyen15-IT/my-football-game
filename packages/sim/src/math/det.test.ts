import { describe, expect, it } from 'vitest';
import { cos2pi, ln } from './det';

describe('hàm số học tất định', () => {
  it('ln khớp Math.log trên (0, 1]', () => {
    for (const x of [2 ** -32, 1e-6, 0.001, 0.1, 0.4999, 0.5, 0.7, 0.999999, 1]) {
      expect(Math.abs(ln(x) - Math.log(x))).toBeLessThan(1e-12);
    }
    expect(Math.abs(ln(37.5) - Math.log(37.5))).toBeLessThan(1e-12);
  });

  it('cos2pi khớp Math.cos trên [0, 2π]', () => {
    for (let i = 0; i <= 2000; i++) {
      const t = (i / 2000) * 2 * Math.PI;
      expect(Math.abs(cos2pi(t) - Math.cos(t))).toBeLessThan(1e-12);
    }
  });
});

describe('ln quanh 1', () => {
  it('ln(1) đúng bằng 0 và ln(x) ≤ 0 trên (0, 1]', () => {
    expect(ln(1)).toBe(0);
    for (let j = 0; j < 2000; j++) expect(ln(1 - j / 2 ** 32)).toBeLessThanOrEqual(0);
  });
});
