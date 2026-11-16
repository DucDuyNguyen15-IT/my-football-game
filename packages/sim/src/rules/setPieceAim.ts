import { add, clampLength, length, normalize, scale, vec2, ZERO, type Vec2 } from '../math/vec2';
import { HALF_LENGTH } from '../pitch';
import { TICK_DT } from '../tick';
import type { BallState, Restart, RestartType } from '../types';
import { restartFacing } from './restarts';

/*
 * Ngắm tình huống cố định của người chơi (camera sau lưng người đá, `apps/web/.../camera.ts`):
 * mũi tên trái/phải xoay hướng ngắm, giữ Shift thì mũi tên dời điểm chạm trên bóng.
 * Chỉ dùng + − × ÷ sqrt để tất định.
 */

/** Tình huống cố định người chơi xoay được hướng ngắm (phạt đền ngắm bằng vòng tròn riêng). */
export const AIMED_RESTARTS: ReadonlySet<RestartType> = new Set([
  'free_kick',
  'corner',
  'goal_kick',
]);
/** Tình huống chọn được điểm chạm bóng. */
export const CONTACT_RESTARTS: ReadonlySet<RestartType> = new Set(['free_kick', 'corner']);

/** Mỗi tick giữ mũi tên, hướng ngắm xoay ≈ atan(AIM_TURN_PER_TICK) ≈ 1° (≈ 60°/s). */
export const AIM_TURN_PER_TICK = 0.0175;
/** Điểm chạm đi hết bán kính bóng (0 → 1) trong chừng này giây. */
export const CONTACT_MOVE_SEC = 0.6;
/** Đá phạt ngắm ra ngoài khung thành: bóng nhắm điểm cách chừng này mét theo hướng ngắm. */
const AIM_FAR_DIST = 30;

/** Hướng ngắm hiện tại (chưa xoay lần nào thì là hướng mặc định của tình huống). */
export function restartAim(restart: Restart, half: 1 | 2): Vec2 {
  return restart.aim ?? restartFacing(restart, half);
}

/** Điểm chạm trên bóng nhìn từ sau lưng người đá: x sang phải, y lên trên, |contact| ≤ 1. */
export function restartContact(restart: Restart): Vec2 {
  return restart.contact ?? ZERO;
}

/**
 * Bên phải hướng `aim` khi nhìn từ sau lưng (sim x → Three x, sim y → Three z, trục y hướng lên):
 * right = aim × up = (−aim.y, aim.x).
 */
export const rightOf = (aim: Vec2): Vec2 => vec2(-aim.y, aim.x);

/** Xoay hướng ngắm theo `turn` (move.x: −1 trái … 1 phải) một tick. */
export function turnAim(aim: Vec2, turn: number): Vec2 {
  if (turn === 0) return aim;
  return normalize(add(aim, scale(rightOf(aim), AIM_TURN_PER_TICK * turn)));
}

/** Dời điểm chạm theo hướng bấm một tick (move.y âm = mũi tên lên = chạm phía trên bóng). */
export function moveContact(contact: Vec2, move: Vec2): Vec2 {
  if (length(move) === 0) return contact;
  const step = TICK_DT / CONTACT_MOVE_SEC;
  return clampLength(vec2(contact.x + move.x * step, contact.y - move.y * step), 1);
}

/** Điểm nhắm khi đá phạt theo hướng ngắm: chỗ tia ngắm cắt vạch cuối, hoặc xa AIM_FAR_DIST m. */
export function aimTarget(spot: Vec2, aim: Vec2, goalSign: 1 | -1): Vec2 {
  const goalX = goalSign * HALF_LENGTH;
  if (aim.x * goalSign > 1e-6) return add(spot, scale(aim, (goalX - spot.x) / aim.x));
  return add(spot, scale(aim, AIM_FAR_DIST));
}

/** Độ xoáy cạnh/xoáy dọc khi chạm mép bóng (như sút xoáy Z+D, `FINESSE_SPIN`). */
export const CONTACT_SPIN = 0.8;
/** Chạm đáy bóng: vận tốc đứng ×(1 + CONTACT_LIFT); chạm đỉnh: ×(1 − CONTACT_LIFT). */
export const CONTACT_LIFT = 0.5;
/** Chạm mép bóng mất bấy nhiêu phần tốc độ so với sút căng giữa bóng. */
export const CONTACT_SLOW = 0.15;

export interface ContactKick {
  spinSide: number;
  spinTop: number;
  vzMult: number;
  speedMult: number;
}

/**
 * Điểm chạm → quỹ đạo. Chạm lệch phải (má trong chân phải) thì bóng cong sang trái và ngược lại
 * (`BallSpin.side` > 0 cong về `rightOf`). Chạm thấp: bóng bổng, xoáy ngược; chạm cao: bóng chìm,
 * xoáy lên. Chạm giữa: sút căng, không xoáy.
 */
export function contactKick(contact: Vec2): ContactKick {
  const off = Math.min(1, length(contact));
  return {
    // 0 − … để không sinh -0 trong state.
    spinSide: 0 - contact.x * CONTACT_SPIN,
    spinTop: 0 + contact.y * CONTACT_SPIN,
    vzMult: 1 - contact.y * CONTACT_LIFT,
    speedMult: 1 - off * CONTACT_SLOW,
  };
}

/** Áp điểm chạm lên bóng vừa đá; chạm giữa (hoặc chưa chọn) thì giữ nguyên. */
export function kickWithContact(ball: BallState, contact: Vec2 | undefined): BallState {
  if (!contact || (contact.x === 0 && contact.y === 0)) return ball;
  const k = contactKick(contact);
  return {
    ...ball,
    vel: scale(ball.vel, k.speedMult),
    vz: Math.max(0, ball.vz * k.vzMult),
    spin: { side: k.spinSide, top: k.spinTop },
  };
}
