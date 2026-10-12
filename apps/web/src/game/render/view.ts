/**
 * Tính toán phía hiển thị, thuần (không Phaser): nội suy giữa 2 tick, số áo. Không chứa luật/vật lý.
 */
import type { SquadSlot } from '@pitch/shared';
import type { Vec2 } from '@pitch/sim';

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
