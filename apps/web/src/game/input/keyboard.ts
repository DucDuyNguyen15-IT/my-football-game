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
