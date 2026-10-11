import { dot, length, normalize, scale, sub, type Vec2 } from '../math/vec2';
import { AIR_DRAG, GRAVITY, ROLL_DECEL } from '../physics/ball';
import { nextGaussian, type RngState } from '../rng';
import { fatigueFactor, passAngleErrFor, passPowerErrFor } from '../stats/params';
import type { BallState, PlayerState } from '../types';
import { deviate } from './aim';

/** Chuyền thấp (J) lăn trên cỏ; chuyền bổng (L) bay qua đầu. */
export type PassKind = 'ground' | 'lob';

/** Đồng đội lệch quá góc này so với hướng bấm thì không được chọn (cos 60°). */
export const PASS_CONE_COS = 0.5;
/** Phạt điểm theo khoảng cách khi chọn người nhận (mỗi mét). */
export const PASS_DIST_PENALTY = 0.01;
/** Vận tốc bóng chuyền thấp khi tới chân người nhận (m/s). */
export const PASS_ARRIVAL_SPEED = 3;
/** Chuyền bổng chạm đất ở tỉ lệ này của khoảng cách, phần còn lại lăn tới. */
export const LOB_CARRY = 0.8;
/** Bù cản không khí cho vận tốc chuyền bổng (tính không cản rồi nhân hệ số này). */
export const LOB_DRAG_COMP = 1.08;

/**
 * Đồng đội tốt nhất theo hướng `dir`: trong hình nón ±60°, điểm = cos(góc lệch) − phạt khoảng cách.
 * Null nếu không có ai (trong tầm `maxRange`).
 */
export function choosePassTarget(
  players: readonly PlayerState[],
  passer: PlayerState,
  dir: Vec2,
  maxRange = Infinity,
): PlayerState | null {
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
    const score = cos - dist * PASS_DIST_PENALTY;
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best;
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
 * Vận tốc ban đầu để bóng lăn `dist` mét rồi còn PASS_ARRIVAL_SPEED. Giải đúng mô hình lăn của
 * `physics/ball.ts`: d(v²)/dx = −2(a + k·v²) ⇒ v0² = (va² + a/k)·e^{2k·d} − a/k.
 */
export function groundPassSpeed(dist: number): number {
  const a = ROLL_DECEL;
  const k = AIR_DRAG;
  const va2 = PASS_ARRIVAL_SPEED * PASS_ARRIVAL_SPEED;
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
): { ball: BallState; rng: RngState } {
  // Sai số chia cho hệ số này: mệt và errorMult > 1 đều làm sai số lớn hơn.
  const fatigue = fatigueFactor(passer.stamina) / errorMult;
  const offset = sub(to, from);
  const dist = length(offset);
  const aim = dist > 0 ? offset : passer.facing;
  const [dir, r1] = deviate(aim, passAngleErrFor(passer.stats.passing) / fatigue, rng);
  const [g, r2] = nextGaussian(r1);
  const power = Math.max(0.2, 1 + (g * passPowerErrFor(passer.stats.passing)) / fatigue);

  if (kind === 'ground') {
    return {
      ball: { pos: from, vel: scale(dir, groundPassSpeed(dist) * power), z: 0, vz: 0 },
      rng: r2,
    };
  }
  // Góc bay 45°: tầm bay (không cản) = 2·v²/g.
  const v = Math.sqrt((LOB_CARRY * dist * GRAVITY) / 2) * LOB_DRAG_COMP * power;
  return { ball: { pos: from, vel: scale(dir, v), z: 0, vz: v }, rng: r2 };
}
