import { describe, expect, it } from 'vitest';
import { SNAP_DISTANCE, lerpPos, shirtNumber } from './view';

describe('lerpPos', () => {
  it('nội suy tuyến tính giữa tick trước và tick hiện tại', () => {
    const prev = { x: 0, y: 0 };
    const curr = { x: 0.2, y: -0.1 };
    expect(lerpPos(prev, curr, 0)).toEqual(prev);
    expect(lerpPos(prev, curr, 1)).toEqual(curr);
    const mid = lerpPos(prev, curr, 0.5);
    expect(mid.x).toBeCloseTo(0.1);
    expect(mid.y).toBeCloseTo(-0.05);
  });

  it('dịch chuyển tức thời (xa hơn SNAP_DISTANCE) thì vẽ thẳng vị trí mới', () => {
    const curr = { x: SNAP_DISTANCE + 1, y: 0 };
    expect(lerpPos({ x: 0, y: 0 }, curr, 0.1)).toBe(curr);
  });
});

describe('shirtNumber', () => {
  it('GK = 1, P1–P6 = 2–7, B1–B5 = 8–12', () => {
    expect(shirtNumber('GK')).toBe(1);
    expect(shirtNumber('P1')).toBe(2);
    expect(shirtNumber('P6')).toBe(7);
    expect(shirtNumber('B1')).toBe(8);
    expect(shirtNumber('B5')).toBe(12);
  });
});
