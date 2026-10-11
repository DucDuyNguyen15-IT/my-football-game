import { TICK_DT } from '../tick';
import { add, dot, length, scale, sub, vec2, ZERO, type Vec2 } from '../math/vec2';
import { BALL_RADIUS, GOAL_HEIGHT, GOAL_WIDTH, HALF_LENGTH, HALF_WIDTH } from '../pitch';
import type { BallState, TeamSide } from '../types';

/*
 * Vật lý bóng: 2D trên mặt sân + độ cao z. `z` là khoảng cách từ mặt cỏ tới đáy bóng,
 * nên tâm bóng ở độ cao z + BALL_RADIUS. Chỉ dùng + − × ÷ và sqrt để tất định giữa các engine.
 * Hằng số đặt ở đây để cân chỉnh ở task 5.13.
 */

/** Gia tốc trọng trường (m/s²). */
export const GRAVITY = 9.81;
/** Giảm tốc do ma sát lăn trên cỏ (m/s²). */
export const ROLL_DECEL = 2;
/** Cản không khí: gia tốc = AIR_DRAG × v² (1/m), ≈ ½ρCdA/m của bóng số 5. */
export const AIR_DRAG = 0.013;
/** Hệ số hồi phục khi nảy trên cỏ (vz sau / vz trước). */
export const BOUNCE_RESTITUTION = 0.55;
/** Vận tốc ngang còn lại sau mỗi lần nảy. */
export const BOUNCE_FRICTION = 0.85;
/** Nảy yếu hơn mức này (m/s) thì coi như bóng lăn. */
export const MIN_BOUNCE_VZ = 0.6;

/** Bán kính cột dọc/xà ngang (m). Mép trong cột ở |y| = GOAL_WIDTH/2, mép dưới xà ở GOAL_HEIGHT. */
export const POST_RADIUS = 0.06;
export const POST_RESTITUTION = 0.6;
/** Độ sâu lưới tính từ vạch cuối (m). */
export const GOAL_DEPTH = 1.5;
/** Vận tốc còn lại khi bóng chạm lưới (lưới hút lực). */
export const NET_DAMPING = 0.2;

/** Quãng đường tối đa mỗi bước con — nhỏ hơn BALL_RADIUS + POST_RADIUS để không xuyên cột. */
const MAX_SUBSTEP_DIST = 0.08;

const POST_HIT_DIST = BALL_RADIUS + POST_RADIUS;
const POST_Y = GOAL_WIDTH / 2 + POST_RADIUS;
const BAR_Z = GOAL_HEIGHT + POST_RADIUS;

export type BallEvent =
  { type: 'ball_out'; line: 'touch' | 'goal'; point: Vec2 } | { type: 'goal'; team: TeamSide };

export interface BallStepResult {
  ball: BallState;
  /** Sự kiện phát ra đúng tick bóng qua hẳn vạch (tối đa một sự kiện). */
  events: BallEvent[];
}

const other = (team: TeamSide): TeamSide => (team === 'home' ? 'away' : 'home');

const isOut = (p: Vec2): boolean =>
  Math.abs(p.x) > HALF_LENGTH + BALL_RADIUS || Math.abs(p.y) > HALF_WIDTH + BALL_RADIUS;

/** Va chạm với vật tròn cố định trong mặt phẳng (a, b); null nếu không chạm. */
function bounceOffCircle(
  pa: number,
  pb: number,
  va: number,
  vb: number,
  ca: number,
  cb: number,
): [pa: number, pb: number, va: number, vb: number] | null {
  const d = vec2(pa - ca, pb - cb);
  const dist = length(d);
  if (dist >= POST_HIT_DIST || dist === 0) return null;
  const n = scale(d, 1 / dist);
  const v = vec2(va, vb);
  const vn = dot(v, n);
  const vOut = vn < 0 ? sub(v, scale(n, (1 + POST_RESTITUTION) * vn)) : v;
  return [ca + n.x * POST_HIT_DIST, cb + n.y * POST_HIT_DIST, vOut.x, vOut.y];
}

/** Cột dọc (hình trụ đứng) và xà ngang (hình trụ nằm dọc trục y) ở cả hai khung thành. */
function collideGoalFrame(b: BallState): BallState {
  let { pos, vel, z, vz } = b;
  for (const sx of [1, -1]) {
    const gx = sx * HALF_LENGTH;
    if (Math.abs(pos.x - gx) >= POST_HIT_DIST) continue;
    if (z + BALL_RADIUS < BAR_Z + POST_RADIUS) {
      for (const sy of [1, -1]) {
        const hit = bounceOffCircle(pos.x, pos.y, vel.x, vel.y, gx, sy * POST_Y);
        if (hit) {
          pos = vec2(hit[0], hit[1]);
          vel = vec2(hit[2], hit[3]);
        }
      }
    }
    if (Math.abs(pos.y) <= POST_Y) {
      const hit = bounceOffCircle(pos.x, z + BALL_RADIUS, vel.x, vz, gx, BAR_Z);
      if (hit) {
        pos = vec2(hit[0], pos.y);
        z = Math.max(0, hit[1] - BALL_RADIUS);
        vel = vec2(hit[2], vel.y);
        vz = hit[3];
      }
    }
  }
  return { pos, vel, z, vz };
}

/** Lưới: bóng đã vào khung thành thì bị giữ trong hộp sau vạch cuối, dưới xà, giữa hai cột. */
function containInNet(b: BallState): BallState {
  const sx = b.pos.x > 0 ? 1 : -1;
  const depth = sx * b.pos.x - HALF_LENGTH;
  // Dư 1 m phía sau: mỗi bước con đi < 0.1 m nên bóng không thể vượt qua mà không bị giữ.
  const inGoal =
    depth > 0 &&
    depth < GOAL_DEPTH + 1 &&
    Math.abs(b.pos.y) < GOAL_WIDTH / 2 &&
    b.z + BALL_RADIUS < GOAL_HEIGHT;
  if (!inGoal) return b;

  let { x, y } = b.pos;
  let { x: vx, y: vy } = b.vel;
  let { z, vz } = b;
  const backX = HALF_LENGTH + GOAL_DEPTH - BALL_RADIUS;
  if (sx * x > backX) {
    x = sx * backX;
    vx = 0;
    vy *= NET_DAMPING;
    vz *= NET_DAMPING;
  }
  const sideY = GOAL_WIDTH / 2 - BALL_RADIUS;
  if (Math.abs(y) > sideY) {
    y = Math.sign(y) * sideY;
    vy = 0;
    vx *= NET_DAMPING;
  }
  const roofZ = GOAL_HEIGHT - 2 * BALL_RADIUS;
  if (z > roofZ) {
    z = roofZ;
    vz = Math.min(vz, 0);
  }
  return { pos: vec2(x, y), vel: vec2(vx, vy), z, vz };
}

/** Lăn (ma sát + cản gió) hoặc bay (trọng lực + cản gió), rồi tịnh tiến và nảy trên cỏ. */
function integrate(b: BallState, h: number): BallState {
  const onGround = b.z === 0 && b.vz === 0;
  let vel: Vec2;
  let vz: number;
  if (onGround) {
    const speed = length(b.vel);
    const newSpeed = speed - (ROLL_DECEL + AIR_DRAG * speed * speed) * h;
    vel = newSpeed > 0 ? scale(b.vel, newSpeed / speed) : ZERO;
    vz = 0;
  } else {
    const speed3 = Math.sqrt(dot(b.vel, b.vel) + b.vz * b.vz);
    const keep = Math.max(0, 1 - AIR_DRAG * speed3 * h);
    vel = scale(b.vel, keep);
    vz = b.vz * keep - GRAVITY * h;
  }

  const pos = add(b.pos, scale(vel, h));
  let z = b.z + vz * h;
  if (z <= 0 && !onGround) {
    z = 0;
    vz = -vz * BOUNCE_RESTITUTION;
    vel = scale(vel, BOUNCE_FRICTION);
    if (vz < MIN_BOUNCE_VZ) vz = 0;
  }
  return { pos, vel, z, vz };
}

/** Sự kiện khi tâm bóng đi từ `a` (trong sân) tới `b` (ngoài sân): chọn vạch bị vượt trước. */
function crossingEvent(a: BallState, b: BallState, attackingPlusX: TeamSide): BallEvent {
  const tAt = (from: number, to: number, limit: number): number => {
    if (Math.abs(to) <= limit) return Infinity;
    const edge = Math.sign(to) * limit;
    return (edge - from) / (to - from);
  };
  const tGoal = tAt(a.pos.x, b.pos.x, HALF_LENGTH + BALL_RADIUS);
  const tTouch = tAt(a.pos.y, b.pos.y, HALF_WIDTH + BALL_RADIUS);
  const t = Math.min(tGoal, tTouch);
  const at = add(a.pos, scale(sub(b.pos, a.pos), t));
  const sx = Math.sign(b.pos.x);
  const sy = Math.sign(b.pos.y);

  if (tTouch < tGoal) {
    return { type: 'ball_out', line: 'touch', point: vec2(at.x, sy * HALF_WIDTH) };
  }
  const zAt = a.z + (b.z - a.z) * t;
  if (Math.abs(at.y) < GOAL_WIDTH / 2 && zAt + BALL_RADIUS < GOAL_HEIGHT) {
    return { type: 'goal', team: sx > 0 ? attackingPlusX : other(attackingPlusX) };
  }
  return { type: 'ball_out', line: 'goal', point: vec2(sx * HALF_LENGTH, at.y) };
}

/**
 * Chạy vật lý bóng một tick. Hàm thuần.
 * @param attackingPlusX đội đang tấn công về khung thành phía +x (đổi sau giờ nghỉ).
 */
export function stepBall(
  ball: BallState,
  attackingPlusX: TeamSide,
  dt: number = TICK_DT,
): BallStepResult {
  if (ball.z === 0 && ball.vz === 0 && ball.vel.x === 0 && ball.vel.y === 0) {
    return { ball, events: [] };
  }
  const speed3 = Math.sqrt(dot(ball.vel, ball.vel) + ball.vz * ball.vz);
  // State hỏng (NaN/Infinity) phải lộ ra ngay, không được làm treo vòng lặp bước con.
  if (!Number.isFinite(speed3) || !Number.isFinite(ball.z)) {
    throw new RangeError(`Trạng thái bóng không hữu hạn: ${JSON.stringify(ball)}`);
  }
  const substeps = Math.max(1, Math.ceil((speed3 * dt) / MAX_SUBSTEP_DIST));
  const h = dt / substeps;

  let b = ball;
  const events: BallEvent[] = [];
  for (let i = 0; i < substeps; i++) {
    const prev = b;
    b = containInNet(collideGoalFrame(integrate(b, h)));
    if (events.length === 0 && !isOut(prev.pos) && isOut(b.pos)) {
      events.push(crossingEvent(prev, b, attackingPlusX));
    }
  }
  return { ball: b, events };
}
