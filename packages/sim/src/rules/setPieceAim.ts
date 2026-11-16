import { MIN_SHOT_POWER } from '../actions/shoot';
import {
  add,
  clampLength,
  length,
  normalize,
  scale,
  sub,
  vec2,
  ZERO,
  type Vec2,
} from '../math/vec2';
import { GRAVITY } from '../physics/ball';
import { GOAL_HEIGHT, GOAL_WIDTH, HALF_LENGTH } from '../pitch';
import { nextFloat, nextGaussian, type RngState } from '../rng';
import { fatigueFactor, shotSpeedFor, statScale } from '../stats/params';
import { TICK_DT } from '../tick';
import type { BallState, PlayerState, Restart, RestartType } from '../types';
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
/** Chạm đáy bóng: vận tốc đứng ×(1 + CONTACT_LIFT); chạm đỉnh bóng thì bóng đi sệt (×0). */
export const CONTACT_LIFT = 0.5;
/**
 * Chạm lệch thì bóng bổng tối thiểu CONTACT_LIFT_VZ × hệ số m/s: chạm mép 9h/3h = 6 m/s (đỉnh ~1,7 m,
 * tầm trung), 7h30/4h30 ≈ 8 m/s (cao hơn), 10h30 ≈ 3 m/s (thấp), 12h thì sệt.
 * Xoáy chỉ bẻ cong bóng khi bóng bay (`physics/ball.ts`) nên phải nâng bóng mới thấy đường cong.
 */
export const CONTACT_LIFT_VZ = 6;
/** Sai số độ xoáy (độ lệch chuẩn, tỉ lệ) theo chỉ số Sút: Sút thấp cong thất thường. */
export const CONTACT_SPIN_ERR_RANGE = [0.45, 0.06] as const;
/** Chạm mép bóng mất bấy nhiêu phần tốc độ so với sút căng giữa bóng. */
export const CONTACT_SLOW = 0.15;

export interface ContactKick {
  spinSide: number;
  spinTop: number;
  vzMult: number;
  /** Vận tốc đứng tối thiểu (m/s) sau khi chạm. */
  liftVz: number;
  speedMult: number;
}

/**
 * Điểm chạm → quỹ đạo. Chạm lệch phải (má trong chân phải) thì bóng cong sang trái và ngược lại
 * (`BallSpin.side` > 0 cong về `rightOf`). Chạm thấp: bóng bổng, xoáy ngược; chạm đỉnh: bóng sệt.
 * Chạm giữa: sút căng, không xoáy.
 */
export function contactKick(contact: Vec2): ContactKick {
  const off = Math.min(1, length(contact));
  return {
    // 0 − … để không sinh -0 trong state.
    spinSide: 0 - contact.x * CONTACT_SPIN,
    spinTop: 0 + contact.y * CONTACT_SPIN,
    vzMult: contact.y > 0 ? 1 - contact.y : 1 - contact.y * CONTACT_LIFT,
    // Nửa trên giảm theo y² để 10h30 vẫn bổng nhẹ (còn cong), 12h mới sệt hẳn.
    liftVz: CONTACT_LIFT_VZ * Math.max(0, off - (contact.y > 0 ? contact.y * contact.y : contact.y / 2)),
    speedMult: 1 - off * CONTACT_SLOW,
  };
}

/*
 * Phạt đền của người chơi: giữ D lấy lực, nhả D thì lấy đà PENALTY_RUNUP_TICKS; trong lúc lấy đà
 * mũi tên trái/phải dời vòng tròn ngắm trên khung thành. Bóng đi vào một điểm ngẫu nhiên (PRNG sim)
 * trong vòng; vòng to hơn khi sút quá lực, chỉ số Sút thấp, hoặc mệt.
 */

/** Pha lấy đà phạt đền (0,8 s). */
export const PENALTY_RUNUP_TICKS = Math.round(0.8 / TICK_DT);
/** Tốc độ dời tâm vòng ngắm (m/s) khi giữ mũi tên. */
export const PENALTY_AIM_SPEED = 4;
/** Tâm vòng ngắm không ra xa hơn chừng này mét khỏi giữa khung thành. */
export const PENALTY_AIM_MAX_Y = GOAL_WIDTH / 2 + 0.5;
/** Độ cao (m) tâm vòng ngắm theo lực: lực nhỏ nhất → [0], hết lực → [1] (xà ở GOAL_HEIGHT). */
export const PENALTY_AIM_Z_RANGE = [0.35, GOAL_HEIGHT * 0.65] as const;
/** Bán kính vòng nhân hệ số này theo lực: lực nhỏ nhất → [0], hết lực → [1] (chưa tính quá lực). */
export const PENALTY_RADIUS_POWER_RANGE = [0.6, 1.16] as const;

/** Lực 0…1 quy về t 0…1 trên đoạn MIN_SHOT_POWER…1. */
const powerT = (power: number): number =>
  Math.min(1, Math.max(0, (power - MIN_SHOT_POWER) / (1 - MIN_SHOT_POWER)));

/** Độ cao (m) tâm vòng ngắm: sút càng mạnh vòng càng lên cao. */
export function penaltyAimZ(power: number): number {
  const [lo, hi] = PENALTY_AIM_Z_RANGE;
  return lo + (hi - lo) * powerT(power);
}
/**
 * Bán kính vòng ngắm (m) theo Sút: chỉ số 1 → [0], 99 → [1]. Cân để người chơi nhắm sát góc vào
 * ~82% trước máy Dễ, ~71% trước máy Khó (`match.penalty.test.ts`; thu nhỏ từ [1,55; 0,65] ngày 16/11).
 */
export const PENALTY_RADIUS_RANGE = [1.15, 0.5] as const;
/** Lực vượt ngưỡng này thì vòng nở ra, mỗi 0,1 lực vượt thêm PENALTY_OVERPOWER_GROW/10. */
export const PENALTY_OVERPOWER_FROM = 0.8;
export const PENALTY_OVERPOWER_GROW = 2.5;

/** Bán kính vòng ngắm phạt đền (m). */
export function penaltyRadius(shooter: PlayerState, power: number): number {
  const over = Math.max(0, power - PENALTY_OVERPOWER_FROM) * PENALTY_OVERPOWER_GROW;
  const [lo, hi] = PENALTY_RADIUS_POWER_RANGE;
  const byPower = lo + (hi - lo) * powerT(power);
  return (
    (statScale(shooter.stats.shooting, ...PENALTY_RADIUS_RANGE) * byPower * (1 + over)) /
    fatigueFactor(shooter.stamina)
  );
}

/** Dời tâm vòng ngắm một tick theo mũi tên (move.x > 0 = sang phải khi nhìn từ sau lưng). */
export function movePenaltyAim(y: number, moveX: number, goalSign: 1 | -1): number {
  const next = y + moveX * goalSign * PENALTY_AIM_SPEED * TICK_DT;
  return Math.min(PENALTY_AIM_MAX_Y, Math.max(-PENALTY_AIM_MAX_Y, next));
}

/**
 * Sút phạt đền vào một điểm ngẫu nhiên trong vòng tròn tâm (vạch cuối, y, penaltyAimZ): điểm trong
 * hình vuông kẹp vào hình tròn (dày hơn ở mép, đủ dùng). Vận tốc đứng tính để bóng tới khung thành ở
 * đúng độ cao (bỏ qua cản gió như `shootBall`). PRNG tiến 2 lần.
 */
export function penaltyShot(
  shooter: PlayerState,
  spot: Vec2,
  goalSign: 1 | -1,
  y: number,
  power: number,
  rng: RngState,
): { ball: BallState; rng: RngState } {
  const [u, r1] = nextFloat(rng);
  const [v, r2] = nextFloat(r1);
  const off = scale(clampLength(vec2(u * 2 - 1, v * 2 - 1), 1), penaltyRadius(shooter, power));
  const target = vec2(goalSign * HALF_LENGTH, y + off.x);
  const z = Math.max(0, penaltyAimZ(power) + off.y);
  const offset = sub(target, spot);
  const dist = Math.max(1, length(offset));
  const p = Math.min(1, Math.max(MIN_SHOT_POWER, power));
  const speed = shotSpeedFor(shooter.stats.shooting) * p;
  const t = dist / speed;
  const vz = Math.max(0, z / t + 0.5 * GRAVITY * t);
  return { ball: { pos: spot, vel: scale(offset, speed / dist), z: 0, vz }, rng: r2 };
}

/**
 * Áp điểm chạm lên bóng vừa đá; chạm giữa (hoặc chưa chọn) thì giữ nguyên. Độ xoáy cạnh lệch ngẫu
 * nhiên theo chỉ số Sút (`shooting`) của người đá.
 */
export function kickWithContact(
  ball: BallState,
  contact: Vec2 | undefined,
  shooting: number,
  rng: RngState,
): { ball: BallState; rng: RngState } {
  if (!contact || (contact.x === 0 && contact.y === 0)) return { ball, rng };
  const k = contactKick(contact);
  const [g, r] = nextGaussian(rng);
  const side = k.spinSide * (1 + g * statScale(shooting, ...CONTACT_SPIN_ERR_RANGE));
  return {
    ball: {
      ...ball,
      vel: scale(ball.vel, k.speedMult),
      vz: Math.max(0, ball.vz * k.vzMult, k.liftVz),
      spin: { side: 0 + side, top: k.spinTop },
    },
    rng: r,
  };
}
