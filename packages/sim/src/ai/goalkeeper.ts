import { attackSign } from '../actions/shoot';
import {
  add,
  clampLength,
  dot,
  length,
  normalize,
  scale,
  sub,
  vec2,
  type Vec2,
} from '../math/vec2';
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
/** Đổ người quá đà: Vị trí thấp đọc sai góc bóng, tưởng bóng chéo hơn thật chừng này lần phần sai số. */
const DIVE_MISREAD = 0.5;
/** Thủ môn di chuyển nhanh hơn chừng này (m/s) thì coi như đang lao người (thân nằm theo hướng lao). */
const DIVING_SPEED = 3;
/** Lúc lao người, bóng ở trước người theo hướng lao ≥ HAND_LEAD m → trúng tay; sau ≥ LEG_TRAIL m → trúng chân. */
const HAND_LEAD = 0.2;
const LEG_TRAIL = 0.2;
/** Đứng đón: bóng thấp hơn LOW_BALL_Z (m) mà lệch quá SCOOP_DIST (m) thì chỉ kịp đưa chân. */
const LOW_BALL_Z = 0.4;
const SCOOP_DIST = 0.5;
/** Bóng trúng thân thì khó ôm gọn hơn trúng tay chừng này lần. */
const BODY_CATCH_MULT = 0.5;
/** Bóng trúng chân văng ra: giữ LEG_KEEP_VX phần vận tốc dọc (đổi chiều), văng ngang ±LEG_SIDE_RANGE m/s, bật lên LEG_VZ. */
const LEG_KEEP_VX = 0.25;
const LEG_SIDE_RANGE = 5;
const LEG_VZ = 1;

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
 * ra đón bóng chậm trong vòng cấm (trừ khi `collect` = false: bóng chết, đội mình chờ thực hiện); còn
 * lại đứng trên đường nối tâm khung thành với bóng, lệch ngang theo độ chuẩn của chỉ số Vị trí.
 */
export function keeperTarget(
  gk: PlayerState,
  ball: BallState,
  players: readonly PlayerState[],
  ballOwnerId: string | null,
  half: 1 | 2,
  collect = true,
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
    collect &&
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
  // Vị trí thấp đọc góc bóng chéo hơn thật → đổ người quá đà, bóng đi vào phía chân.
  const misread = 1 + (1 - keeperPositionAccuracy(gk.stats.positioning)) * DIVE_MISREAD;
  const y = ball.pos.y + (yAt(planeX) - ball.pos.y) * misread;
  return vec2(planeX, clamp(y, -DIVE_MAX_Y, DIVE_MAX_Y));
}

/** Một tick lao người tới `target` với GK_DIVE_SPEED (không giới hạn gia tốc). */
export function diveStep(gk: PlayerState, target: Vec2): PlayerState {
  const move = clampLength(sub(target, gk.pos), GK_DIVE_SPEED * TICK_DT);
  return { ...gk, pos: add(gk.pos, move), vel: scale(move, 1 / TICK_DT) };
}

/** Phần người thủ môn chạm bóng. */
export type KeeperContact = 'hands' | 'body' | 'legs';

/**
 * Bóng chạm phần nào của thủ môn. Chưa kịp phản ứng: trúng thân (bóng cao) hoặc chân (bóng thấp).
 * Đang lao người: thân nằm theo hướng lao — bóng ở phía trước là tay, phía sau (đổ quá đà) là chân,
 * giữa là thân. Đứng đón: bóng cao hoặc ngay trước mặt thì ôm bằng tay, bóng thấp lệch sang thì
 * chỉ kịp đưa chân.
 */
export function keeperContact(gk: PlayerState, ball: BallState, reacted: boolean): KeeperContact {
  const rel = sub(ball.pos, gk.pos);
  if (!reacted) return ball.z < LOW_BALL_Z ? 'legs' : 'body';
  const speed = length(gk.vel);
  if (speed >= DIVING_SPEED) {
    const along = dot(rel, scale(gk.vel, 1 / speed));
    if (along >= HAND_LEAD) return 'hands';
    if (along <= -LEG_TRAIL) return 'legs';
    return 'body';
  }
  return ball.z >= LOW_BALL_Z || length(rel) <= SCOOP_DIST ? 'hands' : 'legs';
}

/**
 * Thủ môn chạm được bóng: trúng tay thì có cơ hội bắt dính (theo Bắt bóng, bóng càng nhanh càng
 * khó), trúng thân khó ôm hơn, trúng chân thì luôn văng ra. Không bắt được thì đẩy bóng chếch ra
 * xa khung thành về phía bóng đang lệch; trúng chân thì văng ngang ngẫu nhiên. Hàm thuần, PRNG
 * tiến 1 (bắt) hoặc 2 (đẩy) lần.
 */
export function resolveSave(
  gk: PlayerState,
  ball: BallState,
  rng: RngState,
  half: 1 | 2,
  contact: KeeperContact = 'hands',
): { outcome: 'catch' | 'parry'; ball: BallState; rng: RngState } {
  const [roll, r1] = nextFloat(rng);
  const chance = keeperCatchChance(gk.stats.handling, length(ball.vel));
  const catchChance =
    contact === 'hands' ? chance : contact === 'body' ? chance * BODY_CATCH_MULT : 0;
  if (roll < catchChance) {
    return { outcome: 'catch', ball, rng: r1 };
  }
  if (contact === 'legs') {
    const [side, r2] = nextFloat(r1);
    const vx =
      attackSign(gk.team, half) * Math.max(PARRY_MIN_VX, Math.abs(ball.vel.x) * LEG_KEEP_VX);
    const vy = (side * 2 - 1) * LEG_SIDE_RANGE;
    return { outcome: 'parry', ball: { ...ball, vel: vec2(vx, vy), vz: LEG_VZ }, rng: r2 };
  }
  const [side, r2] = nextFloat(r1);
  const vx =
    attackSign(gk.team, half) * Math.max(PARRY_MIN_VX, Math.abs(ball.vel.x) * PARRY_KEEP_VX);
  const vy = (ball.pos.y >= gk.pos.y ? 1 : -1) * (PARRY_SIDE_MIN + side * PARRY_SIDE_RANGE);
  return { outcome: 'parry', ball: { ...ball, vel: vec2(vx, vy), vz: PARRY_VZ }, rng: r2 };
}
