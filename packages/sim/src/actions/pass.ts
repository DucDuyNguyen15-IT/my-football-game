import { add, clampLength, dot, length, normalize, scale, sub, type Vec2 } from '../math/vec2';
import { AIR_DRAG, GRAVITY, ROLL_DECEL } from '../physics/ball';
import { nextGaussian, type RngState } from '../rng';
import { TICK_DT } from '../tick';
import { fatigueFactor, passAngleErrFor, passPowerErrFor } from '../stats/params';
import type { BallState, PlayerState } from '../types';
import { deviate } from './aim';

/** Chuyền thấp (J) lăn trên cỏ; chuyền bổng (L) bay qua đầu. */
export type PassKind = 'ground' | 'lob';

/** Đồng đội lệch quá góc này so với hướng bấm thì không được chọn (cos 60°). */
export const PASS_CONE_COS = 0.5;
/** Phạt điểm theo khoảng cách khi chọn người nhận (mỗi mét). */
export const PASS_DIST_PENALTY = 0.01;
/** Vận tốc bóng chuyền thấp khi tới chân người nhận (m/s). 3 → 6 ở 5.17: chuyền chậm quá, dễ bị cắt. */
export const PASS_ARRIVAL_SPEED = 6;
/** Chuyền bổng chạm đất ở tỉ lệ này của khoảng cách, phần còn lại lăn tới. */
export const LOB_CARRY = 0.8;
/** Bù cản không khí cho vận tốc chuyền bổng (tính không cản rồi nhân hệ số này). */
export const LOB_DRAG_COMP = 1.08;

/** Đối thủ cách đường chuyền sệt dưới mức này (m) thì tính là chắn đường. */
export const PASS_LANE_WIDTH = 1.5;
/** Phạt điểm khi đối thủ đứng ngay trên đường chuyền; giảm tuyến tính về 0 ở mép PASS_LANE_WIDTH. */
export const PASS_LANE_PENALTY = 0.5;
/** Chuyền đón trước người nhận đang chạy tối đa chừng này mét. */
export const PASS_LEAD_MAX = 5;

/*
 * Lực chuyền (giữ S/A rồi nhả, PRD §5 đổi 2026-10-14): lực 0 = bấm nhanh, chuyền y như trước khi có
 * thanh lực; lực 1 = ưu tiên người nhận xa hơn, bóng sệt căng hơn, chuyền khoảng trống xa hơn.
 */
/** Giữ ngắn hơn chừng này tick vẫn tính là bấm nhanh (lực 0). */
export const PASS_TAP_TICKS = 6;
/** Giữ tới chừng này tick (0,8 s) thì đầy thanh lực chuyền. */
export const PASS_FULL_CHARGE_TICKS = 48;
/** Lực đầy: ưu tiên người nhận cách chừng này mét. */
export const PASS_POWER_PREF_DIST = 30;
/** Lực 0: khoảng cách ưu tiên ngắn nhất (m). */
const PASS_POWER_MIN_DIST = 8;
/** Phạt điểm mỗi mét lệch khỏi khoảng cách ưu tiên, nhân với lực. */
export const PASS_POWER_DIST_WEIGHT = 0.03;
/** Lực đầy cộng thêm chừng này m/s vào vận tốc bóng sệt khi tới chân người nhận. */
export const PASS_POWER_ARRIVAL_BONUS = 6;

/** Lực chuyền 0…1 theo số tick đã giữ S/A. */
export function passPower(chargeTicks: number): number {
  const t = (chargeTicks - PASS_TAP_TICKS) / (PASS_FULL_CHARGE_TICKS - PASS_TAP_TICKS);
  return Math.min(1, Math.max(0, t));
}

/** Khoảng cách từ `p` tới đoạn `a`→`b`; null nếu `p` không nằm giữa hai đầu (trước `a` hoặc sau `b`). */
function distToLane(p: Vec2, a: Vec2, b: Vec2): number | null {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  if (len2 === 0) return null;
  const t = dot(sub(p, a), ab) / len2;
  if (t <= 0 || t >= 1) return null;
  return length(sub(p, add(a, scale(ab, t))));
}

/** Phạt chắn đường lớn nhất trong các đối thủ đứng giữa người chuyền và người nhận. */
function lanePenalty(players: readonly PlayerState[], passer: PlayerState, to: Vec2): number {
  let worst = 0;
  for (const o of players) {
    if (o.team === passer.team) continue;
    const d = distToLane(o.pos, passer.pos, to);
    if (d === null || d >= PASS_LANE_WIDTH) continue;
    worst = Math.max(worst, PASS_LANE_PENALTY * (1 - d / PASS_LANE_WIDTH));
  }
  return worst;
}

/**
 * Đồng đội tốt nhất theo hướng `dir`: trong hình nón ±60°, điểm = cos(góc lệch) − phạt khoảng cách
 * − phạt đối thủ chắn đường (chỉ chuyền sệt; chuyền bổng bay qua đầu). Null nếu không có ai
 * (trong tầm `maxRange`).
 */
export function choosePassTarget(
  players: readonly PlayerState[],
  passer: PlayerState,
  dir: Vec2,
  maxRange = Infinity,
  kind: PassKind = 'ground',
  power = 0,
): PlayerState | null {
  const prefDist = PASS_POWER_MIN_DIST + (PASS_POWER_PREF_DIST - PASS_POWER_MIN_DIST) * power;
  const unit = normalize(dir);
  let best: PlayerState | null = null;
  let bestScore = -Infinity;
  for (const p of players) {
    if (p.team !== passer.team || p.id === passer.id) continue;
    const to = sub(p.pos, passer.pos);
    const dist = length(to);
    if (dist === 0 || dist > maxRange) continue;
    const cos = dot(unit, to) / dist;
    if (cos < PASS_CONE_COS) continue;
    const blocked = kind === 'ground' ? lanePenalty(players, passer, p.pos) : 0;
    const reach = power * Math.abs(dist - prefDist) * PASS_POWER_DIST_WEIGHT;
    const score = cos - dist * PASS_DIST_PENALTY - blocked - reach;
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Thời gian (s) bóng đi hết `dist` mét. Sệt: tích phân từng tick đúng mô hình lăn của
 * `physics/ball.ts` (chỉ + − × ÷, tất định). Bổng: thời gian bay (không cản) + lăn nốt phần còn lại.
 */
function passTravelTime(dist: number, kind: PassKind): number {
  if (kind === 'lob') {
    const v = Math.sqrt((LOB_CARRY * dist * GRAVITY) / 2) * LOB_DRAG_COMP;
    return (2 * v) / GRAVITY + ((1 - LOB_CARRY) * dist) / Math.max(1, v / 2);
  }
  let v = groundPassSpeed(dist);
  let x = 0;
  let t = 0;
  while (x < dist && v > 0 && t < 10) {
    x += v * TICK_DT;
    v -= (ROLL_DECEL + AIR_DRAG * v * v) * TICK_DT;
    t += TICK_DT;
  }
  return t;
}

/**
 * Điểm chuyền đón trước: chỗ người nhận sẽ tới khi bóng tới, theo vận tốc hiện tại, tối đa
 * PASS_LEAD_MAX mét. Người nhận đứng yên thì chuyền vào chân.
 */
export function passLeadPoint(from: Vec2, receiver: PlayerState, kind: PassKind): Vec2 {
  if (receiver.vel.x === 0 && receiver.vel.y === 0) return receiver.pos;
  let point = receiver.pos;
  // Thời gian bóng đi phụ thuộc điểm đích; lặp vài lần cho hội tụ.
  for (let i = 0; i < 3; i++) {
    const t = passTravelTime(length(sub(point, from)), kind);
    point = add(receiver.pos, clampLength(scale(receiver.vel, t), PASS_LEAD_MAX));
  }
  return point;
}

/** e^x bằng chuỗi Taylor (chỉ + − × ÷, tất định giữa các engine); đủ chính xác với 0 ≤ x ≤ 3. */
function expTaylor(x: number): number {
  let term = 1;
  let sum = 1;
  for (let n = 1; n <= 16; n++) {
    term = (term * x) / n;
    sum += term;
  }
  return sum;
}

/**
 * Vận tốc ban đầu để bóng lăn `dist` mét rồi còn `arrival` m/s. Giải đúng mô hình lăn của
 * `physics/ball.ts`: d(v²)/dx = −2(a + k·v²) ⇒ v0² = (va² + a/k)·e^{2k·d} − a/k.
 */
export function groundPassSpeed(dist: number, arrival = PASS_ARRIVAL_SPEED): number {
  const a = ROLL_DECEL;
  const k = AIR_DRAG;
  const va2 = arrival * arrival;
  return Math.sqrt((va2 + a / k) * expTaylor(2 * k * Math.max(0, dist)) - a / k);
}

/**
 * Sút bóng từ `from` về `to` (chuyền thấp hoặc bổng), sai số góc/lực theo Chuyền và thể lực,
 * nhân thêm `errorMult` (AI theo mức độ khó). Hàm thuần: trả về bóng mới và PRNG đã tiến.
 */
export function passBall(
  passer: PlayerState,
  from: Vec2,
  to: Vec2,
  kind: PassKind,
  rng: RngState,
  errorMult = 1,
  /** Lực chuyền 0…1 của người chơi: bóng sệt tới chân nhanh hơn. */
  passPow = 0,
): { ball: BallState; rng: RngState } {
  // Sai số chia cho hệ số này: mệt và errorMult > 1 đều làm sai số lớn hơn.
  const fatigue = fatigueFactor(passer.stamina) / errorMult;
  const offset = sub(to, from);
  const dist = length(offset);
  const aim = dist > 0 ? offset : passer.facing;
  const [dir, r1] = deviate(aim, passAngleErrFor(passer.stats.passing) / fatigue, rng);
  const [g, r2] = nextGaussian(r1);
  const power = Math.max(0.2, 1 + (g * passPowerErrFor(passer.stats.passing)) / fatigue);
  const arrival = PASS_ARRIVAL_SPEED + PASS_POWER_ARRIVAL_BONUS * passPow;

  if (kind === 'ground') {
    return {
      ball: {
        pos: from,
        vel: scale(dir, groundPassSpeed(dist, arrival) * power),
        z: 0,
        vz: 0,
      },
      rng: r2,
    };
  }
  // Góc bay 45°: tầm bay (không cản) = 2·v²/g.
  const v = Math.sqrt((LOB_CARRY * dist * GRAVITY) / 2) * LOB_DRAG_COMP * power;
  return { ball: { pos: from, vel: scale(dir, v), z: 0, vz: v }, rng: r2 };
}
