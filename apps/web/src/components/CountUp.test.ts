import { describe, expect, it } from 'vitest';
import { countUpValue } from './CountUp';

describe('countUpValue (nguyên tắc 8: đếm số tăng dần)', () => {
  it('giữ đúng mốc đầu và cuối khi progress nằm trong hoặc ngoài [0, 1]', () => {
    expect(countUpValue(100, 350, 0)).toBe(100);
    expect(countUpValue(100, 350, -0.5)).toBe(100);
    expect(countUpValue(100, 350, 1)).toBe(350);
    expect(countUpValue(100, 350, 1.5)).toBe(350);
  });

  it('tăng nhanh lúc đầu và chậm dần về cuối (ease-out)', () => {
    const half = countUpValue(0, 1000, 0.5);
    expect(half).toBe(875);
    expect(countUpValue(500, 200, 0.5)).toBe(238);
  });
});
