import { describe, expect, it } from 'vitest';
import { TICK_DT, TICK_RATE } from './index';

describe('sim constants', () => {
  it('chạy 60 tick mỗi giây', () => {
    expect(TICK_RATE).toBe(60);
    expect(TICK_DT * TICK_RATE).toBeCloseTo(1);
  });
});
