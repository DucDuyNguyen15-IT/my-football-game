import type { PassKind } from '../actions/pass';
import { attackSign, shotTarget } from '../actions/shoot';
import { add, dot, length, normalize, scale, sub, vec2, type Vec2 } from '../math/vec2';
import { HALF_LENGTH, HALF_WIDTH } from '../pitch';
import { nextFloat, type RngState } from '../rng';
import { cpuRestartKick } from '../rules/restarts';
import { lobRangeFor } from '../stats/params';
import type { PlayerState, Restart, TeamSide } from '../types';

/*
 * AI tầng cầu thủ (task 5.8a, docs/research.md §2): người có bóng chấm điểm sút / chuyền / rê rồi
 * chọn; người không bóng của đội đang tấn công dạt ra khoảng trống. Hàm thuần, tất định — PRNG chỉ
 * dùng khi chọn góc sút phạt đền. Trọng số cân chỉnh ở task 5.13.
 */

export type CarrierAction =
  | { type: 'dribble'; move: Vec2; sprint: boolean }
  /** `targetId` null: chuyền/phát bóng vào khoảng trống. */
  | { type: 'pass'; kind: PassKind; to: Vec2; targetId: string | null }
  | { type: 'shoot'; target: Vec2; power: number };

export interface CarrierContext {
  carrier: PlayerState;
  players: readonly PlayerState[];
  half: 1 | 2;
  /** Số tick đã giữ bóng liên tục. */
  heldTicks: number;
  /** Giữ bóng ít nhất chừng này tick (khống chế) rồi mới chuyền/sút. */
  minHoldTicks: number;
}

/** Đối phương đứng gần hơn chừng này (m) là đang bị áp sát: phải chuyền/sút ngay. */
export const PRESSURE_DIST = 2.5;
/** Thời gian giữ bóng tối thiểu mặc định (0,2 s); AI dùng max(giá trị này, độ trễ phản ứng). */
export const AI_MIN_HOLD_TICKS = 12;

/** Xa khung thành hơn chừng này (m) thì không sút. */
const SHOOT_MAX_DIST = 24;
/** Điểm sút từ mức này trở lên thì sút; bị áp sát thì hạ xuống SHOOT_PRESSURED_MIN; đá phạt SHOOT_FREE_KICK_MIN. */
const SHOOT_THRESHOLD = 0.5;
const SHOOT_PRESSURED_MIN = 0.3;
const SHOOT_FREE_KICK_MIN = 0.45;
/** Nhắm lệch về cột xa thủ môn chừng này phần SHOT_AIM_Y. */
const SHOT_AIM_SIDE = 0.7;
/** Lực sút: xa hơn SHOT_FULL_POWER_DIST thì hết lực, gần thì SHOT_NEAR_POWER. */
const SHOT_FULL_POWER_DIST = 12;
const SHOT_NEAR_POWER = 0.8;
const PENALTY_POWER = 0.85;
const FREE_KICK_POWER = 0.9;

/** Đối phương cách đường bóng xa hơn chừng này (m) coi như đường thoáng. */
const LANE_CLEAR = 1.5;
/** Người nhận gần hơn PASS_MIN_DIST thì không chuyền; chuyền sệt tối đa GROUND_PASS_MAX_DIST, bổng tối thiểu LOB_MIN_DIST. */
const PASS_MIN_DIST = 4;
const GROUND_PASS_MAX_DIST = 28;
const LOB_MIN_DIST = 10;
/** Người nhận trống hoàn toàn khi đối phương gần nhất cách từ chừng này (m). */
const OPEN_SPACE = 6;
/** Tiến lên chừng này mét = điểm tiến lên tối đa. */
const PROGRESS_SCALE = 20;
/** Người nhận cách khung thành dưới chừng này (m) thì được cộng điểm cơ hội. */
const CHANCE_DIST = 18;
/** Chuyền đón trước người nhận đang chạy, tối đa chừng này giây. */
const PASS_LEAD_MAX_SEC = 1;
const PASS_LEAD_SPEED = 15;
/** Chuyền phải hơn rê chừng này điểm mới chuyền (tránh chuyền qua lại liên tục). */
const PASS_MARGIN = 0.1;
/** Phát bóng giải nguy đi chừng này phần tầm chuyền bổng. */
const CLEARANCE_RANGE_FRAC = 0.6;
/** Chuyền vào khoảng trống khi thực hiện bóng chết: sệt đi chừng này mét. */
const LOOSE_GROUND_DIST = 15;

/** Rê: né đối phương gần hơn DRIBBLE_AVOID_DIST (m) với trọng số DRIBBLE_AVOID_WEIGHT. */
const DRIBBLE_AVOID_DIST = 5;
const DRIBBLE_AVOID_WEIGHT = 1.2;
/** Nước rút khi phía trước trống hơn DRIBBLE_SPRINT_SPACE (m) và thể lực còn trên DRIBBLE_SPRINT_STAMINA %. */
const DRIBBLE_SPRINT_SPACE = 8;
const DRIBBLE_SPRINT_STAMINA = 40;
/** Khoảng trống rê = đối phương gần nhất trong hình nón ±60° phía trước, tối đa DRIBBLE_SPACE_MAX (m). */
const DRIBBLE_CONE_COS = 0.5;
const DRIBBLE_SPACE_MAX = 10;
/** Cách biên dọc dưới chừng này (m) thì rê bẻ vào trong. */
const TOUCHLINE_GAP = 3;

/** Chạy chỗ: dạt khỏi đối phương gần điểm neo hơn SUPPORT_SPACE, tối đa SUPPORT_MAX_SHIFT (m). */
const SUPPORT_SPACE = 5;
const SUPPORT_MAX_SHIFT = 3;
/** Hướng dạt khi đối phương đứng trùng điểm neo — cố định để tất định. */
const COINCIDENT_DIR = vec2(1, 0);

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const dist = (a: Vec2, b: Vec2): number => length(sub(a, b));

/** Khoảng cách từ `p` tới đoạn `a`→`b`; Infinity nếu `p` không nằm ngang đoạn (sau `a` hoặc quá `b`). */
function laneDist(a: Vec2, b: Vec2, p: Vec2): number {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  if (len2 === 0) return dist(p, a);
  const t = dot(sub(p, a), ab) / len2;
  if (t <= 0 || t >= 1) return Infinity;
  return dist(p, add(a, scale(ab, t)));
}

const laneClearance = (a: Vec2, b: Vec2, blockers: readonly PlayerState[]): number =>
  blockers.reduce((m, o) => Math.min(m, laneDist(a, b, o.pos)), Infinity);

const nearestDist = (p: Vec2, others: readonly PlayerState[]): number =>
  others.reduce((m, o) => Math.min(m, dist(p, o.pos)), Infinity);

/** Người gần `p` nhất (bằng nhau thì người đứng trước trong mảng), null nếu mảng rỗng. */
function nearest(p: Vec2, others: readonly PlayerState[]): PlayerState | null {
  let found: PlayerState | null = null;
  for (const o of others) {
    if (found === null || dist(o.pos, p) < dist(found.pos, p)) found = o;
  }
  return found;
}

/** Điểm sút từ `from` (0–1) và điểm nhắm: gần, thẳng góc, đường sút thoáng (không tính thủ môn) thì cao. */
function shotOption(
  team: TeamSide,
  from: Vec2,
  opponents: readonly PlayerState[],
  half: 1 | 2,
): { score: number; target: Vec2 } {
  const sign = attackSign(team, half);
  const goal = vec2(sign * HALF_LENGTH, 0);
  const keeper = opponents.find((o) => o.position === 'GK');
  // Nhắm về phía cột xa thủ môn (toạ độ sân).
  const aimY = keeper ? (keeper.pos.y >= 0 ? -SHOT_AIM_SIDE : SHOT_AIM_SIDE) : 0;
  const target = shotTarget(sign, aimY);
  const d = dist(from, goal);
  if (d > SHOOT_MAX_DIST) return { score: 0, target };
  const straight = d === 0 ? 1 : Math.abs(goal.x - from.x) / d;
  const outfield = opponents.filter((o) => o.position !== 'GK');
  const laneK = clamp(laneClearance(from, target, outfield) / LANE_CLEAR, 0.2, 1);
  return { score: ((1 - d / SHOOT_MAX_DIST) * 0.75 + straight * 0.25) * laneK, target };
}

interface PassOption {
  targetId: string;
  to: Vec2;
  kind: PassKind;
  score: number;
}

/** Mọi đường chuyền khả thi từ `from` của `passer`, kèm điểm (tiến lên, người nhận trống, cơ hội). */
function passOptions(
  passer: PlayerState,
  from: Vec2,
  players: readonly PlayerState[],
  half: 1 | 2,
): PassOption[] {
  const sign = attackSign(passer.team, half);
  const goal = vec2(sign * HALF_LENGTH, 0);
  const opponents = players.filter((p) => p.team !== passer.team);
  const lobRange = lobRangeFor(passer.stats.passing);
  const options: PassOption[] = [];
  for (const t of players) {
    if (t.team !== passer.team || t.id === passer.id || t.position === 'GK') continue;
    const L = dist(from, t.pos);
    if (L < PASS_MIN_DIST) continue;
    let kind: PassKind;
    if (laneClearance(from, t.pos, opponents) >= LANE_CLEAR && L <= GROUND_PASS_MAX_DIST) {
      kind = 'ground';
    } else if (L >= LOB_MIN_DIST && L <= lobRange) {
      kind = 'lob';
    } else {
      continue;
    }
    const progress = clamp((sign * (t.pos.x - from.x)) / PROGRESS_SCALE, -0.5, 1);
    const open = clamp(nearestDist(t.pos, opponents) / OPEN_SPACE, 0, 1);
    const chance = Math.max(0, 1 - dist(t.pos, goal) / CHANCE_DIST);
    const score =
      0.4 * progress + 0.35 * open + 0.15 * chance + (kind === 'ground' ? 0.1 : 0) - 0.004 * L;
    const lead = Math.min(PASS_LEAD_MAX_SEC, L / PASS_LEAD_SPEED);
    options.push({ targetId: t.id, to: add(t.pos, scale(t.vel, lead)), kind, score });
  }
  return options;
}

const best = <T extends { score: number }>(xs: readonly T[]): T | null =>
  xs.reduce<T | null>((b, x) => (b === null || x.score > b.score ? x : b), null);

/** Hướng rê về khung thành đối phương, né người gần, bẻ vào khi sát biên; điểm theo khoảng trống phía trước. */
function dribbleOption(
  carrier: PlayerState,
  opponents: readonly PlayerState[],
  half: 1 | 2,
): { move: Vec2; sprint: boolean; score: number } {
  const { pos } = carrier;
  let dir = normalize(sub(vec2(attackSign(carrier.team, half) * HALF_LENGTH, 0), pos));
  const close = nearest(pos, opponents);
  if (close) {
    const d = dist(close.pos, pos);
    if (d > 0 && d < DRIBBLE_AVOID_DIST) {
      const away = normalize(sub(pos, close.pos));
      dir = add(dir, scale(away, (1 - d / DRIBBLE_AVOID_DIST) * DRIBBLE_AVOID_WEIGHT));
    }
  }
  if (Math.abs(pos.y) > HALF_WIDTH - TOUCHLINE_GAP) dir = add(dir, vec2(0, pos.y > 0 ? -1 : 1));
  dir = normalize(dir);
  let space = DRIBBLE_SPACE_MAX;
  for (const o of opponents) {
    const to = sub(o.pos, pos);
    const d = length(to);
    if (d > 0 && dot(to, dir) / d > DRIBBLE_CONE_COS) space = Math.min(space, d);
  }
  return {
    move: dir,
    sprint: space > DRIBBLE_SPRINT_SPACE && carrier.stamina > DRIBBLE_SPRINT_STAMINA,
    score: 0.3 + 0.3 * (space / DRIBBLE_SPACE_MAX),
  };
}

/** Phát bóng bổng giải nguy về phía khung thành đối phương, không nhắm ai. */
function clearance(carrier: PlayerState, from: Vec2, half: 1 | 2): CarrierAction {
  const dir = normalize(sub(vec2(attackSign(carrier.team, half) * HALF_LENGTH, 0), from));
  const range = lobRangeFor(carrier.stats.passing) * CLEARANCE_RANGE_FRAC;
  return { type: 'pass', kind: 'lob', to: add(from, scale(dir, range)), targetId: null };
}

const passAction = (p: PassOption): CarrierAction => ({
  type: 'pass',
  kind: p.kind,
  to: p.to,
  targetId: p.targetId,
});

/**
 * Quyết định của người có bóng: giữ chưa đủ lâu → rê; cơ hội sút tốt → sút; bị áp sát → sút nếu tạm
 * được và không kém đường chuyền tốt nhất, không thì chuyền, không có ai thì phát bóng giải nguy;
 * ngược lại chuyền nếu hơn rê rõ rệt, không thì rê.
 */
export function decideCarrier(ctx: CarrierContext): CarrierAction {
  const { carrier, players, half } = ctx;
  const opponents = players.filter((p) => p.team !== carrier.team);
  const dribble = dribbleOption(carrier, opponents, half);
  const asDribble: CarrierAction = { type: 'dribble', move: dribble.move, sprint: dribble.sprint };
  if (ctx.heldTicks < ctx.minHoldTicks) return asDribble;

  const shot = shotOption(carrier.team, carrier.pos, opponents, half);
  const shoot: CarrierAction = {
    type: 'shoot',
    target: shot.target,
    power: dist(carrier.pos, shot.target) > SHOT_FULL_POWER_DIST ? 1 : SHOT_NEAR_POWER,
  };
  if (shot.score >= SHOOT_THRESHOLD) return shoot;

  const pass = best(passOptions(carrier, carrier.pos, players, half));
  if (nearestDist(carrier.pos, opponents) < PRESSURE_DIST) {
    if (shot.score >= SHOOT_PRESSURED_MIN && (!pass || shot.score >= pass.score)) return shoot;
    return pass ? passAction(pass) : clearance(carrier, carrier.pos, half);
  }
  if (pass && pass.score > dribble.score + PASS_MARGIN) return passAction(pass);
  return asDribble;
}

/**
 * AI thực hiện bóng chết: phạt đền sút góc ngẫu nhiên; đá phạt có cơ hội thì sút; còn lại chuyền
 * cho người tốt nhất, không có ai thì chuyền vào khoảng trống theo kiểu mặc định (`cpuRestartKick`).
 */
export function decideRestartKick(
  restart: Restart,
  players: readonly PlayerState[],
  half: 1 | 2,
  rng: RngState,
): { action: CarrierAction; rng: RngState } {
  const taker = players.find((p) => p.id === restart.takerId)!;
  const from = restart.spot;
  const sign = attackSign(restart.team, half);
  const opponents = players.filter((p) => p.team !== restart.team);
  if (restart.type === 'penalty') {
    const [f, next] = nextFloat(rng);
    return {
      action: { type: 'shoot', target: shotTarget(sign, f * 2 - 1), power: PENALTY_POWER },
      rng: next,
    };
  }
  if (restart.type === 'free_kick') {
    const shot = shotOption(restart.team, from, opponents, half);
    if (shot.score >= SHOOT_FREE_KICK_MIN) {
      return { action: { type: 'shoot', target: shot.target, power: FREE_KICK_POWER }, rng };
    }
  }
  const pass = best(passOptions(taker, from, players, half));
  if (pass) return { action: passAction(pass), rng };
  const kick = cpuRestartKick(restart, taker);
  const reach =
    kick.kind === 'lob'
      ? lobRangeFor(taker.stats.passing) * CLEARANCE_RANGE_FRAC
      : LOOSE_GROUND_DIST;
  return {
    action: {
      type: 'pass',
      kind: kick.kind,
      to: add(from, scale(normalize(kick.dir), reach)),
      targetId: null,
    },
    rng,
  };
}

/** Chạy chỗ: dời điểm neo ra xa đối phương gần nhất (nếu gần hơn SUPPORT_SPACE), tối đa SUPPORT_MAX_SHIFT. */
export function supportSpot(anchor: Vec2, team: TeamSide, players: readonly PlayerState[]): Vec2 {
  const close = nearest(
    anchor,
    players.filter((p) => p.team !== team),
  );
  if (!close) return anchor;
  const d = dist(close.pos, anchor);
  if (d >= SUPPORT_SPACE) return anchor;
  const away = d > 0 ? normalize(sub(anchor, close.pos)) : COINCIDENT_DIR;
  return add(anchor, scale(away, Math.min(SUPPORT_SPACE - d, SUPPORT_MAX_SHIFT)));
}
