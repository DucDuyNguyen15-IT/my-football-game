import { z } from 'zod';
import { Rarity } from '../domain';
import { dataEnvelope } from './common';

const price = z.number().int().min(0);

/**
 * GET /api/v1/config/economy (ARCHITECTURE §4.3 #10): số liệu kinh tế để UI hiển thị — server là
 * nguồn duy nhất. Bảng ép thẻ, thưởng trận bổ sung ở 6.12a/7.2.
 */
export const EconomyConfig = z.object({
  cardSalePrice: z.object({
    bronze: price,
    silver: price,
    gold: price,
    legend: price,
  } satisfies Record<Rarity, typeof price>),
});
export type EconomyConfig = z.infer<typeof EconomyConfig>;

export const EconomyConfigResponse = dataEnvelope(EconomyConfig);
export type EconomyConfigResponse = z.infer<typeof EconomyConfigResponse>;
