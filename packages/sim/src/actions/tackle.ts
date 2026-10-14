import { add, dot, length, normalize, scale, sub, type Vec2 } from '../math/vec2';
import { nextFloat, type RngState } from '../rng';
import {
  STAND_TACKLE_FOUL_CHANCE,
  standTackleReachFor,
  standTackleWinChance,
  tackleReachFor,
  tackleWinChance,
} from '../stats/params';
import { TICK_DT } from '../tick';
import type { BallState, PlayerState } from '../types';

/*
 * Xoạc (A — nút chuyền bổng — khi không có bóng, PRD §5). Xoạc xảy ra tức thì ở tick bấm: so vị trí người xoạc với
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
/** Xoạc (A): cầu thủ trượt theo hướng mặt với tốc độ trong khoảng này (m/s). */
export const TACKLE_SLIDE_SPEED = 6;
export const TACKLE_SLIDE_MAX_SPEED = 7.5;
/** Ma sát khi trượt / ngã trên cỏ (m/s²): trượt 6 m/s đi chừng 3 m. */
export const TACKLE_SLIDE_DECEL = 6;
/** Sau cú xoạc: nằm sân/đứng dậy chừng này tick (1,2 s), không di chuyển hay xoạc lại được. */
export const TACKLE_RECOVERY_TICKS = 72;
/** Xoạc trúng bóng: bóng bật ra theo hướng xoạc với tốc độ này (m/s). */
export const TACKLE_POKE_SPEED = 8;
/** Xoạc trúng bóng rồi mới chạm chân: người bị xoạc ngã với xác suất này, còn lại chỉ vấp. */
export const VICTIM_FALL_CHANCE = 0.5;
/** Người bị xoạc ngã: nằm/đứng dậy chừng này tick (1,5 s). */
export const VICTIM_FALL_TICKS = 90;
/** Người bị xoạc vấp: mất thăng bằng chừng này tick (0,4 s). */
export const VICTIM_STUMBLE_TICKS = 24;

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

/** Tắc đứng: như xoạc, thêm `failed` = trượt mà không chạm người, người dẫn bóng giữ bóng. */
export type StandTackleOutcome = TackleOutcome | { type: 'failed' };

/**
 * Tắc bóng đứng (giữ D khi không có bóng, task 5.15) vào người dẫn bóng đối phương. Chỉ tắc khi bóng
 * trong tầm tắc đứng (ngắn hơn xoạc), không trượt người. Từ phía sau → phạm lỗi (không thô bạo, không
 * tung xác suất). Ngược lại tung giành bóng; trượt thì tung tiếp có chạm người (phạm lỗi) hay không.
 * Bóng tự do, đồng đội dẫn bóng, bóng ngoài tầm → `miss` (không tắc, PRNG giữ nguyên).
 */
export function resolveStandTackle(
  players: readonly PlayerState[],
  tackler: PlayerState,
  ball: BallState,
  ballOwnerId: string | null,
  rng: RngState,
): { outcome: StandTackleOutcome; rng: RngState } {
  const owner = ballOwnerId === null ? undefined : players.find((p) => p.id === ballOwnerId);
  if (
    !owner ||
    owner.team === tackler.team ||
    dist(ball.pos, tackler.pos) > standTackleReachFor(tackler.stats.defending)
  ) {
    return { outcome: { type: 'miss' }, rng };
  }
  if (isFromBehind(tackler, owner)) {
    return { outcome: { type: 'foul', victimId: owner.id, fromBehind: true, rough: false }, rng };
  }
  const [roll, r1] = nextFloat(rng);
  if (roll < standTackleWinChance(tackler.stats.defending, owner.stats.dribbling)) {
    return { outcome: { type: 'won', victimId: owner.id }, rng: r1 };
  }
  const [contact, r2] = nextFloat(r1);
  const outcome: StandTackleOutcome =
    contact < STAND_TACKLE_FOUL_CHANCE
      ? { type: 'foul', victimId: owner.id, fromBehind: false, rough: false }
      : { type: 'failed' };
  return { outcome, rng: r2 };
}

/** Bắt đầu xoạc: cầu thủ lao theo hướng mặt, tốc độ kẹp trong [TACKLE_SLIDE_SPEED, TACKLE_SLIDE_MAX_SPEED]. */
export function slideTackle(tackler: PlayerState): PlayerState {
  const speed = Math.min(
    TACKLE_SLIDE_MAX_SPEED,
    Math.max(length(tackler.vel), TACKLE_SLIDE_SPEED),
  );
  return { ...tackler, vel: scale(tackler.facing, speed) };
}

/** Một tick trượt trên cỏ (đang xoạc / ngã / vấp): chậm dần theo TACKLE_SLIDE_DECEL, giữ hướng mặt. */
export function slideStep(player: PlayerState): PlayerState {
  const speed = length(player.vel);
  const next = Math.max(0, speed - TACKLE_SLIDE_DECEL * TICK_DT);
  const vel = speed === 0 ? player.vel : scale(player.vel, next / speed);
  return { ...player, vel, pos: add(player.pos, scale(vel, TICK_DT)) };
}

/** Xoạc trúng bóng: bóng bật ra theo hướng xoạc, sát mặt cỏ. */
export const pokeBall = (tackler: PlayerState, ball: BallState): BallState => ({
  ...ball,
  vel: scale(tackler.facing, TACKLE_POKE_SPEED),
  z: 0,
  vz: 0,
});

/** Người bị xoạc trúng bóng (không phạm lỗi): ngã hay chỉ vấp, theo PRNG. */
export function victimReaction(rng: RngState): { reaction: 'fall' | 'stumble'; rng: RngState } {
  const [roll, next] = nextFloat(rng);
  return { reaction: roll < VICTIM_FALL_CHANCE ? 'fall' : 'stumble', rng: next };
}
