import { z } from 'zod';
import { PlayerStats, Position, Rarity } from '../domain';
import { dataEnvelope, Id } from './common';

/** Thẻ người chơi sở hữu (ARCHITECTURE §4.3 #7). `effectiveStats` đã áp cấp + (và phạt sai vị trí nếu đang đá chính). */
export const PlayerCard = z.object({
  id: Id,
  cardId: Id,
  level: z.number().int().min(0).max(5),
  luck: z.number().int().min(0).max(100),
  inSquad: z.boolean(),
  effectiveStats: PlayerStats,
});
export type PlayerCard = z.infer<typeof PlayerCard>;

/** Sắp xếp kho: `ovr` theo OVR hiệu lực, `acquired` theo lúc nhận; tiền tố `-` là giảm dần. */
export const PlayerCardSort = z.enum(['ovr', '-ovr', 'acquired', '-acquired']);
export type PlayerCardSort = z.infer<typeof PlayerCardSort>;

/** Query của GET /api/v1/player-cards. Mặc định: mới nhận trước. */
export const PlayerCardsQuery = z.object({
  position: Position.optional(),
  rarity: Rarity.optional(),
  sort: PlayerCardSort.default('-acquired'),
});
export type PlayerCardsQuery = z.input<typeof PlayerCardsQuery>;

export const PlayerCardsResponse = dataEnvelope(z.array(PlayerCard));
export type PlayerCardsResponse = z.infer<typeof PlayerCardsResponse>;

/** Số thẻ tối đa mỗi lần bán (ARCHITECTURE §4.3 #8). */
export const SELL_MAX_CARDS = 50;

/** POST /api/v1/player-cards/sell — tất cả hoặc không. */
export const SellCardsRequest = z.object({
  playerCardIds: z
    .array(Id)
    .min(1)
    .max(SELL_MAX_CARDS)
    .refine((ids) => new Set(ids).size === ids.length, 'Trùng thẻ trong danh sách bán'),
});
export type SellCardsRequest = z.infer<typeof SellCardsRequest>;

export const SellCardsResult = z.object({
  coinsGained: z.number().int().min(0),
  balance: z.number().int().min(0),
});
export type SellCardsResult = z.infer<typeof SellCardsResult>;

export const SellCardsResponse = dataEnvelope(SellCardsResult);
export type SellCardsResponse = z.infer<typeof SellCardsResponse>;

/** POST /api/v1/player-cards/:id/upgrade — kèm header `Idempotency-Key: <uuid>` (bắt buộc). F10. */
export const UpgradeCardRequest = z.object({ materialId: Id });
export type UpgradeCardRequest = z.infer<typeof UpgradeCardRequest>;

/**
 * Kết quả ép: `level`/`luck` là trạng thái thẻ **sau** lần ép, `rate` là tỉ lệ đã áp (cơ bản + may
 * mắn), `fee` là phí đã trừ. Gửi lại cùng key → nhận lại nguyên văn kết quả này.
 */
export const UpgradeCardResult = z.object({
  success: z.boolean(),
  level: z.number().int().min(0).max(5),
  luck: z.number().int().min(0).max(100),
  rate: z.number().int().min(0).max(100),
  fee: z.number().int().min(0),
  balance: z.number().int().min(0),
});
export type UpgradeCardResult = z.infer<typeof UpgradeCardResult>;

export const UpgradeCardResponse = dataEnvelope(UpgradeCardResult);
export type UpgradeCardResponse = z.infer<typeof UpgradeCardResponse>;
