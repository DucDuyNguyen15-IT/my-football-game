import { dot, length, normalize, scale, add, sub, type Vec2 } from '../math/vec2';
import { PLAYER_RADIUS } from '../physics/player';
import { BALL_RADIUS } from '../pitch';
import { controlRadiusFor, turnLossCosFor } from '../stats/params';
import type { BallState, PlayerState, TeamSide } from '../types';

/*
 * Kiểm soát bóng: bóng dính chân người dẫn, ai bắt được bóng tự do, mất bóng khi xoay gắt,
 * đổi người điều khiển. Hằng số theo chỉ số nằm ở `stats/params.ts`.
 */

/** Khoảng cách từ tâm cầu thủ tới tâm bóng khi dẫn bóng (m). */
export const DRIBBLE_OFFSET = PLAYER_RADIUS + BALL_RADIUS + 0.1;
/** Đáy bóng cao hơn mức này (m) thì không khống chế được bằng chân/ngực. */
export const CONTROL_HEIGHT = 1;
/** Chạy chậm hơn mức này (m/s) thì xoay thế nào cũng không mất bóng. */
export const TURN_LOSS_MIN_SPEED = 4;

/** Bóng dính chân: đặt trước mặt cầu thủ, chạy cùng vận tốc, nằm trên cỏ. */
export function dribbleBall(player: PlayerState): BallState {
  return {
    pos: add(player.pos, scale(player.facing, DRIBBLE_OFFSET)),
    vel: player.vel,
    z: 0,
    vz: 0,
  };
}

/**
 * Cầu thủ khống chế được bóng tự do: gần bóng nhất trong bán kính khống chế của chính người đó
 * (theo Rê bóng), bóng không quá cao. Bằng khoảng cách thì người đứng trước trong mảng thắng.
 * @param lockedId người đang bị khoá chạm bóng (vừa chuyền/sút/mất bóng), null nếu không có.
 */
export function findCapturer(
  players: readonly PlayerState[],
  ball: BallState,
  lockedId: string | null,
): string | null {
  if (ball.z > CONTROL_HEIGHT) return null;
  let best: string | null = null;
  let bestDist = Infinity;
  for (const p of players) {
    if (p.id === lockedId) continue;
    const dist = length(sub(ball.pos, p.pos));
    if (dist <= controlRadiusFor(p.stats.dribbling) && dist < bestDist) {
      best = p.id;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Người dẫn bóng mất bóng khi đang chạy nhanh mà bấm hướng lệch quá xa hướng chạy;
 * góc chịu được tăng theo Rê bóng. Tất định, không dùng PRNG.
 */
export function losesBallOnTurn(player: PlayerState, move: Vec2): boolean {
  const speed = length(player.vel);
  if (speed < TURN_LOSS_MIN_SPEED || length(move) === 0) return false;
  const cos = dot(normalize(player.vel), normalize(move));
  return cos < turnLossCosFor(player.stats.dribbling);
}

/** Điểm chắn nằm trước người dẫn bóng chừng này mét, về phía khung thành nhà. */
export const COVER_AHEAD = 3;
/** Người đứng sau bóng (xa khung thành nhà hơn người dẫn bóng) bị cộng thêm chừng này mét. */
export const BEHIND_BALL_PENALTY = 10;

/**
 * Đổi người khi đối thủ dẫn bóng: cầu thủ ngoài sân gần điểm chắn trước mặt người dẫn bóng nhất
 * (về phía khung thành nhà `ownGoal`); người đã bị vượt qua (đứng sau bóng) bị phạt
 * BEHIND_BALL_PENALTY nên chỉ được chọn khi không còn ai đứng chắn. Trừ người đang điều khiển;
 * không còn ai khác thì giữ nguyên `currentId`.
 */
export function chooseDefensiveSwitchTarget(
  players: readonly PlayerState[],
  team: TeamSide,
  carrier: PlayerState,
  ownGoal: Vec2,
  currentId: string,
): string {
  const toGoal = normalize(sub(ownGoal, carrier.pos));
  const cover = add(carrier.pos, scale(toGoal, COVER_AHEAD));
  let best = currentId;
  let bestScore = Infinity;
  for (const p of players) {
    if (p.team !== team || p.position === 'GK' || p.id === currentId) continue;
    const behind = dot(sub(p.pos, carrier.pos), toGoal) < 0;
    const score = length(sub(p.pos, cover)) + (behind ? BEHIND_BALL_PENALTY : 0);
    if (score < bestScore) {
      best = p.id;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Cầu thủ ngoài sân cùng đội gần bóng nhất, trừ người đang điều khiển.
 * Không còn ai khác thì giữ nguyên `currentId`.
 */
export function chooseSwitchTarget(
  players: readonly PlayerState[],
  team: TeamSide,
  ballPos: Vec2,
  currentId: string,
): string {
  let best = currentId;
  let bestDist = Infinity;
  for (const p of players) {
    if (p.team !== team || p.position === 'GK' || p.id === currentId) continue;
    const dist = length(sub(p.pos, ballPos));
    if (dist < bestDist) {
      best = p.id;
      bestDist = dist;
    }
  }
  return best;
}
