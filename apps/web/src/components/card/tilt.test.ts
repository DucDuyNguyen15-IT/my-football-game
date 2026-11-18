import { describe, expect, it } from 'vitest';
import { computeCardTilt } from './tilt';

describe('computeCardTilt (nguyên tắc 11: thẻ nghiêng theo chuột ≤ 8°)', () => {
  const rect = { left: 100, top: 200, width: 200, height: 280 };

  it('tâm thẻ trả về góc nghiêng 0', () => {
    expect(computeCardTilt(200, 340, rect)).toEqual({ rx: 0, ry: 0 });
  });

  it('góc phải trên nghiêng trong ngưỡng ±7° và không vượt 8° kể cả khi truyền maxDeg lớn', () => {
    expect(computeCardTilt(300, 200, rect)).toEqual({ rx: 7, ry: 7 });
    expect(computeCardTilt(100, 480, rect)).toEqual({ rx: -7, ry: -7 });
    expect(computeCardTilt(999, -500, rect, 20)).toEqual({ rx: 8, ry: 8 });
  });

  it('kích thước 0 trả về 0,0', () => {
    expect(computeCardTilt(10, 10, { left: 0, top: 0, width: 0, height: 100 })).toEqual({
      rx: 0,
      ry: 0,
    });
  });
});
