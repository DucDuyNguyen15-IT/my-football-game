/** Vector 2D bất biến (mét hoặc mét/giây). Mọi hàm trả về object mới, không sửa đầu vào. */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const vec2 = (x: number, y: number): Vec2 => ({ x, y });

/** Đóng băng vì được nhiều state dùng chung tham chiếu. */
export const ZERO: Vec2 = Object.freeze(vec2(0, 0));

export const add = (a: Vec2, b: Vec2): Vec2 => vec2(a.x + b.x, a.y + b.y);

export const sub = (a: Vec2, b: Vec2): Vec2 => vec2(a.x - b.x, a.y - b.y);

export const scale = (a: Vec2, k: number): Vec2 => vec2(a.x * k, a.y * k);

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

// Math.sqrt được IEEE-754 làm tròn chính xác, giống nhau trên mọi engine; Math.hypot thì không.
export const length = (a: Vec2): number => Math.sqrt(a.x * a.x + a.y * a.y);

/** Vector đơn vị cùng hướng; vector 0 trả về 0 (không chia cho 0). */
export const normalize = (a: Vec2): Vec2 => {
  const len = length(a);
  return len === 0 ? ZERO : scale(a, 1 / len);
};

/** Giữ hướng, co độ dài về tối đa `max`. */
export const clampLength = (a: Vec2, max: number): Vec2 => {
  const len = length(a);
  return len <= max ? a : scale(a, max / len);
};
