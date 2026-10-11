import { describe, expect, it } from 'vitest';
import { AI_PROFILES } from './difficulty';

describe('AI_PROFILES', () => {
  const { easy, hard } = AI_PROFILES;

  it('Khó phản ứng nhanh hơn Dễ', () => {
    expect(hard.reactionDelayTicks).toBeLessThan(easy.reactionDelayTicks);
    expect(hard.reactionDelayTicks).toBeGreaterThanOrEqual(1);
  });

  it('Khó chuyền/sút chính xác hơn Dễ (hệ số sai số nhỏ hơn, không dưới 1)', () => {
    expect(hard.passErrorMult).toBeLessThan(easy.passErrorMult);
    expect(hard.shotErrorMult).toBeLessThan(easy.shotErrorMult);
    expect(hard.passErrorMult).toBeGreaterThanOrEqual(1);
    expect(hard.shotErrorMult).toBeGreaterThanOrEqual(1);
  });

  it('Khó hung hăng hơn Dễ, độ hung hăng trong [0, 1]', () => {
    expect(hard.aggression).toBeGreaterThan(easy.aggression);
    for (const p of Object.values(AI_PROFILES)) {
      expect(p.aggression).toBeGreaterThanOrEqual(0);
      expect(p.aggression).toBeLessThanOrEqual(1);
      expect(Number.isInteger(p.reactionDelayTicks)).toBe(true);
    }
  });
});
