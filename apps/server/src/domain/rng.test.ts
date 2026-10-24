import { describe, expect, it, vi } from 'vitest';

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, randomInt: vi.fn(actual.randomInt) };
});

const crypto = await import('node:crypto');
const { cryptoRng } = await import('./rng');

describe('cryptoRng', () => {
  it('dùng crypto.randomInt (CSPRNG) và trả giá trị trong [0, max)', () => {
    for (let i = 0; i < 100; i++) {
      const v = cryptoRng(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
    expect(vi.mocked(crypto.randomInt)).toHaveBeenCalledWith(7);
  });
});
