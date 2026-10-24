/**
 * Bộ quần áo + ngoại hình cầu thủ (task 5.21), thuần để test. Model Mixamo chỉ có một lớp vỏ, nên
 * chia vùng theo toạ độ đỉnh ở tư thế chữ T (mét, chân ở y = 0, hai tay dang theo x): áo, quần,
 * tất, da, tóc, giày. Mỗi cầu thủ có màu da / tóc riêng, chọn theo id để trận nào cũng giống nhau.
 */
import type { TeamSide } from '@pitch/sim';
import { COLORS } from './colors';

export const REGION = { shirt: 0, shorts: 1, socks: 2, skin: 3, hair: 4, boots: 5 } as const;
export type Region = (typeof REGION)[keyof typeof REGION];
export const REGION_COUNT = 6;

/** Mốc chia vùng theo model Y Bot cao ~1,8 m: vai ở x ≈ 0,19, cổ tay ≈ 0,74, gối y ≈ 0,53. */
const HAIR_Y = 1.7;
const COLLAR_Y = 1.47;
const WAIST_Y = 0.93;
const SHORTS_HEM_Y = 0.66;
const SOCK_TOP_Y = 0.46;
const BOOT_TOP_Y = 0.09;
const SHOULDER_X = 0.17;
const SLEEVE_END_X = 0.34;

export function bodyRegion(x: number, y: number): Region {
  const ax = Math.abs(x);
  if (ax > SHOULDER_X && y > 1.2) return ax < SLEEVE_END_X ? REGION.shirt : REGION.skin;
  if (y > HAIR_Y) return REGION.hair;
  if (y > COLLAR_Y) return REGION.skin;
  if (y > WAIST_Y) return REGION.shirt;
  if (y > SHORTS_HEM_Y) return REGION.shorts;
  if (y > SOCK_TOP_Y) return REGION.skin;
  if (y > BOOT_TOP_Y) return REGION.socks;
  return REGION.boots;
}

const SKIN_TONES = [0xf1c8a0, 0xe0ac69, 0xc68642, 0x9a6235, 0x6b4226] as const;
const HAIR_COLORS = [0x17120f, 0x2e1d12, 0x5a3a20, 0xb48a4e, 0x0d0d0d] as const;
const LIGHT = 0xf2f2f2;
const BOOTS = 0x111111;

/** Băm chuỗi id → số nguyên không âm (FNV-1a), ổn định giữa các lần chạy. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Màu theo thứ tự REGION. Nhà: quần tối, tất màu áo; Khách: quần + tất sáng; thủ môn áo riêng. */
export function kitColors(team: TeamSide, isKeeper: boolean, playerId: string): number[] {
  const shirt = isKeeper ? COLORS.keeper[team] : COLORS.team[team];
  const shorts = team === 'home' ? COLORS.shorts : LIGHT;
  const socks = team === 'home' ? shirt : LIGHT;
  const h = hash(playerId);
  const skin = SKIN_TONES[h % SKIN_TONES.length]!;
  const hair = HAIR_COLORS[Math.floor(h / SKIN_TONES.length) % HAIR_COLORS.length]!;
  return [shirt, shorts, socks, skin, hair, BOOTS];
}
