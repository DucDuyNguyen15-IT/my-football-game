import { describe, expect, it } from 'vitest';
import { TICK_DT, TICK_RATE } from './index';

describe('sim constants', () => {
  it('chạy 60 tick mỗi giây', () => {
    expect(TICK_RATE).toBe(60);
    expect(TICK_DT * TICK_RATE).toBeCloseTo(1);
  });
});

describe('API công khai', () => {
  it('export lõi mô phỏng, PRNG, sân, vec2 và đội demo', async () => {
    const sim = await import('./index');
    for (const name of [
      'createMatch',
      'step',
      'NO_INPUT',
      'seedRng',
      'nextFloat',
      'isInsidePitch',
      'starterLikeTeam',
      'cpuEasyTeam',
      'cpuHardTeam',
    ]) {
      expect(sim).toHaveProperty(name);
    }
    expect(sim.V.length({ x: 3, y: 4 })).toBe(5);
  });
});
