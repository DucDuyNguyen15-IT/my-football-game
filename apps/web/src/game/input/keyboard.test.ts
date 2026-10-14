import { describe, expect, it } from 'vitest';
import { NO_INPUT } from '@pitch/sim';
import { CONTROL_KEYS, NO_KEYS, createTapLatch, keysToInput, type KeyState } from './keyboard';

const keys = (held: Partial<KeyState>): KeyState => ({ ...NO_KEYS, ...held });

describe('keysToInput', () => {
  it('không bấm gì → bằng NO_INPUT', () => {
    expect(keysToInput(NO_KEYS)).toEqual(NO_INPUT);
  });

  it('mũi tên → hướng di chuyển theo trục màn hình (y hướng xuống)', () => {
    expect(keysToInput(keys({ right: true })).move).toEqual({ x: 1, y: 0 });
    expect(keysToInput(keys({ left: true })).move).toEqual({ x: -1, y: 0 });
    expect(keysToInput(keys({ up: true })).move).toEqual({ x: 0, y: -1 });
    expect(keysToInput(keys({ down: true })).move).toEqual({ x: 0, y: 1 });
  });

  it('đi chéo được chuẩn hoá về độ dài 1', () => {
    const { move } = keysToInput(keys({ up: true, right: true }));
    expect(Math.hypot(move.x, move.y)).toBeCloseTo(1);
    expect(move.x).toBeCloseTo(Math.SQRT1_2);
    expect(move.y).toBeCloseTo(-Math.SQRT1_2);
  });

  it('hai phím ngược chiều triệt tiêu nhau', () => {
    expect(keysToInput(keys({ left: true, right: true })).move).toEqual({ x: 0, y: 0 });
    expect(keysToInput(keys({ up: true, down: true, right: true })).move).toEqual({ x: 1, y: 0 });
  });

  it('nút hành động map đúng (E sprint, S pass, A lob, D shoot), không có nút switch', () => {
    expect(keysToInput(keys({ sprint: true })).sprint).toBe(true);
    expect(keysToInput(keys({ pass: true })).pass).toBe(true);
    expect(keysToInput(keys({ lob: true })).lob).toBe(true);
    expect(keysToInput(keys({ shoot: true })).shoot).toBe(true);
    const all = keysToInput(keys({ sprint: true, pass: true, lob: true, shoot: true, up: true }));
    expect(all.switch).toBe(false);
  });
});

describe('CONTROL_KEYS', () => {
  it('bộ phím FC Online: mũi tên + E/S/A/D', () => {
    expect(CONTROL_KEYS).toEqual({
      up: 'UP',
      down: 'DOWN',
      left: 'LEFT',
      right: 'RIGHT',
      sprint: 'E',
      pass: 'S',
      lob: 'A',
      shoot: 'D',
    });
  });

  it('không dùng WASD để di chuyển, không dùng Tab', () => {
    const move = [CONTROL_KEYS.up, CONTROL_KEYS.down, CONTROL_KEYS.left, CONTROL_KEYS.right];
    for (const k of ['W', 'A', 'S', 'D']) expect(move).not.toContain(k);
    expect(Object.values(CONTROL_KEYS)).not.toContain('TAB');
  });
});

describe('createTapLatch', () => {
  it('phím nhấn rồi thả giữa hai khung hình vẫn được tính là đang giữ', () => {
    const latch = createTapLatch();
    latch.press('pass');
    expect(latch.sample(NO_KEYS).pass).toBe(true);
  });

  it('chưa chạy tick nào (khung hình ngắn hơn 1 tick) thì giữ lại cú nhấn', () => {
    const latch = createTapLatch();
    latch.press('shoot');
    latch.sample(NO_KEYS);
    expect(latch.sample(NO_KEYS).shoot).toBe(true);
  });

  it('sau khi sim đã chạy tick với cú nhấn thì bỏ, lần sau theo phím thật', () => {
    const latch = createTapLatch();
    latch.press('lob');
    latch.sample(NO_KEYS);
    latch.consume();
    expect(latch.sample(NO_KEYS).lob).toBe(false);
    expect(latch.sample(keys({ lob: true })).lob).toBe(true);
  });
});
