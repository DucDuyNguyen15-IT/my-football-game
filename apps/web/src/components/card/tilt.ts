import { prefersReducedMotion } from '../../features/shop/reveal';

export interface CardTilt {
  rx: number;
  ry: number;
}

export interface TiltRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Tính góc nghiêng 3D nhẹ (≤ 8°) theo vị trí con trỏ trong thẻ (nguyên tắc 11). */
export function computeCardTilt(
  clientX: number,
  clientY: number,
  rect: TiltRect,
  maxDeg = 7,
): CardTilt {
  if (rect.width <= 0 || rect.height <= 0 || maxDeg <= 0) return { rx: 0, ry: 0 };
  const limit = Math.min(8, maxDeg);
  const nx = clamp(((clientX - rect.left) / rect.width - 0.5) * 2, -1, 1);
  const ny = clamp(((clientY - rect.top) / rect.height - 0.5) * 2, -1, 1);
  return {
    rx: round2(-ny * limit) || 0,
    ry: round2(nx * limit) || 0,
  };
}

/** Chỉ bật nghiêng thẻ trên thiết bị có hover chuột và không bật reduced-motion. */
export function canHoverTilt(): boolean {
  if (prefersReducedMotion()) return false;
  return (
    typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches
  );
}
