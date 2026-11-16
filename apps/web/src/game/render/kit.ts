/**
 * Bộ quần áo + ngoại hình cầu thủ (task 5.21). Model Mixamo chỉ có một lớp vỏ, nên chia vùng theo
 * toạ độ ở tư thế chữ T (mét, chân ở y = 0, hai tay dang theo x): áo, quần, tất, da, tóc, giày.
 * Màu da và tóc lấy từ `avatarSpec` để khớp với miniface (`avatar_seed` của thẻ, hoặc id nếu chưa
 * có thẻ).
 */
import { avatarSpec, type Card, type MatchPlayerSetup } from '@pitch/shared';
import type { TeamSide } from '@pitch/sim';
import { COLORS } from './colors';

export const REGION = { shirt: 0, shorts: 1, socks: 2, skin: 3, hair: 4, boots: 5 } as const;
export type Region = (typeof REGION)[keyof typeof REGION];
export const REGION_COUNT = 6;

/** Mốc chia vùng theo model Y Bot cao ~1,8 m: vai ở x ≈ 0,19, cổ tay ≈ 0,74, gối y ≈ 0,53. */
export const KIT_REGION_BOUNDS = {
  hairY: 1.7,
  hairBackSlope: 0.75,
  hairBackMinY: 1.62,
  headY: 1.55,
  collarY: 1.465,
  neckRadius: 0.078,
  neckCenterZ: 0.005,
  neckScaleZ: 0.85,
  waistY: 0.93,
  shortsHemY: 0.66,
  sockTopY: 0.46,
  bootTopY: 0.1,
  shoulderX: 0.17,
  sleeveArmMinY: 1.2,
  sleeveEndX: 0.34,
} as const;

export function bodyRegion(x: number, y: number, z = 0): Region {
  const m = KIT_REGION_BOUNDS;
  const ax = Math.abs(x);
  if (ax > m.shoulderX && y > m.sleeveArmMinY) {
    return ax < m.sleeveEndX ? REGION.shirt : REGION.skin;
  }
  const hairLineY = Math.max(m.hairBackMinY, m.hairY + Math.min(0, z) * m.hairBackSlope);
  if (y > hairLineY) return REGION.hair;
  const neckDist = Math.hypot(x, (z - m.neckCenterZ) * m.neckScaleZ);
  if (y > m.headY || (y > m.collarY && neckDist < m.neckRadius)) return REGION.skin;
  if (y > m.waistY) return REGION.shirt;
  if (y > m.shortsHemY) return REGION.shorts;
  if (y > m.sockTopY) return REGION.skin;
  if (y > m.bootTopY) return REGION.socks;
  return REGION.boots;
}

const LIGHT = 0xf2f2f2;
const BOOTS = 0x111111;

const hexToNumber = (hex: string): number => Number.parseInt(hex.slice(1), 16);

/**
 * Màu theo thứ tự REGION. Nhà: quần tối, tất màu áo; Khách: quần + tất sáng; thủ môn áo riêng.
 * Da và tóc dùng `avatarSpec(avatarSeed ?? playerId)` để khớp với miniface của thẻ.
 */
export function kitColors(
  team: TeamSide,
  isKeeper: boolean,
  playerId: string,
  avatarSeed?: string,
): number[] {
  const shirt = isKeeper ? COLORS.keeper[team] : COLORS.team[team];
  const shorts = team === 'home' ? COLORS.shorts : LIGHT;
  const socks = team === 'home' ? shirt : LIGHT;
  const { skin, hair } = avatarSpec(avatarSeed ?? playerId);
  return [shirt, shorts, socks, hexToNumber(skin), hexToNumber(hair), BOOTS];
}

/** Ánh xạ `playerId` (`home-P1`, `away-B1`, …) → `avatarSeed` của thẻ trong đội hình hai đội. */
export function avatarSeedsForMatch(
  teams: {
    home: { players: readonly Pick<MatchPlayerSetup, 'slot' | 'cardId'>[] };
    away: { players: readonly Pick<MatchPlayerSetup, 'slot' | 'cardId'>[] };
  },
  catalog?: ReadonlyMap<string, Pick<Card, 'avatarSeed'>>,
): Map<string, string> {
  const seeds = new Map<string, string>();
  if (!catalog) return seeds;
  for (const side of ['home', 'away'] as const) {
    for (const p of teams[side].players) {
      if (!p.cardId) continue;
      const card = catalog.get(p.cardId);
      if (card) seeds.set(`${side}-${p.slot}`, card.avatarSeed);
    }
  }
  return seeds;
}
