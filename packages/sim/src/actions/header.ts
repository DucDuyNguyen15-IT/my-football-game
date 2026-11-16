import { add, length, normalize, scale, sub, vec2, type Vec2 } from '../math/vec2';
import { isInPenaltyArea } from '../pitch';
import { nextFloat, nextGaussian, type RngState } from '../rng';
import { CONTROL_HEIGHT } from '../rules/possession';
import { GK_REACH_HEIGHT } from '../stats/params';
import type { BallState, PlayerState, TeamSide } from '../types';
import { attackSign, shootBall, shotTarget } from './shoot';

/*
 * Bóng bổng cao hơn tầm khống chế bằng chân (CONTROL_HEIGHT): thủ môn trong vòng cấm nhà bắt dính,
 * không thì cầu thủ gần nhất trong tầm đánh đầu. Chỉ dùng + − × ÷ sqrt để tất định.
 */

/** Bật nhảy đánh đầu tới bóng cao chừng này (m). */
export const HEADER_MAX_Z = 2.5;
/** Tâm bóng cách người không quá chừng này (m, phương ngang) thì đánh đầu được. */
export const HEADER_REACH = 0.9;
/** Thủ môn băng ra bắt bóng bổng trong tầm này (m). */
export const KEEPER_CLAIM_REACH = 1.3;
/** Đánh đầu ghi bàn: lực và sai số so với sút chân. */
export const HEADER_SHOT_POWER = 0.5;
export const HEADER_SHOT_ERROR_MULT = 1.6;
/** Đánh đầu phá/chuyền: tốc độ ngang (m/s), vận tốc đứng (m/s), độ lệch hướng (tỉ lệ ngang). */
export const HEADER_PASS_SPEED = 11;
export const HEADER_PASS_VZ = 3;
export const HEADER_PASS_SPREAD = 0.25;

/** Thủ môn (không bị cấm dùng tay vì bóng chuyền về) bắt bóng bổng trong vòng cấm nhà, null nếu không. */
export function keeperClaim(
  players: readonly PlayerState[],
  ball: BallState,
  half: 1 | 2,
  lockedId: string | null,
  backPass: TeamSide | null,
): PlayerState | null {
  if (ball.z <= CONTROL_HEIGHT || ball.z > GK_REACH_HEIGHT) return null;
  for (const p of players) {
    if (p.position !== 'GK' || p.id === lockedId || p.team === backPass) continue;
    if (!isInPenaltyArea(p.pos, -attackSign(p.team, half) as 1 | -1)) continue;
    if (length(sub(ball.pos, p.pos)) <= KEEPER_CLAIM_REACH) return p;
  }
  return null;
}

/**
 * Cầu thủ (không phải thủ môn) gần bóng nhất trong tầm đánh đầu. Trong vòng cấm đối phương thì đánh
 * đầu về khung thành, ngoài đó thì đánh đầu theo hướng tấn công (hoặc `dirOf` — hướng người chơi bấm).
 */
export function tryHeader(
  players: readonly PlayerState[],
  ball: BallState,
  half: 1 | 2,
  eligible: (p: PlayerState) => boolean,
  dirOf: (p: PlayerState) => Vec2 | null,
  rng: RngState,
): { header: PlayerState; ball: BallState; shot: boolean; rng: RngState } | null {
  if (ball.z <= CONTROL_HEIGHT || ball.z > HEADER_MAX_Z) return null;
  let best: PlayerState | null = null;
  let bestDist = HEADER_REACH;
  for (const p of players) {
    if (p.position === 'GK' || !eligible(p)) continue;
    const d = length(sub(ball.pos, p.pos));
    if (d <= bestDist) {
      best = p;
      bestDist = d;
    }
  }
  if (!best) return null;
  const sign = attackSign(best.team, half);
  if (isInPenaltyArea(best.pos, sign)) {
    const [aim, r1] = nextFloat(rng);
    const target = shotTarget(sign, aim * 2 - 1);
    const kicked = shootBall(best, ball.pos, target, HEADER_SHOT_POWER, r1, HEADER_SHOT_ERROR_MULT);
    // Bóng rời đầu ở độ cao đang bay: bớt vận tốc đứng để bóng cắm xuống khung thành.
    const flight = Math.max(length(sub(target, ball.pos)), 1) / length(kicked.ball.vel);
    return {
      header: best,
      ball: { ...kicked.ball, z: ball.z, vz: kicked.ball.vz - ball.z / flight },
      shot: true,
      rng: kicked.rng,
    };
  }
  const wanted = dirOf(best) ?? add(vec2(sign, 0), best.facing);
  const dir = normalize(length(wanted) > 0 ? wanted : vec2(sign, 0));
  const [g, r1] = nextGaussian(rng);
  const across = vec2(-dir.y, dir.x);
  const out = normalize(add(dir, scale(across, g * HEADER_PASS_SPREAD)));
  return {
    header: best,
    ball: { pos: ball.pos, z: ball.z, vz: HEADER_PASS_VZ, vel: scale(out, HEADER_PASS_SPEED) },
    shot: false,
    rng: r1,
  };
}
