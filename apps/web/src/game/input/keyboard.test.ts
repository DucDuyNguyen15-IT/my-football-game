import { describe, expect, it } from 'vitest';
import { NO_INPUT } from '@pitch/sim';
import {
  CONTROL_KEYS,
  NO_KEYS,
  createTapLatch,
  keyForCode,
  keysToInput,
  type KeyState,
} from './keyboard';

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
  it('bộ phím FC Online theo KeyboardEvent.code: mũi tên + E/S/A/D + W/Q', () => {
    expect(CONTROL_KEYS).toEqual({
      up: 'ArrowUp',
      down: 'ArrowDown',
      left: 'ArrowLeft',
      right: 'ArrowRight',
      sprint: 'KeyE',
      pass: 'KeyS',
      lob: 'KeyA',
      shoot: 'KeyD',
      through: 'KeyW',
      modifier: 'KeyQ',
    });
  });

  it('keyForCode tra ngược mã phím → chức năng, phím lạ → null', () => {
    expect(keyForCode('KeyS')).toBe('pass');
    expect(keyForCode('ArrowLeft')).toBe('left');
    expect(keyForCode('KeyW')).toBe('through');
    expect(keyForCode('KeyZ')).toBeNull();
    expect(keyForCode('Escape')).toBeNull();
  });
});

describe('keysToInput — chọc khe', () => {
  it('W = chọc khe, Q giữ kèm = phím phụ (chọc khe bổng)', () => {
    const input = keysToInput(keys({ through: true, modifier: true }));
    expect(input.through).toBe(true);
    expect(input.modifier).toBe(true);
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
