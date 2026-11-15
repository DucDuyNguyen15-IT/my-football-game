/**
 * Tính toán phía hiển thị, thuần (không Three.js): nội suy giữa 2 tick, số áo. Không chứa luật/vật lý.
 */
import type { SquadSlot } from '@pitch/shared';
import { MAX_CHARGE_TICKS, PASS_FULL_CHARGE_TICKS, TICK_RATE } from '@pitch/sim';
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

/**
 * Số áo theo id cầu thủ (`${đội}-${ô}`): người vào thay mang ô sơ đồ của người ra (`slot`) nhưng giữ
 * số áo của mình; người bị thẻ đỏ đã rời sân cũng tra được.
 */
export function playerNumber(playerId: string): number {
  return shirtNumber(playerId.slice(playerId.indexOf('-') + 1) as SquadSlot);
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
  // Hạn ngắn hơn quãng hiển thị thì vòng hiện ngay từ đầu, cung tính trên cả hạn đó.
  const shown = Math.max(
    1,
    Math.min(COUNTDOWN_VISIBLE_SEC * TICK_RATE, d.deadlineTick - d.startTick),
  );
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
