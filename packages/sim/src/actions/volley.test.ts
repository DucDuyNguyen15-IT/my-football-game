import { describe, expect, it } from 'vitest';
import { vec2 } from '../math/vec2';
import { HALF_LENGTH } from '../pitch';
import { seedRng } from '../rng';
import type { BallState, PlayerState } from '../types';
import { SCISSOR_CHANCE_RANGE, scissorChance, tryScissor } from './volley';

// Đội nhà hiệp 1 tấn công về +x: vòng cấm đối phương ở x ≥ HALF_LENGTH − 12.
const striker = (shooting: number, x = HALF_LENGTH - 6): PlayerState =>
  ({
    id: 'home-P6',
    team: 'home',
    position: 'FW',
    pos: vec2(x, 0),
    vel: vec2(0, 0),
    facing: vec2(1, 0),
    stamina: 100,
    stats: { shooting },
  }) as PlayerState;
const ball = (x: number, z: number): BallState => ({
  pos: vec2(x, 0.5),
  vel: vec2(0, -8),
  z,
  vz: -2,
});

/** Số lần móc bóng trên 200 seed. */
function count(p: PlayerState, now: BallState, before: BallState): number {
  let n = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const r = tryScissor([p], [p], now, before, 1, () => true, seedRng(seed));
    if (r.kicker) n++;
  }
  return n;
}

describe('móc bóng', () => {
  it('tỉ lệ: Sút dưới 70 không bao giờ, 70 → 99 tăng dần', () => {
    expect(scissorChance(69)).toBe(0);
    expect(scissorChance(70)).toBeCloseTo(SCISSOR_CHANCE_RANGE[0]);
    expect(scissorChance(99)).toBeCloseTo(SCISSOR_CHANCE_RANGE[1]);
    expect(scissorChance(85)).toBeGreaterThan(scissorChance(75));
  });

  it('chỉ thử lúc bóng bổng vừa vào tầm, trong vòng cấm đối phương, người Sút cao', () => {
    const x = HALF_LENGTH - 6;
    const arriving = [ball(x, 1.4), ball(x, 2.5)] as const; // tick trước còn cao quá tầm
    const n = count(striker(90), ...arriving);
    expect(n).toBeGreaterThan(40);
    expect(n).toBeLessThan(160);
    expect(count(striker(60), ...arriving)).toBe(0);
    // Ngoài vòng cấm.
    expect(count(striker(90, 0), ball(0, 1.4), ball(0, 2.5))).toBe(0);
    // Đã trong tầm từ tick trước (đã gieo rồi), bóng thấp (khống chế bằng chân), bóng quá cao.
    expect(count(striker(90), ball(x, 1.4), ball(x, 1.5))).toBe(0);
    expect(count(striker(90), ball(x, 0.8), ball(x, 2.5))).toBe(0);
    expect(count(striker(90), ball(x, 2.2), ball(x, 2.5))).toBe(0);
  });

  it('móc bóng đi về phía khung thành, rời chân ở độ cao đang bay', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const x = HALF_LENGTH - 6;
      const r = tryScissor(
        [striker(99)],
        [striker(99)],
        ball(x, 1.4),
        ball(x, 2.5),
        1,
        () => true,
        seedRng(seed),
      );
      if (!r.kicker) continue;
      expect(r.ball.vel.x).toBeGreaterThan(0);
      expect(r.ball.z).toBe(1.4);
      return;
    }
    throw new Error('50 seed không có lần móc bóng nào');
  });
});
