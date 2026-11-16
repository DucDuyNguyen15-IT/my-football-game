import { length, sub } from '../math/vec2';
import { isInPenaltyArea } from '../pitch';
import { nextFloat, type RngState } from '../rng';
import { CONTROL_HEIGHT } from '../rules/possession';
import type { BallState, PlayerState } from '../types';
import { attackSign, shootBall, shotTarget } from './shoot';

/**
 * Móc bóng (scissor kick): bóng bổng tới ngang hông–vai (cao hơn tầm khống chế bằng chân) sát một
 * cầu thủ tấn công đứng trong vòng cấm đối phương. Chỉ người Sút từ `SCISSOR_MIN_SHOOTING` trở lên
 * mới thử, tỉ lệ tăng theo Sút; gieo một lần lúc bóng vừa vào tầm với (không gieo lại mỗi tick).
 */
export const SCISSOR_MAX_Z = 1.9;
/** Tâm bóng cách người không quá chừng này (m, theo phương ngang) thì với tới. */
export const SCISSOR_REACH = 1;
/** Sút dưới mức này (thẻ trung bình trở xuống) không bao giờ móc bóng. */
export const SCISSOR_MIN_SHOOTING = 70;
/** Tỉ lệ thử móc bóng ở Sút 70 → 99. */
export const SCISSOR_CHANCE_RANGE = [0.2, 0.55] as const;
/** Động tác khó: sai số lớn hơn sút thường. */
export const SCISSOR_ERROR_MULT = 1.8;
export const SCISSOR_POWER = 0.85;

/** Tỉ lệ thử móc bóng theo Sút (0 khi dưới ngưỡng). */
export function scissorChance(shooting: number): number {
  if (shooting < SCISSOR_MIN_SHOOTING) return 0;
  const [lo, hi] = SCISSOR_CHANCE_RANGE;
  return (
    lo + ((Math.min(99, shooting) - SCISSOR_MIN_SHOOTING) * (hi - lo)) / (99 - SCISSOR_MIN_SHOOTING)
  );
}

const inReach = (p: PlayerState, ball: BallState) =>
  ball.z > CONTROL_HEIGHT &&
  ball.z <= SCISSOR_MAX_Z &&
  length(sub(ball.pos, p.pos)) <= SCISSOR_REACH;

/**
 * Thử móc bóng ở tick này. `before`/`prevBall`: người và bóng tick trước (để chỉ gieo lúc vừa vào
 * tầm). `eligible`: người được chạm bóng (không bị khoá, không nằm sân). Trả người móc và bóng mới,
 * hoặc null; PRNG chỉ tiến khi có người đủ điều kiện gieo.
 */
export function tryScissor(
  players: readonly PlayerState[],
  before: readonly PlayerState[],
  ball: BallState,
  prevBall: BallState,
  half: 1 | 2,
  eligible: (p: PlayerState) => boolean,
  rng: RngState,
): { kicker: PlayerState; ball: BallState; rng: RngState } | { kicker: null; rng: RngState } {
  for (const p of players) {
    const sign = attackSign(p.team, half);
    if (scissorChance(p.stats.shooting) === 0 || !eligible(p)) continue;
    if (!isInPenaltyArea(p.pos, sign) || !inReach(p, ball)) continue;
    const prev = before.find((b) => b.id === p.id);
    if (prev && inReach(prev, prevBall)) continue;
    const [roll, r1] = nextFloat(rng);
    rng = r1;
    if (roll >= scissorChance(p.stats.shooting)) continue;
    const [aim, r2] = nextFloat(rng);
    const target = shotTarget(sign, aim * 2 - 1);
    const kicked = shootBall(p, ball.pos, target, SCISSOR_POWER, r2, SCISSOR_ERROR_MULT);
    // Bóng rời chân ở độ cao đang bay (shootBall tính từ mặt cỏ): bớt vận tốc đứng cho vẫn tới khung.
    const flight = Math.max(length(sub(target, ball.pos)), 1) / length(kicked.ball.vel);
    return {
      kicker: p,
      ball: { ...kicked.ball, z: ball.z, vz: kicked.ball.vz - ball.z / flight },
      rng: kicked.rng,
    };
  }
  return { kicker: null, rng };
}
