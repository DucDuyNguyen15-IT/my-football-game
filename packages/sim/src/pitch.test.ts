import { describe, expect, it } from 'vitest';
import {
  CENTER_CIRCLE_RADIUS,
  GOAL_WIDTH,
  HALF_LENGTH,
  HALF_WIDTH,
  PENALTY_AREA_DEPTH,
  PENALTY_AREA_WIDTH,
  PITCH_LENGTH,
  PITCH_WIDTH,
  isInsidePitch,
} from './pitch';

describe('pitch 7v7', () => {
  it('sân 60×40 m, gốc toạ độ ở tâm sân', () => {
    expect([PITCH_LENGTH, PITCH_WIDTH]).toEqual([60, 40]);
    expect([HALF_LENGTH, HALF_WIDTH]).toEqual([30, 20]);
  });

  it('khung thành nằm trong vòng cấm, vòng cấm nằm trong sân', () => {
    expect(GOAL_WIDTH).toBeLessThan(PENALTY_AREA_WIDTH);
    expect(PENALTY_AREA_WIDTH).toBeLessThan(PITCH_WIDTH);
    expect(PENALTY_AREA_DEPTH + CENTER_CIRCLE_RADIUS).toBeLessThan(HALF_LENGTH);
  });

  it('isInsidePitch: tính cả điểm nằm trên vạch', () => {
    expect(isInsidePitch({ x: 0, y: 0 })).toBe(true);
    expect(isInsidePitch({ x: HALF_LENGTH, y: -HALF_WIDTH })).toBe(true);
    expect(isInsidePitch({ x: HALF_LENGTH + 0.01, y: 0 })).toBe(false);
    expect(isInsidePitch({ x: 0, y: HALF_WIDTH + 0.01 })).toBe(false);
  });
});
