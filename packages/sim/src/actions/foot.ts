import { dot, length, sub, vec2, type Vec2 } from '../math/vec2';
import type { PlayerState } from '../types';

export type KickFoot = 'left' | 'right';

/**
 * Bóng lệch khỏi hướng đá ít hơn tỉ lệ này (sin ≈ 10°) thì coi như thẳng hướng: đá bằng chân thuận.
 * Rê bóng thì bóng nằm ngay trước mặt (`DRIBBLE_OFFSET` theo `facing`), nên tỉ lệ = sin góc giữa
 * hướng mặt và hướng đá.
 */
export const STRAIGHT_KICK_RATIO = 0.17;

/** Sai số góc/độ cao nhân thêm khi đá bằng chân không thuận, theo chỉ số chân nghịch (2–5 sao). */
export const WEAK_FOOT_ERROR_MULT: Record<number, number> = { 5: 1, 4: 1.1, 3: 1.25, 2: 1.5 };

/**
 * Chân đá: bóng lệch bên nào so với đường đá thì chân bên đó đá (chân kia làm trụ sát bóng).
 * Bên phải hướng d nhìn từ sau lưng là (−d.y, d.x) (cùng quy ước `restarts.kickingFoot`).
 * Hàm thuần, render gọi lại với hướng bay của bóng để chọn clip chân trái/phải.
 */
export function kickFoot(player: PlayerState, ballPos: Vec2, dir: Vec2): KickFoot {
  const toBall = sub(ballPos, player.pos);
  const reach = length(toBall);
  const dirLen = length(dir);
  const preferred: KickFoot = player.foot === 'left' ? 'left' : 'right';
  if (reach === 0 || dirLen === 0) return preferred;
  const side = dot(toBall, vec2(-dir.y, dir.x)) / (reach * dirLen);
  if (Math.abs(side) < STRAIGHT_KICK_RATIO) return preferred;
  return side > 0 ? 'right' : 'left';
}

/** Hệ số sai số của cú đá bằng chân `foot`: chân thuận / hai chân = 1, chân nghịch theo số sao. */
export function footErrorMult(player: PlayerState, foot: KickFoot): number {
  if (player.foot === 'both' || foot === (player.foot ?? 'right')) return 1;
  // Không có chỉ số (dữ liệu demo, fixture test) thì không phạt.
  return WEAK_FOOT_ERROR_MULT[player.weakFoot ?? 5] ?? 1;
}
