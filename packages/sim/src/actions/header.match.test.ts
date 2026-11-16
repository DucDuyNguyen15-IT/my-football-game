import { describe, expect, it } from 'vitest';
import { balanceSetup } from '../balance';
import { createMatch, step } from '../match';
import { NO_INPUT } from '../types';

describe('đánh đầu trong trận', () => {
  // Review Fable V1: hai người sát bóng từng đánh đầu qua lại mỗi tick (bóng leo 1,1 → 2,5 m).
  it('không có cú đánh đầu nào trong lúc khoá chạm bóng của cú đánh đầu trước còn hạn', () => {
    let s = createMatch(balanceSetup('easy', 5));
    let rapid = 0;
    let headers = 0;
    while (s.phase !== 'full_time' && s.phase !== 'shootout') {
      const prev = s;
      s = step(s, NO_INPUT);
      const lock = s.kickLock;
      if (
        lock?.touch === 'header' &&
        prev.kickLock !== lock &&
        prev.kickLock?.untilTick !== lock.untilTick
      ) {
        headers++;
        if (prev.kickLock?.touch !== undefined && s.tick < prev.kickLock.untilTick) rapid++;
      }
    }
    expect(headers).toBeGreaterThan(0);
    expect(rapid).toBe(0);
  });
});
