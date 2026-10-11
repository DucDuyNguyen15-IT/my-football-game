import { describe, expect, it } from 'vitest';
import { add, clampLength, dot, length, normalize, scale, sub, vec2 } from './vec2';

describe('vec2', () => {
  it('cộng và trừ theo từng thành phần', () => {
    expect(add(vec2(1, 2), vec2(3, -5))).toEqual({ x: 4, y: -3 });
    expect(sub(vec2(1, 2), vec2(3, -5))).toEqual({ x: -2, y: 7 });
  });

  it('nhân vô hướng', () => {
    expect(scale(vec2(1, -2), 3)).toEqual({ x: 3, y: -6 });
  });

  it('độ dài và tích vô hướng', () => {
    expect(length(vec2(3, 4))).toBe(5);
    expect(dot(vec2(1, 2), vec2(3, 4))).toBe(11);
  });

  it('chuẩn hoá về độ dài 1, vector 0 giữ nguyên là 0', () => {
    const n = normalize(vec2(3, 4));
    expect(n.x).toBeCloseTo(0.6);
    expect(n.y).toBeCloseTo(0.8);
    expect(normalize(vec2(0, 0))).toEqual({ x: 0, y: 0 });
  });

  it('kẹp độ dài: dài hơn max thì co về max, ngắn hơn thì giữ nguyên', () => {
    expect(length(clampLength(vec2(30, 40), 10))).toBeCloseTo(10);
    expect(clampLength(vec2(3, 4), 10)).toEqual({ x: 3, y: 4 });
  });

  it('không sửa vector đầu vào', () => {
    const a = vec2(1, 1);
    add(a, vec2(1, 1));
    scale(a, 5);
    expect(a).toEqual({ x: 1, y: 1 });
  });
});
