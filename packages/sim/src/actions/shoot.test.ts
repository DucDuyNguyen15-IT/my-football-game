import type { PlayerStats } from '@pitch/shared';
import { describe, expect, it } from 'vitest';
import { length, vec2, ZERO, type Vec2 } from '../math/vec2';
import { stepBall } from '../physics/ball';
import { GOAL_WIDTH, HALF_LENGTH } from '../pitch';
import { seedRng } from '../rng';
import { TICK_RATE } from '../tick';
import type { BallState, PlayerState } from '../types';
import {
  MAX_CHARGE_TICKS,
  MIN_SHOT_POWER,
  SHOT_MAX_VZ,
  attackSign,
  shootBall,
  shotPower,
  shotTarget,
} from './shoot';

const STATS: PlayerStats = {
  pace: 70,
  shooting: 70,
  passing: 70,
  dribbling: 70,
  defending: 70,
  stamina: 70,
  reflexes: 30,
  handling: 30,
  positioning: 30,
  kicking: 30,
};

function shooter(stats: Partial<PlayerStats> = {}, stamina = 100): PlayerState {
  return {
    id: 'home-P6',
    team: 'home',
    slot: 'P6',
    position: 'FW',
    pos: ZERO,
    vel: ZERO,
    facing: vec2(1, 0),
    stamina,
    stats: { ...STATS, ...stats },
  };
}

describe('shotPower — giữ K để nạp lực', () => {
  it('chạm nhẹ = lực tối thiểu, giữ đủ = hết lực, giữ lâu hơn không tăng thêm', () => {
    expect(shotPower(0)).toBe(MIN_SHOT_POWER);
    expect(shotPower(MAX_CHARGE_TICKS)).toBe(1);
    expect(shotPower(MAX_CHARGE_TICKS * 3)).toBe(1);
    expect(shotPower(MAX_CHARGE_TICKS / 2)).toBeGreaterThan(MIN_SHOT_POWER);
    expect(shotPower(MAX_CHARGE_TICKS / 2)).toBeLessThan(1);
  });
});

describe('attackSign / shotTarget', () => {
  it('đội nhà tấn công về +x ở hiệp 1, đổi chiều ở hiệp 2; đội khách ngược lại', () => {
    expect(attackSign('home', 1)).toBe(1);
    expect(attackSign('away', 1)).toBe(-1);
    expect(attackSign('home', 2)).toBe(-1);
    expect(attackSign('away', 2)).toBe(1);
  });

  it('nhắm giữa khung thành khi không bấm hướng, lệch về cột khi bấm ngang, luôn trong khung', () => {
    expect(shotTarget(1, 0)).toEqual(vec2(HALF_LENGTH, 0));
    expect(shotTarget(-1, 0)).toEqual(vec2(-HALF_LENGTH, 0));
    const left = shotTarget(1, 1);
    expect(left.y).toBeGreaterThan(0);
    expect(left.y).toBeLessThan(GOAL_WIDTH / 2);
    expect(shotTarget(1, 5)).toEqual(left);
  });
});

describe('shootBall', () => {
  const from = vec2(HALF_LENGTH - 20, 0);
  const target = shotTarget(1, 0);

  it('bóng bay về phía khung thành, nạp lực nhiều thì nhanh hơn', () => {
    const weak = shootBall(shooter(), from, target, MIN_SHOT_POWER, seedRng(1)).ball;
    const hard = shootBall(shooter(), from, target, 1, seedRng(1)).ball;
    expect(hard.vel.x).toBeGreaterThan(0);
    expect(length(hard.vel)).toBeGreaterThan(length(weak.vel));
  });

  it('Sút cao thì cú sút hết lực nhanh hơn', () => {
    const a = shootBall(shooter({ shooting: 90 }), from, target, 1, seedRng(1)).ball;
    const b = shootBall(shooter({ shooting: 40 }), from, target, 1, seedRng(1)).ball;
    expect(length(a.vel)).toBeGreaterThan(length(b.vel));
  });

  it('sút nhẹ từ xa vẫn đi thấp, không bay vọt lên trời', () => {
    const far = vec2(HALF_LENGTH - 40, 0);
    for (const shooting of [1, 99]) {
      const { ball } = shootBall(shooter({ shooting }), far, target, MIN_SHOT_POWER, seedRng(1));
      expect(ball.vz).toBeLessThanOrEqual(SHOT_MAX_VZ);
    }
  });

  it.each([0, Number.NaN])('lực %s không làm hỏng state bóng', (power) => {
    const { ball } = shootBall(shooter(), from, target, power, seedRng(1));
    expect(Number.isFinite(ball.vz) && Number.isFinite(ball.vel.x)).toBe(true);
  });

  it('cùng PRNG → cùng cú sút', () => {
    expect(shootBall(shooter(), from, target, 1, seedRng(9))).toEqual(
      shootBall(shooter(), from, target, 1, seedRng(9)),
    );
  });
});

/** Tỉ lệ vào khung thành (không thủ môn) của 1.000 cú sút cùng tình huống, seed 0…999. */
function onTargetRate(p: PlayerState, from: Vec2 = vec2(HALF_LENGTH - 20, 0)): number {
  const N = 1000;
  let goals = 0;
  for (let seed = 0; seed < N; seed++) {
    let b: BallState = shootBall(p, from, shotTarget(1, 0), 1, seedRng(seed)).ball;
    for (let t = 0; t < 5 * TICK_RATE; t++) {
      const r = stepBall(b, 'home');
      b = r.ball;
      if (r.events.length > 0) {
        if (r.events[0]!.type === 'goal') goals++;
        break;
      }
    }
  }
  return goals / N;
}

describe('độ chính xác sút', () => {
  it('PRD §5: Sút 90 vào khung thành nhiều hơn Sút 55 ít nhất 25 điểm %', () => {
    const s90 = onTargetRate(shooter({ shooting: 90 }));
    const s55 = onTargetRate(shooter({ shooting: 55 }));
    expect(s90 - s55).toBeGreaterThanOrEqual(0.25);
    expect(s90).toBeGreaterThan(0.85);
  });

  it('mệt (thể lực 10%) sút kém chính xác hơn lúc khoẻ', () => {
    expect(onTargetRate(shooter({ shooting: 75 }, 10))).toBeLessThan(
      onTargetRate(shooter({ shooting: 75 }, 100)),
    );
  });
});
