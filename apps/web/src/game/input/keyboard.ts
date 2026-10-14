/**
 * Map phím → `PlayerInput` (DESIGN.md §6.2, bộ phím kiểu FC Online).
 * Thuần, không import Phaser để test được trong Node; scene đọc trạng thái phím rồi gọi `keysToInput`.
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
 * Tên phím theo `Phaser.Input.Keyboard.KeyCodes`. WASD không dùng để di chuyển vì W/A/S/D là phím
 * hành động; không dùng Tab vì nó chuyển focus của trình duyệt.
 */
export const CONTROL_KEYS: Readonly<Record<keyof KeyState, string>> = Object.freeze({
  up: 'UP',
  down: 'DOWN',
  left: 'LEFT',
  right: 'RIGHT',
  sprint: 'E',
  pass: 'S',
  lob: 'A',
  shoot: 'D',
});

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
