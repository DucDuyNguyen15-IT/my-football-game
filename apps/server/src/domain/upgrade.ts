// Luật ép thẻ thuần (PRD §6.5, F10) — không đụng DB; random nhận qua `Rng` để test bằng PRNG có seed.
import { Rarity } from '@pitch/shared';
import { UPGRADE } from '../config/economy';
import type { Rng } from './rng';

function stepAt(level: number) {
  const step = UPGRADE.steps[level];
  if (!step) throw new Error(`Không có bậc ép từ cấp ${level}`);
  return step;
}

/** Tỉ lệ thành công (%) khi ép thẻ đang ở `level` với `luck` điểm may mắn: cơ bản + may mắn, kẹp 100. */
export function upgradeRate(level: number, luck: number): number {
  return Math.min(100, stepAt(level).baseRate + luck);
}

/** Phí xu ép thẻ đang ở `level`: phí cơ bản × hệ số độ hiếm của thẻ được ép. */
export function upgradeFee(level: number, rarity: Rarity): number {
  return stepAt(level).baseFee * UPGRADE.rarityFeeMultiplier[rarity];
}

/** Nguyên liệu hợp lệ khi cùng độ hiếm trở lên so với thẻ được ép. */
export function isValidMaterial(target: Rarity, material: Rarity): boolean {
  const order = Rarity.options;
  return order.indexOf(material) >= order.indexOf(target);
}

export interface UpgradeRoll {
  success: boolean;
  /** Tỉ lệ đã áp (%). */
  rate: number;
  /** Trạng thái thẻ sau lần ép. */
  level: number;
  luck: number;
}

/**
 * Quay một lần ép: thành công khi `rng(100) < rate` → lên một cấp, may mắn về 0; trượt → giữ cấp,
 * may mắn + `luckPerFail` (tối đa 100).
 */
export function rollUpgrade(card: { level: number; luck: number }, rng: Rng): UpgradeRoll {
  const rate = upgradeRate(card.level, card.luck);
  if (rng(100) < rate) return { success: true, rate, level: card.level + 1, luck: 0 };
  return {
    success: false,
    rate,
    level: card.level,
    luck: Math.min(100, card.luck + UPGRADE.luckPerFail),
  };
}
