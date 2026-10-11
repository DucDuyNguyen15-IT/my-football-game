import { dot, length, normalize, scale, sub, type Vec2 } from '../math/vec2';
import { nextFloat, type RngState } from '../rng';
import { tackleReachFor, tackleWinChance } from '../stats/params';
import type { BallState, PlayerState } from '../types';

/*
 * Xoạc (K khi không có bóng, PRD §5). Xoạc xảy ra tức thì ở tick bấm: so vị trí người xoạc với
 * bóng và người dẫn bóng đối phương. Tầm với và tỉ lệ xoạc sạch theo Phòng ngự (`stats/params.ts`).
 * Phạm lỗi được xử lý ở `rules/fouls.ts`; ở đây chỉ quyết định xoạc trúng bóng, trúng người hay hụt.
 */

/**
 * Người xoạc ở phía sau người bị xoạc khi cos của góc giữa hướng mặt người bị xoạc và hướng
 * tới người xoạc nhỏ hơn ngưỡng này (−0.5 = lệch quá 120° khỏi hướng mặt).
 */
export const BEHIND_COS = -0.5;
/** Xoạc từ phía sau với tốc độ từ mức này (m/s) trở lên là xoạc thô bạo. */
export const ROUGH_TACKLE_SPEED = 5;
/** Xoạc hụt: cầu thủ trượt đi với tốc độ tối thiểu này (m/s) theo hướng mặt. */
export const TACKLE_SLIDE_SPEED = 6;
/** Xoạc hụt: nằm sân/đứng dậy chừng này tick (0,7 s), không di chuyển hay xoạc lại được. */
export const TACKLE_RECOVERY_TICKS = 42;

export type TackleOutcome =
  /** Không có bóng hay người dẫn bóng đối phương trong tầm. */
  | { type: 'miss' }
  /** Xoạc sạch: người xoạc giành bóng. `victimId` null khi bóng đang tự do. */
  | { type: 'won'; victimId: string | null }
  /** Chạm người mà không chạm bóng trước, hoặc xoạc từ phía sau. */
  | { type: 'foul'; victimId: string; fromBehind: boolean; rough: boolean };

/** `tackler` đang ở phía sau `victim` (theo hướng mặt của `victim`). */
export function isFromBehind(tackler: PlayerState, victim: PlayerState): boolean {
  const toTackler = sub(tackler.pos, victim.pos);
  if (length(toTackler) === 0) return false;
  return dot(victim.facing, normalize(toTackler)) < BEHIND_COS;
}

/** Xoạc thô bạo: từ phía sau và lao vào với tốc độ cao. */
export const isRough = (tackler: PlayerState, victim: PlayerState): boolean =>
  isFromBehind(tackler, victim) && length(tackler.vel) >= ROUGH_TACKLE_SPEED;

const dist = (a: Vec2, b: Vec2): number => length(sub(a, b));

/**
 * Quyết định kết quả cú xoạc của `tackler`. Hàm thuần; PRNG chỉ tiến khi phải tung xác suất
 * xoạc sạch (bóng trong tầm, không từ phía sau).
 * - Người dẫn bóng là đối phương: từ phía sau → phạm lỗi; bóng trong tầm → tung xác suất sạch,
 *   trượt thì phạm lỗi; bóng ngoài tầm nhưng người trong tầm → phạm lỗi; ngoài tầm cả hai → hụt.
 * - Bóng tự do trong tầm và thấp hơn `maxBallHeight` → giành bóng. Đồng đội đang dẫn bóng → hụt.
 */
export function resolveTackle(
  players: readonly PlayerState[],
  tackler: PlayerState,
  ball: BallState,
  ballOwnerId: string | null,
  rng: RngState,
  maxBallHeight = Infinity,
): { outcome: TackleOutcome; rng: RngState } {
  const reach = tackleReachFor(tackler.stats.defending);
  const ballInReach = dist(ball.pos, tackler.pos) <= reach;
  const owner = ballOwnerId === null ? undefined : players.find((p) => p.id === ballOwnerId);

  if (!owner) {
    const won = ballInReach && ball.z <= maxBallHeight;
    return { outcome: won ? { type: 'won', victimId: null } : { type: 'miss' }, rng };
  }
  if (owner.team === tackler.team || (!ballInReach && dist(owner.pos, tackler.pos) > reach)) {
    return { outcome: { type: 'miss' }, rng };
  }

  const foul: TackleOutcome = {
    type: 'foul',
    victimId: owner.id,
    fromBehind: isFromBehind(tackler, owner),
    rough: isRough(tackler, owner),
  };
  if (foul.fromBehind || !ballInReach) return { outcome: foul, rng };
  const [roll, next] = nextFloat(rng);
  const chance = tackleWinChance(tackler.stats.defending, owner.stats.dribbling);
  return { outcome: roll < chance ? { type: 'won', victimId: owner.id } : foul, rng: next };
}

/** Xoạc hụt: cầu thủ trượt theo hướng mặt, ít nhất TACKLE_SLIDE_SPEED. */
export function slideTackle(tackler: PlayerState): PlayerState {
  const speed = Math.max(length(tackler.vel), TACKLE_SLIDE_SPEED);
  return { ...tackler, vel: scale(tackler.facing, speed) };
}
