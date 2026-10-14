/**
 * Map phím → `PlayerInput` (DESIGN.md §6.2, bộ phím kiểu FC Online).
 * Thuần, không phụ thuộc DOM/Three.js để test được trong Node; renderer gom sự kiện phím rồi gọi `keysToInput`.
 */
import { NO_INPUT, type PlayerInput } from '@pitch/sim';

/** Phím đang giữ, theo tên chức năng. */
export interface KeyState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  pass: boolean;
  lob: boolean;
  shoot: boolean;
}

export const NO_KEYS: KeyState = Object.freeze({
  up: false,
  down: false,
  left: false,
  right: false,
  sprint: false,
  pass: false,
  lob: false,
  shoot: false,
});

/**
 * Mã phím theo `KeyboardEvent.code` (vị trí phím, không phụ thuộc bố cục/Caps Lock). WASD không dùng
 * để di chuyển vì W/A/S/D là phím hành động; không dùng Tab vì nó chuyển focus của trình duyệt.
 */
export const CONTROL_KEYS: Readonly<Record<keyof KeyState, string>> = Object.freeze({
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  sprint: 'KeyE',
  pass: 'KeyS',
  lob: 'KeyA',
  shoot: 'KeyD',
});

const BY_CODE = new Map(
  (Object.entries(CONTROL_KEYS) as [keyof KeyState, string][]).map(([name, code]) => [code, name]),
);

/** Chức năng của một phím, null nếu không phải phím điều khiển. */
export function keyForCode(code: string): keyof KeyState | null {
  return BY_CODE.get(code) ?? null;
}

/**
 * Hướng di chuyển theo trục màn hình: x sang phải, y xuống dưới — trùng trục sim vì scene vẽ
 * x sim theo chiều ngang, y sim theo chiều dọc. Đi chéo được chuẩn hoá về độ dài 1.
 */
export function keysToInput(keys: KeyState): PlayerInput {
  const dx = Number(keys.right) - Number(keys.left);
  const dy = Number(keys.down) - Number(keys.up);
  const len = Math.hypot(dx, dy);
  const move = len > 0 ? { x: dx / len, y: dy / len } : NO_INPUT.move;
  return {
    move,
    pass: keys.pass,
    lob: keys.lob,
    shoot: keys.shoot,
    sprint: keys.sprint,
    switch: false,
  };
}

/**
 * Nhớ phím đã nhấn cho tới khi sim chạy được ít nhất một tick: nhấn-thả nhanh trong cùng một khung
 * hình (lúc đọc `isDown` đã nhả) vẫn thành một lần bấm, sim thấy "giữ" đúng một tick rồi "thả".
 */
export function createTapLatch() {
  const tapped = new Set<keyof KeyState>();
  return {
    press(key: keyof KeyState): void {
      tapped.add(key);
    },
    /** Phím đang giữ cộng với phím đã nhấn mà chưa được tick nào dùng. */
    sample(held: KeyState): KeyState {
      if (tapped.size === 0) return held;
      const merged = { ...held };
      for (const key of tapped) merged[key] = true;
      return merged;
    },
    /** Gọi sau khi đã chạy ít nhất một tick với kết quả `sample`. */
    consume(): void {
      tapped.clear();
    },
  };
}
