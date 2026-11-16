/**
 * Tính toán phía hiển thị, thuần (không Three.js): nội suy giữa 2 tick, số áo. Không chứa luật/vật lý.
 */
import type { SquadSlot } from '@pitch/shared';
import {
  attackSign,
  BALL_RADIUS,
  CONTACT_RESTARTS,
  HALF_LENGTH,
  kickingFoot,
  MAX_CHARGE_TICKS,
  PASS_FULL_CHARGE_TICKS,
  MIN_SHOT_POWER,
  penaltyAimZ,
  penaltyRadius,
  restartContact,
  shotPower,
  TICK_RATE,
} from '@pitch/sim';
import type { MatchState, Vec2 } from '@pitch/sim';

/**
 * Dịch chuyển trong 1 tick lớn hơn mức này (m) là dịch chuyển tức thời (đặt bóng, xếp lại đội hình
 * khi giao bóng) — vẽ thẳng vị trí mới thay vì trượt qua sân. Bóng sút mạnh nhất chỉ đi ~0.6 m/tick.
 */
export const SNAP_DISTANCE = 2;

/** Vị trí hiển thị giữa tick trước (`alpha` = 0) và tick hiện tại (`alpha` = 1). */
export function lerpPos(prev: Vec2, curr: Vec2, alpha: number): Vec2 {
  const dx = curr.x - prev.x;
  const dy = curr.y - prev.y;
  if (dx * dx + dy * dy > SNAP_DISTANCE * SNAP_DISTANCE) return curr;
  return { x: prev.x + dx * alpha, y: prev.y + dy * alpha };
}

export function lerp(a: number, b: number, alpha: number): number {
  return a + (b - a) * alpha;
}

/** Số áo hiển thị: thủ môn 1, đá chính P1–P6 là 2–7, dự bị B1–B5 là 8–12 (dữ liệu demo không có số áo). */
export function shirtNumber(slot: SquadSlot): number {
  if (slot === 'GK') return 1;
  const n = Number(slot.slice(1));
  return slot.startsWith('P') ? n + 1 : n + 7;
}

/** Ô gốc trong đội hình (`GK`, `P1`…`P6`, `B1`…`B5`) rút từ id cầu thủ (`${đội}-${ô}`). */
export const originSlot = (playerId: string): SquadSlot =>
  playerId.slice(playerId.indexOf('-') + 1) as SquadSlot;

/**
 * Số áo theo id cầu thủ (`${đội}-${ô}`): người vào thay mang ô sơ đồ của người ra (`slot`) nhưng giữ
 * số áo của mình; người bị thẻ đỏ đã rời sân cũng tra được.
 */
export function playerNumber(playerId: string): number {
  return shirtNumber(originSlot(playerId));
}

export interface ChargeMeter {
  /** Thanh sút (D), chuyền sệt (S) / chuyền bổng (A) hay chọc khe (W / Q+W). */
  kind: 'shot' | 'ground' | 'lob' | 'through';
  /** Độ đầy 0…1. */
  fill: number;
}

/** Thanh lực trên đầu cầu thủ đang giữ nút sút/chuyền (DESIGN.md §6.2); null khi không nạp. */
export function chargeMeter(
  state: Pick<MatchState, 'shotChargeTicks' | 'passCharge'>,
): ChargeMeter | null {
  if (state.passCharge) {
    const fill = Math.min(1, state.passCharge.ticks / PASS_FULL_CHARGE_TICKS);
    return { kind: state.passCharge.through ? 'through' : state.passCharge.kind, fill };
  }
  if (state.shotChargeTicks > 0) {
    return { kind: 'shot', fill: Math.min(1, state.shotChargeTicks / MAX_CHARGE_TICKS) };
  }
  return null;
}

/** Vòng đếm ngược chỉ hiện trong chừng này giây cuối trước hạn chót; trước đó không hiện gì. */
export const COUNTDOWN_VISIBLE_SEC = 5;

export interface CountdownRing {
  /** Cầu thủ mang vòng đếm ngược trên đầu. */
  playerId: string;
  /** Số giây còn lại, làm tròn lên: COUNTDOWN_VISIBLE_SEC → 1 (0 khi đã hết hạn). */
  seconds: number;
  /**
   * Phần đã trôi của quãng hiển thị 0…1 = phần viền đã chuyển đen (theo chiều kim đồng hồ từ 12
   * giờ): 0 lúc vòng vừa hiện (đầy vàng), 1 lúc hết hạn (cả vòng đen).
   */
  elapsed: number;
}

/**
 * Vòng đếm ngược trên đầu thủ môn đang ôm bóng / người đá phạt, phạt đền của đội người chơi — đọc
 * hạn chót sim đã đặt (`MatchState.actionDeadline`). null khi không có hạn chót hoặc còn hơn
 * COUNTDOWN_VISIBLE_SEC giây.
 */
export function countdownRing(
  state: Pick<MatchState, 'actionDeadline' | 'tick'>,
): CountdownRing | null {
  const d = state.actionDeadline;
  if (!d) return null;
  const left = Math.max(0, d.deadlineTick - state.tick);
  const shown = COUNTDOWN_VISIBLE_SEC * TICK_RATE;
  if (left > shown) return null;
  return {
    playerId: d.playerId,
    seconds: Math.ceil(left / TICK_RATE),
    elapsed: Math.min(1, Math.max(0, 1 - left / shown)),
  };
}

/** Số nấc vẽ lại viền vòng đếm ngược trên cả vòng (đủ mịn, không vẽ lại canvas mỗi khung hình). */
export const COUNTDOWN_ARC_STEPS = 180;

/** Nấc viền đen hiện tại (0…COUNTDOWN_ARC_STEPS); hết giờ mới đủ vòng. */
export const countdownArcStep = (elapsed: number): number =>
  elapsed >= 1 ? COUNTDOWN_ARC_STEPS : Math.floor(Math.max(0, elapsed) * COUNTDOWN_ARC_STEPS);

/** Điểm chạm đang chọn khi đội người chơi đá phạt / phạt góc (widget góc màn hình); không thì null. */
export function setPieceContact(state: Pick<MatchState, 'restart' | 'autopilot'>): Vec2 | null {
  const r = state.restart;
  if (!r || r.team !== 'home' || state.autopilot || !CONTACT_RESTARTS.has(r.type)) return null;
  return restartContact(r);
}

/** Chân người đá tình huống cố định sẽ dùng (hai chân thì theo nửa sân đặt bóng). */
export function setPieceFoot(
  state: Pick<MatchState, 'restart' | 'players' | 'half'>,
): 'right' | 'left' {
  const r = state.restart;
  if (!r) return 'right';
  const taker = state.players.find((p) => p.id === r.takerId);
  return kickingFoot(taker?.foot, r.spot, attackSign(r.team, state.half));
}

export interface PenaltyRing {
  /** Tâm trên vạch cuối (toạ độ sân x, y; `z` độ cao tâm bóng, m). */
  x: number;
  y: number;
  z: number;
  radius: number;
  /** Màu vòng (hsl): lực nhẹ xanh lá → vàng → cam → hết lực đỏ. */
  color: string;
}

/** Màu vòng phạt đền theo lực: hue 120 (xanh lá) giảm đều về 0 (đỏ) khi lực từ nhỏ nhất tới hết lực. */
export function penaltyRingColor(power: number): string {
  const t = Math.min(1, Math.max(0, (power - MIN_SHOT_POWER) / (1 - MIN_SHOT_POWER)));
  return `hsl(${Math.round(120 * (1 - t))} 90% 55%)`;
}

/**
 * Vòng ngắm phạt đền của người chơi: hiện từ lúc giữ D (lực đang nạp, tâm giữa khung) tới hết pha
 * lấy đà (lực đã chốt, tâm người chơi dời). Lực càng mạnh vòng càng cao và to. Không thì null.
 */
export function penaltyRing(
  state: Pick<MatchState, 'restart' | 'players' | 'shotChargeTicks' | 'autopilot'>,
): PenaltyRing | null {
  const r = state.restart;
  if (!r || r.type !== 'penalty' || r.team !== 'home' || state.autopilot) return null;
  const run = r.penaltyRunUp;
  if (!run && state.shotChargeTicks <= 0) return null;
  const taker = state.players.find((p) => p.id === r.takerId);
  if (!taker) return null;
  const power = run ? run.power : shotPower(state.shotChargeTicks);
  return {
    x: Math.sign(r.spot.x) * HALF_LENGTH,
    y: run ? run.y : 0,
    z: penaltyAimZ(power) + BALL_RADIUS,
    radius: penaltyRadius(taker, power),
    color: penaltyRingColor(power),
  };
}

/** Điểm chạm cách tâm bóng dưới mức này (theo bán kính) vẫn tính là chạm giữa. */
export const CONTACT_CENTRE = 0.25;

/**
 * Tên cú đá theo điểm chạm (x phải, y trên; nhìn từ sau lưng người đá). Chân phải chạm bên phải bóng
 * là má trong, bên trái là má ngoài; chân trái ngược lại.
 */
export function contactLabel(c: Vec2, foot: 'right' | 'left' = 'right'): string {
  if (Math.hypot(c.x, c.y) < CONTACT_CENTRE) return 'Sút căng';
  if (Math.abs(c.x) >= Math.abs(c.y))
    return c.x > 0 === (foot === 'right') ? 'Sút xoáy bằng má trong' : 'Sút xoáy bằng má ngoài';
  return c.y < 0 ? 'Sút bổng' : 'Đá sệt';
}
