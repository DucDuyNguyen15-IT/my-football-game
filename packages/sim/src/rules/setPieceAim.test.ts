import { describe, expect, it } from 'vitest';
import { length, vec2 } from '../math/vec2';
import { HALF_LENGTH } from '../pitch';
import { aimTarget, moveContact, rightOf, turnAim } from './setPieceAim';

describe('setPieceAim', () => {
  it('bên phải hướng +x (nhìn từ sau lưng, sim y = Three z) là +y', () => {
    expect(rightOf(vec2(1, 0))).toEqual(vec2(-0, 1));
  });

  it('xoay hướng ngắm: phải → lệch về bên phải, trái → bên trái, vẫn dài 1', () => {
    let a = vec2(1, 0);
    for (let i = 0; i < 30; i++) a = turnAim(a, 1);
    expect(a.y).toBeGreaterThan(0.4);
    expect(length(a)).toBeCloseTo(1, 9);
    let b = vec2(1, 0);
    for (let i = 0; i < 30; i++) b = turnAim(b, -1);
    expect(b.y).toBeLessThan(-0.4);
  });

  it('điểm chạm: mũi tên lên (move.y < 0) dời lên trên, không ra khỏi bóng', () => {
    let c = vec2(0, 0);
    for (let i = 0; i < 10; i++) c = moveContact(c, vec2(0, -1));
    expect(c.y).toBeGreaterThan(0);
    for (let i = 0; i < 200; i++) c = moveContact(c, vec2(1, -1));
    expect(length(c)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('điểm nhắm: tia ngắm cắt vạch cuối khung thành đối phương', () => {
    const t = aimTarget(vec2(HALF_LENGTH - 20, 0), vec2(0.8, 0.6), 1);
    expect(t.x).toBeCloseTo(HALF_LENGTH, 9);
    expect(t.y).toBeCloseTo(15, 9);
  });
});
