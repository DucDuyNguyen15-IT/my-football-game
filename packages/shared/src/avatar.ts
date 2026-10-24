/**
 * Avatar vector sinh từ `avatar_seed` (DESIGN.md §4): mọi nơi (web, sau này ảnh chia sẻ) vẽ ra cùng
 * một khuôn mặt. Chỉ là dữ liệu — phần vẽ SVG nằm ở `apps/web`. Không dùng ảnh người thật.
 */

export const AVATAR_SKINS = [
  '#f3d2b5',
  '#e5b48f',
  '#c98e64',
  '#a46a43',
  '#7a4a2c',
  '#553220',
] as const;
export const AVATAR_HAIRS = [
  '#1b1410',
  '#3b2414',
  '#6b4423',
  '#a8743a',
  '#d9b26a',
  '#8c8c8c',
] as const;
/** Nửa bề ngang khuôn mặt (đơn vị viewBox 100) cho 3 dáng mặt. */
export const AVATAR_FACE_WIDTHS = [19, 20.5, 22] as const;
export const AVATAR_HAIR_STYLES = 7;
export const AVATAR_BEARDS = 4;

export interface AvatarSpec {
  faceWidth: number;
  skin: string;
  hair: string;
  /** 0 = trọc … 6 = tóc dài. */
  hairStyle: number;
  /** 0 = không râu. */
  beard: number;
  browY: number;
  eyeGap: number;
}

/** FNV-1a 32 bit — biến chuỗi seed thành số cho PRNG. */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function avatarSpec(seed: string): AvatarSpec {
  const rnd = mulberry32(hashSeed(seed));
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!;
  return {
    skin: pick(AVATAR_SKINS),
    hair: pick(AVATAR_HAIRS),
    faceWidth: pick(AVATAR_FACE_WIDTHS),
    hairStyle: Math.floor(rnd() * AVATAR_HAIR_STYLES),
    beard: Math.floor(rnd() * AVATAR_BEARDS),
    browY: Math.round((41 + rnd() * 1.5) * 10) / 10,
    eyeGap: Math.round((7 + rnd() * 1.5) * 10) / 10,
  };
}
