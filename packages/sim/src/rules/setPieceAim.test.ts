import { describe, expect, it } from 'vitest';
import { length, vec2 } from '../math/vec2';
import { cpuEasyTeam, starterLikeTeam } from '../fixtures/demoTeams';
import { createMatch } from '../match';
import { HALF_LENGTH, PENALTY_SPOT_DIST } from '../pitch';
import { seedRng } from '../rng';
import {
  aimTarget,
  contactKick,
  kickWithContact,
  moveContact,
  movePenaltyAim,
  PENALTY_AIM_MAX_Y,
  PENALTY_OVERPOWER_FROM,
  penaltyAimZ,
  penaltyRadius,
  penaltyShot,
  rightOf,
  turnAim,
} from './setPieceAim';

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

  it('contactKick: lệch phải → xoáy cong trái; thấp → bổng, xoáy ngược; cao → chìm; giữa → căng', () => {
    const right = contactKick(vec2(1, 0));
    expect(right.spinSide).toBeLessThan(0);
    expect(contactKick(vec2(-1, 0)).spinSide).toBeGreaterThan(0);
    const low = contactKick(vec2(0, -1));
    expect(low.vzMult).toBeGreaterThan(1);
    expect(low.spinTop).toBeLessThan(0);
    const high = contactKick(vec2(0, 1));
    expect(high.vzMult).toBeLessThan(1);
    expect(high.spinTop).toBeGreaterThan(0);
    const mid = contactKick(vec2(0, 0));
    expect(mid).toEqual({ spinSide: 0, spinTop: 0, vzMult: 1, speedMult: 1 });
    expect(Object.is(mid.spinSide, -0)).toBe(false);
    expect(right.speedMult).toBeLessThan(mid.speedMult);
  });

  it('kickWithContact: chạm giữa giữ nguyên bóng', () => {
    const ball = { pos: vec2(0, 0), vel: vec2(20, 0), z: 0, vz: 3 };
    expect(kickWithContact(ball, undefined)).toBe(ball);
    expect(kickWithContact(ball, vec2(0, 0))).toBe(ball);
    expect(kickWithContact(ball, vec2(0, -1)).vz).toBeGreaterThan(3);
  });
});

describe('ngắm phạt đền', () => {
  const shooter = createMatch({
    home: starterLikeTeam,
    away: cpuEasyTeam,
    seed: 1,
    difficulty: 'easy',
  }).players.find((p) => p.id === 'home-P6')!;

  it('mũi tên phải dời vòng sang phải nhìn từ sau lưng (cả hai chiều tấn công), kẹp ngoài cột', () => {
    expect(movePenaltyAim(0, 1, 1)).toBeGreaterThan(0);
    expect(movePenaltyAim(0, 1, -1)).toBeLessThan(0);
    let y = 0;
    for (let i = 0; i < 1000; i++) y = movePenaltyAim(y, 1, 1);
    expect(y).toBe(PENALTY_AIM_MAX_Y);
  });

  it('lực mạnh hơn thì vòng to và cao hơn; quá lực nở thêm; mệt cũng nở', () => {
    const base = penaltyRadius(shooter, 0.6);
    const atLimit = penaltyRadius(shooter, PENALTY_OVERPOWER_FROM);
    expect(penaltyRadius(shooter, 0.3)).toBeLessThan(base);
    expect(atLimit).toBeGreaterThan(base);
    // Quá lực: nở nhanh hơn hẳn so với đoạn trước ngưỡng.
    expect(penaltyRadius(shooter, 1) - atLimit).toBeGreaterThan(atLimit - base);
    expect(penaltyRadius({ ...shooter, stamina: 5 }, 0.6)).toBeGreaterThan(base);
    expect(penaltyAimZ(1)).toBeGreaterThan(penaltyAimZ(0.6));
    expect(penaltyAimZ(0.6)).toBeGreaterThan(penaltyAimZ(0.3));
  });

  it('bóng tới vạch cuối trong vòng tròn quanh tâm ngắm; cùng PRNG thì cùng kết quả', () => {
    const spot = vec2(HALF_LENGTH - PENALTY_SPOT_DIST, 0);
    const r = penaltyRadius(shooter, 0.8);
    for (let seed = 1; seed <= 50; seed++) {
      const { ball } = penaltyShot(shooter, spot, 1, 1.5, 0.8, seedRng(seed));
      const t = (HALF_LENGTH - spot.x) / ball.vel.x;
      expect(Math.abs(ball.vel.y * t - 1.5)).toBeLessThanOrEqual(r + 1e-9);
      expect(penaltyShot(shooter, spot, 1, 1.5, 0.8, seedRng(seed)).ball).toEqual(ball);
    }
  });
});
