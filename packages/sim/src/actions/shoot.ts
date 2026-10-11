import { length, scale, sub, vec2, type Vec2 } from '../math/vec2';
import { GRAVITY } from '../physics/ball';
import { HALF_LENGTH } from '../pitch';
import { nextGaussian, type RngState } from '../rng';
import { fatigueFactor, shotAngleErrFor, shotHeightErrFor, shotSpeedFor } from '../stats/params';
import type { BallState, PlayerState, TeamSide } from '../types';
import { deviate } from './aim';

/** Giữ K đủ số tick này (1 s) thì sút hết lực. */
export const MAX_CHARGE_TICKS = 60;
/** Lực khi chỉ chạm nhẹ K (tỉ lệ so với hết lực). */
export const MIN_SHOT_POWER = 0.3;
/** Bấm ngang hết cỡ khi sút thì nhắm lệch khỏi giữa khung thành bấy nhiêu mét. */
export const SHOT_AIM_Y = 1.6;
/** Độ cao đáy bóng (m) dự định khi bóng tới vạch cuối. */
export const SHOT_AIM_HEIGHT = 0.8;
/** Trần vận tốc đứng khi sút (m/s): cú sút nhẹ từ xa đi thấp rồi lăn, không thành bóng bổng. */
export const SHOT_MAX_VZ = 8;

/** Lực sút (MIN_SHOT_POWER…1) theo số tick đã giữ K. */
export function shotPower(chargeTicks: number): number {
  const t = Math.min(1, Math.max(0, chargeTicks) / MAX_CHARGE_TICKS);
  return MIN_SHOT_POWER + (1 - MIN_SHOT_POWER) * t;
}

/** Chiều tấn công theo trục x: đội nhà về +x ở hiệp 1, hai đội đổi sân sau giờ nghỉ. */
export function attackSign(team: TeamSide, half: 1 | 2): 1 | -1 {
  return (team === 'home') === (half === 1) ? 1 : -1;
}

/** Điểm nhắm trên vạch cuối khung thành phía `sign`; `aimY` ∈ [−1, 1] lệch về hai cột (toạ độ sân). */
export function shotTarget(sign: 1 | -1, aimY: number): Vec2 {
  const y = Math.min(1, Math.max(-1, aimY)) * SHOT_AIM_Y;
  // 0 + y để không sinh -0 trong state.
  return vec2(sign * HALF_LENGTH, 0 + y);
}

/**
 * Sút từ `from` về `target` với lực `power` (0–1). Sai số góc và độ cao theo Sút, nhân lên khi mệt.
 * Hàm thuần: trả về bóng mới và PRNG đã tiến.
 */
export function shootBall(
  shooter: PlayerState,
  from: Vec2,
  target: Vec2,
  power: number,
  rng: RngState,
): { ball: BallState; rng: RngState } {
  const fatigue = fatigueFactor(shooter.stamina);
  const offset = sub(target, from);
  const dist = length(offset);
  const [dir, r1] = deviate(
    dist > 0 ? offset : shooter.facing,
    shotAngleErrFor(shooter.stats.shooting) / fatigue,
    rng,
  );
  const [g, r2] = nextGaussian(r1);
  // Lực không hợp lệ (NaN, ≤ 0) coi như chạm nhẹ để bóng luôn có vận tốc hữu hạn.
  const p = Number.isFinite(power) ? Math.min(1, Math.max(MIN_SHOT_POWER, power)) : MIN_SHOT_POWER;
  const speed = shotSpeedFor(shooter.stats.shooting) * p;
  // Vận tốc đứng để (bỏ qua cản gió) đáy bóng ở SHOT_AIM_HEIGHT khi tới khung thành.
  const flightTime = Math.max(dist, 1) / speed;
  const vz =
    SHOT_AIM_HEIGHT / flightTime +
    0.5 * GRAVITY * flightTime +
    (g * shotHeightErrFor(shooter.stats.shooting)) / fatigue;
  return {
    ball: { pos: from, vel: scale(dir, speed), z: 0, vz: Math.min(SHOT_MAX_VZ, Math.max(0, vz)) },
    rng: r2,
  };
}
