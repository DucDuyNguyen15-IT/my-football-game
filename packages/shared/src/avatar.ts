/**
 * Avatar vector sinh từ `avatar_seed` (DESIGN.md §4): mọi nơi (web, sau này ảnh chia sẻ) vẽ ra cùng
 * một khuôn mặt. Chỉ là dữ liệu — phần vẽ SVG nằm ở `apps/web`. Không dùng ảnh người thật.
 */

export const AVATAR_SKINS = [
  '#f4d4b8',
  '#e6b690',
  '#cc9166',
  '#a66c44',
  '#7d4c2e',
  '#583522',
] as const;

export const AVATAR_HAIRS = [
  '#181310',
  '#362112',
  '#663f20',
  '#9e6a32',
  '#d6ae62',
  '#8a9098',
] as const;

/** Nửa bề ngang khuôn mặt tại gò má (đơn vị viewBox 100) cho 3 dáng mặt cân đối với vai. */
export const AVATAR_FACE_WIDTHS = [17.5, 18.8, 20] as const;
export const AVATAR_HAIR_STYLES = 8;
export const AVATAR_BEARDS = 5;
export const AVATAR_MOUTH_STYLES = 3;
export const AVATAR_JAW_RATIOS = [0.76, 0.8, 0.84] as const;

export interface AvatarSpec {
  faceWidth: number;
  skin: string;
  hair: string;
  /** 0 = cạo sát/trọc thể thao … 7 = búi cao/tóc dài. */
  hairStyle: number;
  /** 0 = không râu, 1 = quai nón, 2 = ria mép, 3 = goatee cằm, 4 = quai hàm mảnh. */
  beard: number;
  browY: number;
  eyeGap: number;
  /** Độ nghiêng chân mày (-1.0 .. 1.2): dương = quyết đoán, âm = điềm tĩnh. */
  browTilt: number;
  /** 0 = mỉm cười nhẹ, 1 = điềm tĩnh, 2 = cười tự tin. */
  mouthStyle: number;
  /** Tỉ lệ độ rộng góc hàm so với gò má (0.76 = mặt thon, 0.8 = chuẩn, 0.84 = hàm vuông). */
  jawRatio: number;
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
    browY: Math.round((36.4 + rnd() * 1.4) * 10) / 10,
    eyeGap: Math.round((7.3 + rnd() * 1.0) * 10) / 10,
    browTilt: Math.round((-0.8 + rnd() * 2.0) * 10) / 10,
    mouthStyle: Math.floor(rnd() * AVATAR_MOUTH_STYLES),
    jawRatio: pick(AVATAR_JAW_RATIOS),
  };
}
