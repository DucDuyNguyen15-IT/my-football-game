/**
 * "Diễn tiếp" pha bóng trước khi khép stinger (phạm lỗi, bóng ra biên), thuần (không Three.js/DOM).
 *
 * Ở tick trọng tài thổi phạt / bóng ra ngoài, sim đã đặt bóng về chấm đá phạt và đặt thẳng mọi cầu thủ
 * vào vị trí của tình huống (luật 2). Người xem không được thấy cú nhảy đó: renderer giữ khung bóng
 * sống ngay trước đó (`prev`) rồi cho nó trôi tiếp như thật tới khi stinger che kín (`onCovered`) mới
 * vẽ vị trí mới: mọi người
 * chạy chậm dần tới khi dừng hẳn (tiếng còi), người bị phạm lỗi té và trượt theo quán tính, bóng lăn
 * tiếp (bóng ra biên thì lăn qua vạch, bóng vào khung thành thì dừng ở lưới). Hết `delaySec` mới bắt
 * đầu khép stinger. Sim vẫn chạy phía sau (cầu thủ đã đứng sẵn ở vị trí mới), nhưng renderer không đưa
 * phím vào sim trong lúc giữ: người chơi không điều khiển được cảnh mình chưa nhìn thấy.
 *
 * Mọi đối tượng được cấp phát một lần lúc tạo; `advance` chỉ ghi đè số trong chỗ (không cấp phát mỗi
 * khung hình).
 */
import {
  GOAL_HEIGHT,
  GOAL_WIDTH,
  HALF_LENGTH,
  HALF_WIDTH,
  type MatchState,
  type PlayerState,
} from '@pitch/sim';
import type { FoulSummary, TransitionSpec } from './transition';

/** Giảm tốc của cầu thủ khi nghe còi (m/s²): chạy 6 m/s dừng hẳn sau ~1 s. */
export const PLAYER_STOP_DECEL = 6;
/** Giảm tốc khi người bị phạm lỗi trượt trên cỏ (m/s²). */
export const VICTIM_SLIDE_DECEL = 5;
/** Người bị phạm lỗi luôn trượt ít nhất với vận tốc này (m/s) để thấy rõ cú ngã. */
export const VICTIM_MIN_SLIDE_SPEED = 2.5;
/** Trần vận tốc trượt (m/s): nước rút rồi ngã cũng không trượt quá ~4 m. */
export const VICTIM_MAX_SLIDE_SPEED = 6;
/** Giảm tốc của bóng lăn trên cỏ (m/s²). */
export const BALL_ROLL_DECEL = 3;
/** Bóng ra ngoài lăn tối đa tới chừng này (m) ngoài vạch, không xuyên qua biển quảng cáo. */
export const BALL_OUT_LIMIT = 4;
/** Bóng vào khung thành dừng ở lưới, cách vạch vôi chừng này (m) — khớp chỗ rung lưới của renderer. */
export const NET_DEPTH = 0.45;
/** Thời gian ngã từ đứng thẳng tới nằm sân (giây) — chỉ dùng cho cầu thủ khối (chưa nạp model). */
export const FALL_TILT_SEC = 0.4;
/** Góc nghiêng tối đa khi nằm sân (rad, ~80°). */
export const FALL_TILT_MAX = 1.4;
const GRAVITY = 9.81;

type MutableVec2 = { x: number; y: number };

/**
 * Quãng đường đi được sau `t` giây khi bắt đầu với vận tốc `v0` và giảm tốc đều `decel` tới khi dừng.
 */
export function glideDistance(v0: number, decel: number, t: number): number {
  if (v0 <= 0 || t <= 0) return 0;
  if (decel <= 0) return v0 * t;
  const stopT = v0 / decel;
  const tt = Math.min(t, stopT);
  return v0 * tt - 0.5 * decel * tt * tt;
}

/** Vận tốc còn lại sau `t` giây giảm tốc đều. */
export function glideSpeed(v0: number, decel: number, t: number): number {
  if (v0 <= 0) return 0;
  return Math.max(0, v0 - Math.max(0, decel) * Math.max(0, t));
}

/** Góc nghiêng ngã về trước (rad) của cầu thủ khối sau `t` giây kể từ lúc bị phạm lỗi. */
export function fallTilt(t: number): number {
  if (t <= 0) return 0;
  const u = Math.min(1, t / FALL_TILT_SEC);
  // Đổ chậm lúc đầu rồi nhanh dần như mất thăng bằng (easeInQuad), chạm cỏ thì dừng.
  return FALL_TILT_MAX * u * u;
}

interface Glider {
  readonly pos: MutableVec2;
  readonly vel: MutableVec2;
  readonly x0: number;
  readonly y0: number;
  /** Hướng trượt đơn vị. */
  readonly dx: number;
  readonly dy: number;
  readonly v0: number;
  readonly decel: number;
  /** Vận tốc báo cho hoạt ảnh: người đang ngã báo 0 để clip ngã không bị cắt về chạy. */
  readonly reportVel: boolean;
}

function makeGlider(
  pos: MutableVec2,
  vel: MutableVec2,
  dirX: number,
  dirY: number,
  v0: number,
  decel: number,
  reportVel: boolean,
): Glider {
  const len = Math.hypot(dirX, dirY);
  return {
    pos,
    vel,
    x0: pos.x,
    y0: pos.y,
    dx: len > 1e-6 ? dirX / len : 0,
    dy: len > 1e-6 ? dirY / len : 0,
    v0: len > 1e-6 ? v0 : 0,
    decel,
    reportVel,
  };
}

const clamp = (v: number, lim: number): number => Math.max(-lim, Math.min(lim, v));

export class CutHold {
  /** Trạng thái vẽ trong lúc giữ cảnh (sở hữu riêng, được cập nhật tại chỗ). */
  readonly state: MatchState;
  readonly spec: TransitionSpec;
  readonly foul: FoulSummary | null;
  /** Thời gian đã giữ (giây, không tính lúc tạm dừng). */
  elapsed = 0;
  /** Đã bắt đầu khép stinger hay chưa (do renderer đặt). */
  started = false;

  private readonly gliders: Glider[] = [];
  private readonly ballPos: MutableVec2;
  private readonly ballVel: MutableVec2;
  private readonly ball: { pos: MutableVec2; vel: MutableVec2; z: number; vz: number };
  private readonly ball0: { x: number; y: number; z: number; vz: number; dx: number; dy: number; v0: number };

  constructor(prev: MatchState, curr: MatchState, spec: TransitionSpec) {
    this.spec = spec;
    this.foul = spec.foul;
    const foul = spec.foul;
    const down = new Set<string>();
    if (foul?.victimId) down.add(foul.victimId);
    if (foul?.slide && foul.tacklerId) down.add(foul.tacklerId);

    const recovery: Record<string, number> = {};
    const players: PlayerState[] = prev.players.map((p) => {
      const pos: MutableVec2 = { x: p.pos.x, y: p.pos.y };
      const vel: MutableVec2 = { x: p.vel.x, y: p.vel.y };
      const speed = Math.hypot(p.vel.x, p.vel.y);
      if (down.has(p.id)) {
        // Người ngã: trượt theo hướng đang chạy (đứng yên thì theo hướng mặt), hoạt ảnh nằm sân.
        recovery[p.id] = curr.tick + 1_000_000;
        const moving = speed > 0.3;
        const v0 =
          p.id === foul?.victimId
            ? Math.min(VICTIM_MAX_SLIDE_SPEED, Math.max(VICTIM_MIN_SLIDE_SPEED, speed))
            : speed;
        this.gliders.push(
          makeGlider(
            pos,
            vel,
            moving ? p.vel.x : p.facing.x,
            moving ? p.vel.y : p.facing.y,
            v0,
            VICTIM_SLIDE_DECEL,
            false,
          ),
        );
        vel.x = 0;
        vel.y = 0;
      } else {
        this.gliders.push(makeGlider(pos, vel, p.vel.x, p.vel.y, speed, PLAYER_STOP_DECEL, true));
      }
      return { ...p, pos, vel };
    });

    this.ballPos = { x: prev.ball.pos.x, y: prev.ball.pos.y };
    this.ballVel = { x: prev.ball.vel.x, y: prev.ball.vel.y };
    this.ball = { pos: this.ballPos, vel: this.ballVel, z: prev.ball.z, vz: prev.ball.vz };
    const bSpeed = Math.hypot(prev.ball.vel.x, prev.ball.vel.y);
    this.ball0 = {
      x: prev.ball.pos.x,
      y: prev.ball.pos.y,
      z: prev.ball.z,
      vz: prev.ball.vz,
      dx: bSpeed > 1e-6 ? prev.ball.vel.x / bSpeed : 0,
      dy: bSpeed > 1e-6 ? prev.ball.vel.y / bSpeed : 0,
      v0: bSpeed,
    };

    this.state = {
      ...prev,
      tick: curr.tick,
      // Bàn thắng: bảng tỉ số trong cảnh giữ/replay hiện tỉ số mới.
      score: curr.score,
      players,
      ball: this.ball,
      ballOwnerId: null,
      kickLock: null,
      lastShot: null,
      shotChargeTicks: 0,
      passCharge: null,
      windup: null,
      tackleRecovery: recovery,
      // Không vẽ vòng đếm ngược/thanh lực từ khung cũ.
      actionDeadline: null,
    };
  }

  /** Đã diễn đủ độ trễ, có thể khép stinger. */
  get ready(): boolean {
    return this.elapsed >= this.spec.delaySec;
  }

  /** Góc ngã hiện tại của người bị phạm lỗi (cho cầu thủ khối không có hoạt ảnh). */
  victimTilt(): number {
    return this.foul?.victimId ? fallTilt(this.elapsed) : 0;
  }

  /** Tiến cảnh giữ thêm `dt` giây, cập nhật vị trí/vận tốc tại chỗ. */
  advance(dt: number): void {
    if (dt > 0) this.elapsed += dt;
    const t = this.elapsed;
    for (const g of this.gliders) {
      const d = glideDistance(g.v0, g.decel, t);
      g.pos.x = g.x0 + g.dx * d;
      g.pos.y = g.y0 + g.dy * d;
      if (g.reportVel) {
        const v = glideSpeed(g.v0, g.decel, t);
        g.vel.x = g.dx * v;
        g.vel.y = g.dy * v;
      }
    }
    const b = this.ball0;
    const d = glideDistance(b.v0, BALL_ROLL_DECEL, t);
    const z = Math.max(0, b.z + b.vz * t - 0.5 * GRAVITY * t * t);
    const y = clamp(b.y + b.dy * d, HALF_WIDTH + BALL_OUT_LIMIT);
    // Qua vạch cuối giữa hai cột dọc, dưới xà → dừng ở lưới; còn lại dừng trước biển quảng cáo.
    const inMouth = Math.abs(y) <= GOAL_WIDTH / 2 && z <= GOAL_HEIGHT;
    const x = clamp(b.x + b.dx * d, HALF_LENGTH + (inMouth ? NET_DEPTH : BALL_OUT_LIMIT));
    const stopped = x !== b.x + b.dx * d;
    this.ballPos.x = x;
    this.ballPos.y = y;
    const v = stopped ? 0 : glideSpeed(b.v0, BALL_ROLL_DECEL, t);
    this.ballVel.x = b.dx * v;
    this.ballVel.y = b.dy * v;
    // Bóng bổng rơi xuống cỏ (không nảy lại — chỉ vài trăm ms trước khi cắt cảnh).
    this.ball.z = z;
    this.ball.vz = this.ball.z > 0 ? b.vz - GRAVITY * t : 0;
  }
}

/** Bản sao đứng yên của trạng thái đang giữ (CutHold ghi đè tại chỗ) — để lưu vào buffer phát lại. */
export function snapshotHold(s: MatchState): MatchState {
  return {
    ...s,
    players: s.players.map((p) => ({ ...p, pos: { ...p.pos }, vel: { ...p.vel } })),
    ball: { ...s.ball, pos: { ...s.ball.pos }, vel: { ...s.ball.vel } },
  };
}
