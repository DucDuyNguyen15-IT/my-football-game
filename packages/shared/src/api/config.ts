import { z } from 'zod';
import { Rarity } from '../domain';
import { dataEnvelope } from './common';

const price = z.number().int().min(0);
const percent = z.number().int().min(0).max(100);

/** Một bậc ép thẻ (PRD §6.5): ép từ cấp `toLevel - 1` lên `toLevel`. */
export const UpgradeStep = z.object({
  toLevel: z.number().int().min(1),
  /** Tỉ lệ thành công cơ bản (%), chưa cộng may mắn. */
  baseRate: percent,
  /** Phí xu trước khi nhân hệ số độ hiếm của thẻ được ép. */
  baseFee: z.number().int().min(1),
});
export type UpgradeStep = z.infer<typeof UpgradeStep>;

/**
 * Bảng ép thẻ (PRD §6.5, F10). Tỉ lệ thật = min(100, `baseRate` + may mắn của thẻ); phí =
 * `baseFee` × `rarityFeeMultiplier[độ hiếm thẻ được ép]`; trượt → may mắn + `luckPerFail`.
 */
export const UpgradeConfig = z.object({
  maxLevel: z.number().int().min(1),
  luckPerFail: percent,
  /** `steps[i]` là bậc ép từ cấp `i` lên `i + 1`. */
  steps: z.array(UpgradeStep),
  rarityFeeMultiplier: z.object({
    bronze: z.number().int().min(1),
    silver: z.number().int().min(1),
    gold: z.number().int().min(1),
    legend: z.number().int().min(1),
  }),
});
export type UpgradeConfig = z.infer<typeof UpgradeConfig>;

/**
 * GET /api/v1/config/economy (ARCHITECTURE §4.3 #10): số liệu kinh tế để UI hiển thị — server là
 * nguồn duy nhất. Thưởng trận bổ sung ở 7.2.
 */
export const EconomyConfig = z.object({
  cardSalePrice: z.object({
    bronze: price,
    silver: price,
    gold: price,
    legend: price,
  } satisfies Record<Rarity, typeof price>),
  upgrade: UpgradeConfig,
});
export type EconomyConfig = z.infer<typeof EconomyConfig>;

export const EconomyConfigResponse = dataEnvelope(EconomyConfig);
export type EconomyConfigResponse = z.infer<typeof EconomyConfigResponse>;
