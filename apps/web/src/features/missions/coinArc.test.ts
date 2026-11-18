import { describe, expect, it } from 'vitest';
import { buildArcPoints, quadraticBezierPoint } from './coinArc';

describe('coinArc (nguyên tắc 7: xu bay theo đường cong)', () => {
  it('quadraticBezierPoint bắt đầu ở p0, qua đỉnh cong gần p1, kết thúc ở p2', () => {
    const p0 = { x: 0, y: 100 };
    const p1 = { x: 50, y: 0 };
    const p2 = { x: 100, y: 100 };
    expect(quadraticBezierPoint(p0, p1, p2, 0)).toEqual(p0);
    expect(quadraticBezierPoint(p0, p1, p2, 1)).toEqual(p2);
    expect(quadraticBezierPoint(p0, p1, p2, 0.5)).toEqual({ x: 50, y: 50 });
  });

  it('buildArcPoints tạo cung cong (điểm giữa võng lên cao hơn đường thẳng)', () => {
    const pts = buildArcPoints({ x: 800, y: 400 }, { x: 900, y: 30 }, 4, 80);
    expect(pts).toHaveLength(5);
    expect(pts[0]).toEqual({ x: 800, y: 400 });
    expect(pts[4]).toEqual({ x: 900, y: 30 });
    const mid = pts[2]!;
    const straightMidY = (400 + 30) / 2;
    expect(mid.y).toBeLessThan(straightMidY);
  });
});
