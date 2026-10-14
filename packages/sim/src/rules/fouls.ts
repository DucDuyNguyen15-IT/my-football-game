import { attackSign } from '../actions/shoot';
import { dot, length, normalize, sub, vec2, type Vec2 } from '../math/vec2';
import { HALF_LENGTH, HALF_WIDTH, isInPenaltyArea, PENALTY_SPOT_DIST } from '../pitch';
import { nextFloat, type RngState } from '../rng';
import type { Booking, CardColor, PlayerState, TeamSide } from '../types';
import type { RestartPlan } from './restarts';

/*
 * Phạm lỗi và thẻ phạt (PRD §5): phạm lỗi → đá phạt tại chỗ, trong vòng cấm của đội phạm lỗi →
 * phạt đền. Xoạc từ sau khi đối phương đối mặt khung thành → vàng; 2 vàng = đỏ; xoạc thô bạo có
 * xác suất đỏ trực tiếp (PRNG). Người bị đỏ rời sân.
 */

/** Xác suất thẻ đỏ trực tiếp cho một cú xoạc thô bạo. */
export const ROUGH_RED_CHANCE = 0.4;
/** Đối mặt khung thành: cách tâm khung thành không quá chừng này mét… */
export const FACING_GOAL_MAX_DIST = 25;
/** …và hướng mặt lệch khỏi hướng tới tâm khung thành không quá ~45° (cos ≥ ngưỡng). */
export const FACING_GOAL_COS = 0.7;
/** Đá phạt sát vạch được kéo vào trong sân chừng này mét. */
const FREE_KICK_EDGE_GAP = 0.5;

const other = (team: TeamSide): TeamSide => (team === 'home' ? 'away' : 'home');

/**
 * Thủ môn giữ bóng trong vòng cấm nhà mình = ôm bóng bằng tay: không ai được tranh bóng (xoạc/tắc
 * → không có tác dụng, không phạm lỗi). Ra ngoài vòng cấm thì dẫn bóng bằng chân như cầu thủ thường.
 */
export function isKeeperHandling(player: PlayerState, half: 1 | 2): boolean {
  return player.position === 'GK' && isInPenaltyArea(player.pos, -attackSign(player.team, half) as 1 | -1);
}

/** Cầu thủ đang ở gần và quay mặt về khung thành đối phương (tình huống có cơ hội ghi bàn). */
export function isFacingGoal(player: PlayerState, half: 1 | 2): boolean {
  const goal = vec2(attackSign(player.team, half) * HALF_LENGTH, 0);
  const toGoal = sub(goal, player.pos);
  const d = length(toGoal);
  if (d > FACING_GOAL_MAX_DIST) return false;
  return d === 0 || dot(player.facing, normalize(toGoal)) >= FACING_GOAL_COS;
}

/**
 * Tình huống thực hiện lại sau lỗi của đội `offender` tại `spot`: phạt đền nếu `spot` nằm trong
 * vòng cấm khung thành đội đó đang giữ, ngược lại đá phạt tại chỗ (kéo vào trong sân nếu sát vạch).
 */
export function foulRestart(offender: TeamSide, spot: Vec2, half: 1 | 2): RestartPlan {
  const ownGoalSide = attackSign(other(offender), half);
  if (isInPenaltyArea(spot, ownGoalSide)) {
    return {
      type: 'penalty',
      team: other(offender),
      spot: vec2(ownGoalSide * (HALF_LENGTH - PENALTY_SPOT_DIST), 0),
    };
  }
  const maxX = HALF_LENGTH - FREE_KICK_EDGE_GAP;
  const maxY = HALF_WIDTH - FREE_KICK_EDGE_GAP;
  return {
    type: 'free_kick',
    team: other(offender),
    spot: vec2(Math.min(maxX, Math.max(-maxX, spot.x)), Math.min(maxY, Math.max(-maxY, spot.y))),
  };
}

export const yellowCount = (bookings: readonly Booking[], playerId: string): number =>
  bookings.filter((b) => b.playerId === playerId && b.card === 'yellow').length;

export const isSentOff = (bookings: readonly Booking[], playerId: string): boolean =>
  bookings.some((b) => b.playerId === playerId && b.card === 'red');

/**
 * Thẻ cho người phạm lỗi: xoạc thô bạo → tung xác suất đỏ trực tiếp; không đỏ thì xoạc từ sau
 * khi đối phương đối mặt khung thành → vàng, vàng thứ hai kèm đỏ. PRNG chỉ tiến khi xoạc thô bạo.
 * @returns thẻ mới theo thứ tự: rỗng, `[red]`, `[yellow]` hoặc `[yellow, red]`.
 */
export function decideCards(
  foul: { fromBehind: boolean; rough: boolean },
  tackler: PlayerState,
  victim: PlayerState,
  half: 1 | 2,
  bookings: readonly Booking[],
  rng: RngState,
): { cards: CardColor[]; rng: RngState } {
  let next = rng;
  if (foul.rough) {
    const [roll, r] = nextFloat(rng);
    next = r;
    if (roll < ROUGH_RED_CHANCE) return { cards: ['red'], rng: next };
  }
  if (foul.fromBehind && isFacingGoal(victim, half)) {
    const second = yellowCount(bookings, tackler.id) >= 1;
    return { cards: second ? ['yellow', 'red'] : ['yellow'], rng: next };
  }
  return { cards: [], rng: next };
}

export interface FoulJudgement {
  plan: RestartPlan;
  /** Toàn bộ thẻ phạt, đã nối thẻ vừa rút. */
  bookings: Booking[];
  /** Người phải rời sân, null nếu không có thẻ đỏ. */
  sentOffId: string | null;
  rng: RngState;
}

/** Xử lý một pha phạm lỗi của `tackler` vào `victim`: tình huống thực hiện lại + thẻ phạt. */
export function judgeFoul(
  foul: { fromBehind: boolean; rough: boolean },
  tackler: PlayerState,
  victim: PlayerState,
  half: 1 | 2,
  bookings: readonly Booking[],
  tick: number,
  rng: RngState,
): FoulJudgement {
  const { cards, rng: next } = decideCards(foul, tackler, victim, half, bookings, rng);
  const added = cards.map((card): Booking => ({
    playerId: tackler.id,
    team: tackler.team,
    card,
    tick,
  }));
  return {
    plan: foulRestart(tackler.team, victim.pos, half),
    bookings: [...bookings, ...added],
    sentOffId: cards.includes('red') ? tackler.id : null,
    rng: next,
  };
}
