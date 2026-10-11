import { attackSign } from '../actions/shoot';
import { add, clampLength, length, normalize, scale, sub, vec2, type Vec2 } from '../math/vec2';
import { GOAL_WIDTH, HALF_LENGTH, isInPenaltyArea } from '../pitch';
import { nextFloat, type RngState } from '../rng';
import { GK_DIVE_SPEED, keeperCatchChance, keeperPositionAccuracy } from '../stats/params';
import { TICK_DT } from '../tick';
import type { BallState, PlayerState } from '../types';

/*
 * AI thủ môn (task 5.8b, PRD §6.2): đứng theo góc bóng (Vị trí), lao ra khi bị đối mặt, đón bóng
 * chậm trong vòng cấm, lao người cản phá sau thời gian phản ứng (Phản xạ), bắt dính hay đẩy ra
 * (Bắt bóng), chuyền/phát bóng bằng chỉ số Phát bóng. Hàm thuần, tất định.
 */

/** Cách vạch cuối tối thiểu/tối đa (m); bóng càng gần càng ra xa vạch, chừng này mét mỗi mét bóng. */
const GK_MIN_ADVANCE = 0.8;
const GK_MAX_ADVANCE = 3.5;
const GK_ADVANCE_PER_M = 0.1;
/** Không dịch ngang quá cột dọc. */
const GK_MAX_Y = GOAL_WIDTH / 2;
/** Lao ra khi đối phương dẫn bóng trong vòng cấm, cách khung thành ≤ RUSH_DIST; đứng cách người đó RUSH_GAP. */
const RUSH_DIST = 14;
const RUSH_GAP = 2;
/** Ra đón bóng tự do trong vòng cấm chậm hơn COLLECT_MAX_SPEED (m/s) và thấp hơn COLLECT_MAX_Z (m). */
const COLLECT_MAX_SPEED = 8;
const COLLECT_MAX_Z = 1;
/** Bóng cắt vạch cuối lệch khỏi cột quá chừng này (m) thì không lao người. */
const DIVE_MOUTH_MARGIN = 1;
/** Lao người về vạch thì vẫn đứng trước vạch chừng này (m). */
const GOAL_LINE_GAP = 0.5;
/** Điểm lao người không xa quá cột chừng này (m). */
const DIVE_MAX_Y = GOAL_WIDTH / 2 + 0.5;
/** Đẩy ra: giữ PARRY_KEEP_VX phần vận tốc dọc (đổi chiều, ít nhất PARRY_MIN_VX), văng ngang PARRY_SIDE_MIN…+RANGE m/s, bật lên PARRY_VZ. */
const PARRY_KEEP_VX = 0.35;
const PARRY_MIN_VX = 2;
const PARRY_SIDE_MIN = 3;
const PARRY_SIDE_RANGE = 3;
const PARRY_VZ = 2;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const dist = (a: Vec2, b: Vec2): number => length(sub(a, b));

/** Tâm khung thành thủ môn đội `gk.team` đang giữ. */
const ownGoal = (gk: PlayerState, half: 1 | 2): Vec2 =>
  vec2(-attackSign(gk.team, half) * HALF_LENGTH, 0);

/** Thủ môn chuyền/sút bằng chỉ số Phát bóng; cầu thủ khác giữ nguyên. */
export function asKicker(p: PlayerState): PlayerState {
  if (p.position !== 'GK') return p;
  return { ...p, stats: { ...p.stats, passing: p.stats.kicking, shooting: p.stats.kicking } };
}

/**
 * Vị trí thủ môn muốn đứng: lao ra chắn trước người dẫn bóng đối phương đang đối mặt trong vòng cấm;
 * ra đón bóng chậm trong vòng cấm; còn lại đứng trên đường nối tâm khung thành với bóng, lệch
 * ngang theo độ chuẩn của chỉ số Vị trí.
 */
export function keeperTarget(
  gk: PlayerState,
  ball: BallState,
  players: readonly PlayerState[],
  ballOwnerId: string | null,
  half: 1 | 2,
): Vec2 {
  const goal = ownGoal(gk, half);
  const goalSide: 1 | -1 = attackSign(gk.team, half) === 1 ? -1 : 1;
  const owner = ballOwnerId === null ? undefined : players.find((p) => p.id === ballOwnerId);
  if (
    owner &&
    owner.team !== gk.team &&
    isInPenaltyArea(owner.pos, goalSide) &&
    dist(owner.pos, goal) <= RUSH_DIST
  ) {
    return add(owner.pos, scale(normalize(sub(goal, owner.pos)), RUSH_GAP));
  }
  if (
    !owner &&
    isInPenaltyArea(ball.pos, goalSide) &&
    length(ball.vel) < COLLECT_MAX_SPEED &&
    ball.z < COLLECT_MAX_Z
  ) {
    return ball.pos;
  }
  const toBall = sub(ball.pos, goal);
  const d = length(toBall);
  const dir = d > 0 ? scale(toBall, 1 / d) : vec2(-goalSide, 0);
  const advance = clamp(d * GK_ADVANCE_PER_M, GK_MIN_ADVANCE, GK_MAX_ADVANCE);
  const ideal = add(goal, scale(dir, advance));
  const y = clamp(ideal.y * keeperPositionAccuracy(gk.stats.positioning), -GK_MAX_Y, GK_MAX_Y);
  // + 0 bỏ −0 để JSON khứ hồi y hệt.
  return vec2(ideal.x, y + 0);
}

/**
 * Điểm lao người cản phá: nơi bóng (bay thẳng) cắt ngang đường thủ môn đứng — hoặc vạch cuối nếu
 * bóng đã qua người. Null nếu bóng không bay về khung thành nhà hoặc sẽ chệch hẳn khỏi cột.
 */
export function diveTarget(gk: PlayerState, ball: BallState, half: 1 | 2): Vec2 | null {
  const goalX = ownGoal(gk, half).x;
  const vx = ball.vel.x;
  if (vx === 0 || Math.sign(goalX - ball.pos.x) !== Math.sign(vx)) return null;
  const yAt = (x: number) => ball.pos.y + (ball.vel.y * (x - ball.pos.x)) / vx;
  if (Math.abs(yAt(goalX)) > GOAL_WIDTH / 2 + DIVE_MOUTH_MARGIN) return null;
  const ahead = Math.sign(gk.pos.x - ball.pos.x) === Math.sign(vx);
  // Bóng đã qua người: lùi về sát vạch nhưng vẫn đứng trong sân.
  const planeX = ahead ? gk.pos.x : goalX - Math.sign(vx) * GOAL_LINE_GAP;
  return vec2(planeX, clamp(yAt(planeX), -DIVE_MAX_Y, DIVE_MAX_Y));
}

/** Một tick lao người tới `target` với GK_DIVE_SPEED (không giới hạn gia tốc). */
export function diveStep(gk: PlayerState, target: Vec2): PlayerState {
  const move = clampLength(sub(target, gk.pos), GK_DIVE_SPEED * TICK_DT);
  return { ...gk, pos: add(gk.pos, move), vel: scale(move, 1 / TICK_DT) };
}

/**
 * Thủ môn chạm được bóng: bắt dính (theo Bắt bóng, bóng càng nhanh càng khó) hoặc đẩy bóng chếch
 * ra xa khung thành về phía bóng đang lệch. Hàm thuần, PRNG tiến 1 (bắt) hoặc 2 (đẩy) lần.
 */
export function resolveSave(
  gk: PlayerState,
  ball: BallState,
  rng: RngState,
  half: 1 | 2,
): { outcome: 'catch' | 'parry'; ball: BallState; rng: RngState } {
  const [roll, r1] = nextFloat(rng);
  if (roll < keeperCatchChance(gk.stats.handling, length(ball.vel))) {
    return { outcome: 'catch', ball, rng: r1 };
  }
  const [side, r2] = nextFloat(r1);
  const vx =
    attackSign(gk.team, half) * Math.max(PARRY_MIN_VX, Math.abs(ball.vel.x) * PARRY_KEEP_VX);
  const vy = (ball.pos.y >= gk.pos.y ? 1 : -1) * (PARRY_SIDE_MIN + side * PARRY_SIDE_RANGE);
  return { outcome: 'parry', ball: { ...ball, vel: vec2(vx, vy), vz: PARRY_VZ }, rng: r2 };
}
